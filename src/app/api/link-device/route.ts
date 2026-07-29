import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { ensurePlayer } from "@/lib/session";

export const LINK_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * POST /api/link-device — issue a short-lived, single-use device link
 * for the current player. Any previously issued unused links are revoked,
 * so at most one link is active at a time.
 */
export async function POST(request: NextRequest) {
  const player = await ensurePlayer();

  // Hygiene: revoke this player's unused links + drop globally expired rows.
  await prisma.linkToken.deleteMany({
    where: {
      OR: [
        { playerId: player.id, usedAt: null },
        { expiresAt: { lt: new Date() } },
      ],
    },
  });

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + LINK_TTL_MS);
  await prisma.linkToken.create({
    data: { token, playerId: player.id, expiresAt },
  });

  const body = (await request.json().catch(() => ({}))) as { locale?: string };
  const locale = body.locale === "ru" || body.locale === "en" ? body.locale : "en";

  const url = `${request.nextUrl.origin}/${locale}/link/${token}`;
  return NextResponse.json({ url, token, expiresAt: expiresAt.toISOString() });
}
