import { NextRequest, NextResponse } from "next/server";
import { defaultLocale, isLocale, locales } from "@/i18n/config";

function detectLocale(request: NextRequest): string {
  // 1. Previously chosen locale (cookie set by the locale switcher)
  const cookie = request.cookies.get("ph_locale")?.value;
  if (cookie && isLocale(cookie)) return cookie;

  // 2. Browser Accept-Language
  const header = request.headers.get("accept-language") ?? "";
  const preferred = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);

  for (const { tag } of preferred) {
    const base = tag.split("-")[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

/**
 * CSRF guard for mutating API requests.
 *
 * The session cookie is SameSite=None in production (required for the
 * Telegram Web iframe), so browsers would attach it to cross-site requests.
 * We therefore require the Origin of mutating requests to match the site
 * itself. Non-browser clients (curl, uptime monitors) send no Origin and
 * pass through; browsers always send Origin on cross-site POST/PUT/DELETE.
 *
 * Behind nginx the standalone server believes it runs on 127.0.0.1:3000,
 * so the public host must be taken from X-Forwarded-Host / Host headers,
 * NOT from request.nextUrl.
 */
function isCsrfSafe(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return true;

  const origin = request.headers.get("origin");
  if (!origin) return true; // non-browser client

  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const candidates = new Set(
    [forwarded, request.headers.get("host"), request.nextUrl.host].filter(Boolean),
  );

  try {
    return candidates.has(new URL(origin).host);
  } catch {
    return false;
  }
}

export default function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // --- API: CSRF check only, no locale handling -----------------------------
  if (pathname.startsWith("/api/")) {
    if (!isCsrfSafe(request)) {
      return NextResponse.json({ error: "cross_origin_rejected" }, { status: 403 });
    }
    return NextResponse.next();
  }

  // --- pages: locale redirect ------------------------------------------------
  const hasLocale = locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`),
  );
  if (hasLocale) return NextResponse.next();

  const locale = detectLocale(request);
  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\..*).*)"],
};
