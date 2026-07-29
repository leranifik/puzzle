import { cookies, headers } from "next/headers";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { nanoid } from "nanoid";
import { prisma } from "./prisma";
import { validateInitData } from "./telegram";

const COOKIE = "ph_player";
const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

function sign(value: string) {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function encodeSession(playerId: string) {
  return `${playerId}.${sign(playerId)}`;
}

export function decodeSession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const id = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(id);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return id;
}

/**
 * Cookie-independent authentication for Telegram Mini Apps.
 *
 * web.telegram.org runs the app in a cross-site iframe where browsers may
 * refuse to store ANY third-party cookie (even SameSite=None) — so the
 * client sends `Authorization: tma <initData>` with every API call and we
 * verify the HMAC signature per request (cheap: two sha256 ops).
 * Returns the player linked to the Telegram account, creating it on first
 * contact.
 */
async function resolveTmaPlayer() {
  const store = await headers();
  const auth = store.get("authorization");
  if (!auth?.startsWith("tma ")) return null;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;

  const tgUser = validateInitData(auth.slice(4), botToken);
  if (!tgUser) return null;

  const telegramId = String(tgUser.id);
  const existing = await prisma.player.findUnique({ where: { telegramId } });
  if (existing) return existing;

  const displayName =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
    tgUser.username ||
    "Player";
  return prisma.player.create({
    data: { id: nanoid(16), name: displayName, telegramId },
  });
}

/** Reads the player id from the session cookie or the tma header. */
export async function getPlayerId(): Promise<string | null> {
  const store = await cookies();
  const fromCookie = decodeSession(store.get(COOKIE)?.value);
  if (fromCookie) return fromCookie;
  const tma = await resolveTmaPlayer();
  return tma?.id ?? null;
}

/**
 * Returns the current player, creating a guest profile on first contact.
 * Resolution order: session cookie → Telegram initData header → new guest.
 * Also refreshes the cookie so long-lived guests are not lost.
 */
export async function ensurePlayer() {
  const store = await cookies();
  const existingId = decodeSession(store.get(COOKIE)?.value);

  if (existingId) {
    const player = await prisma.player.findUnique({ where: { id: existingId } });
    if (player) return player;
  }

  const tma = await resolveTmaPlayer();
  if (tma) {
    // Try to set the cookie too (works in the Telegram app; silently
    // dropped by browsers in a cookie-blocked iframe — that's fine, the
    // header keeps authenticating every request).
    await setSessionCookie(tma.id);
    return tma;
  }

  const player = await prisma.player.create({
    data: { id: nanoid(16), name: "Guest" },
  });
  await setSessionCookie(player.id);
  return player;
}

/**
 * Cookie attributes.
 *
 * Telegram Web (web.telegram.org) runs the Mini App in a CROSS-SITE iframe:
 * SameSite=Lax cookies are silently rejected there, so in production the
 * session cookie must be SameSite=None; Secure. The CSRF protection that
 * Lax used to give is replaced by the Origin check in src/proxy.ts.
 *
 * Set INSECURE_COOKIES=1 only when serving over plain HTTP without TLS
 * (Secure cookies would be dropped) — note that Telegram requires HTTPS
 * for Mini Apps anyway.
 */
function cookieAttributes() {
  const crossSite =
    process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1";
  return crossSite
    ? ({ sameSite: "none", secure: true } as const)
    : ({ sameSite: "lax", secure: false } as const);
}

export async function setSessionCookie(playerId: string) {
  const store = await cookies();
  store.set(COOKIE, encodeSession(playerId), {
    httpOnly: true,
    ...cookieAttributes(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE);
}

/* ---------------- password hashing (scrypt, no extra deps) ---------------- */

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}
