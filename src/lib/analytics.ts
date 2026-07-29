import { prisma } from "./prisma";

/**
 * Minimal product analytics.
 *
 * `track` is fire-and-forget: analytics must never break or slow down
 * gameplay endpoints, so failures are swallowed (logged in dev).
 * No IP addresses, no fingerprinting — just event type + player id.
 */
export function track(
  type: string,
  playerId?: string | null,
  meta?: Record<string, unknown>,
): void {
  void prisma.event
    .create({
      data: {
        type,
        playerId: playerId ?? null,
        meta: meta ? JSON.stringify(meta) : "{}",
      },
    })
    .catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[analytics] track failed:", error);
      }
    });
}

/** How stale lastSeenAt must be before we bump it and count a "visit". */
const VISIT_GAP_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Bumps the player's lastSeenAt (throttled) and records a `visit` event
 * when a new session of activity starts. Called from /api/session, which
 * every page hits on load — so this approximates real visits without
 * writing a row on every request.
 *
 * A brand-new player (lastSeenAt still equals createdAt) always counts
 * as a first visit.
 */
export async function touchPlayer(player: {
  id: string;
  createdAt: Date;
  lastSeenAt: Date;
}): Promise<void> {
  const now = Date.now();
  // Fresh players carry lastSeenAt === createdAt (both set by the same
  // create call) — that exact equality marks the very first visit.
  const isFirstVisit = player.lastSeenAt.getTime() === player.createdAt.getTime();
  if (!isFirstVisit && now - player.lastSeenAt.getTime() < VISIT_GAP_MS) return;
  try {
    await prisma.player.update({
      where: { id: player.id },
      // +1ms guard: never collide with createdAt even within the same tick
      data: { lastSeenAt: new Date(Math.max(now, player.createdAt.getTime() + 1)) },
    });
    track("visit", player.id, isFirstVisit ? { first: true } : undefined);
  } catch {
    // never let analytics break the session endpoint
  }
}
