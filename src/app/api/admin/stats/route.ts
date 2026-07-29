import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function checkAdminKey(request: NextRequest): boolean {
  const expected = process.env.ADMIN_KEY;
  if (!expected) return false;
  const got =
    request.headers.get("x-admin-key") ??
    request.nextUrl.searchParams.get("key") ??
    "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);

/**
 * GET /api/admin/stats — the numbers behind the admin dashboard.
 * Auth: X-Admin-Key header (or ?key= for quick curl checks).
 * Disabled entirely (404) until ADMIN_KEY is configured.
 */
export async function GET(request: NextRequest) {
  if (!process.env.ADMIN_KEY) {
    return NextResponse.json({ error: "admin_disabled" }, { status: 404 });
  }
  if (!checkAdminKey(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = Date.now();
  const dayAgo = new Date(now - 24 * 3600_000);
  const weekAgo = new Date(now - 7 * 24 * 3600_000);
  const monthAgo = new Date(now - 30 * 24 * 3600_000);

  const [
    totalPlayers,
    identifiedPlayers,
    telegramPlayers,
    dau,
    wau,
    mau,
    newToday,
    activeSaves,
    totalResults,
  ] = await Promise.all([
    prisma.player.count(),
    prisma.player.count({ where: { OR: [{ email: { not: null } }, { telegramId: { not: null } }] } }),
    prisma.player.count({ where: { telegramId: { not: null } } }),
    prisma.player.count({ where: { lastSeenAt: { gte: dayAgo } } }),
    prisma.player.count({ where: { lastSeenAt: { gte: weekAgo } } }),
    prisma.player.count({ where: { lastSeenAt: { gte: monthAgo } } }),
    prisma.player.count({ where: { createdAt: { gte: dayAgo } } }),
    prisma.gameSave.count({ where: { progress: { lt: 1 } } }),
    prisma.gameResult.count(),
  ]);

  // Per-game aggregates over finished games.
  const perGameRaw = (await prisma.$queryRawUnsafe(`
    SELECT game,
           COUNT(*)                    AS finished,
           COUNT(DISTINCT playerId)    AS players,
           CAST(AVG(seconds) AS INT)   AS avgSeconds,
           CAST(AVG(moves) AS INT)     AS avgMoves
    FROM GameResult
    GROUP BY game
    ORDER BY finished DESC
  `)) as Row[];

  // Daily series for the last 14 days: new players / visits / finished games.
  const daysBack = 14;
  const since = new Date(now - daysBack * 24 * 3600_000).toISOString();
  const [signupsRaw, visitsRaw, finishedRaw] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT substr(CAST(createdAt AS TEXT),1,10) AS day, COUNT(*) AS n
       FROM Player WHERE createdAt >= ? GROUP BY day`, since) as Promise<Row[]>,
    prisma.$queryRawUnsafe(
      `SELECT substr(CAST(createdAt AS TEXT),1,10) AS day, COUNT(*) AS n
       FROM Event WHERE type = 'visit' AND createdAt >= ? GROUP BY day`, since) as Promise<Row[]>,
    prisma.$queryRawUnsafe(
      `SELECT substr(CAST(createdAt AS TEXT),1,10) AS day, COUNT(*) AS n
       FROM GameResult WHERE createdAt >= ? GROUP BY day`, since) as Promise<Row[]>,
  ]);

  const byDay = new Map<string, { day: string; signups: number; visits: number; finished: number }>();
  for (let i = daysBack - 1; i >= 0; i--) {
    const day = new Date(now - i * 24 * 3600_000).toISOString().slice(0, 10);
    byDay.set(day, { day, signups: 0, visits: 0, finished: 0 });
  }
  for (const r of signupsRaw) byDay.get(String(r.day))!.signups = num(r.n);
  for (const r of visitsRaw) { const d = byDay.get(String(r.day)); if (d) d.visits = num(r.n); }
  for (const r of finishedRaw) { const d = byDay.get(String(r.day)); if (d) d.finished = num(r.n); }

  // Event totals (last 30 days) — registrations, telegram logins, device links…
  const eventsRaw = (await prisma.$queryRawUnsafe(
    `SELECT type, COUNT(*) AS n FROM Event WHERE createdAt >= ? GROUP BY type ORDER BY n DESC`,
    monthAgo.toISOString(),
  )) as Row[];

  // Latest finished games for the activity feed.
  const recentResults = await prisma.gameResult.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { player: { select: { name: true, email: true, telegramId: true } } },
  });

  return NextResponse.json({
    generatedAt: new Date(now).toISOString(),
    players: {
      total: totalPlayers,
      identified: identifiedPlayers,
      telegram: telegramPlayers,
      guests: totalPlayers - identifiedPlayers,
      newToday,
      dau,
      wau,
      mau,
    },
    games: {
      totalFinished: totalResults,
      activeSaves,
      perGame: perGameRaw.map((r) => ({
        game: String(r.game),
        finished: num(r.finished),
        players: num(r.players),
        avgSeconds: num(r.avgSeconds),
        avgMoves: num(r.avgMoves),
      })),
    },
    daily: [...byDay.values()],
    events30d: eventsRaw.map((r) => ({ type: String(r.type), count: num(r.n) })),
    recent: recentResults.map((r) => ({
      game: r.game,
      moves: r.moves,
      seconds: r.seconds,
      playerName: r.player.name,
      identified: !!(r.player.email || r.player.telegramId),
      at: r.createdAt.toISOString(),
    })),
  });
}
