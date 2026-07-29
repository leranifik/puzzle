import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getPlayerId, setSessionCookie } from "@/lib/session";
import { track } from "@/lib/analytics";

const bodySchema = z.object({ token: z.string().min(16).max(64) });

/**
 * POST /api/link-device/claim — attach this device to the player behind
 * the token. Tokens are single-use (atomic claim) and expire quickly.
 *
 * Save-conflict policy when the claiming device already holds a *guest*
 * profile with progress: per game, the save with the newer `updatedAt`
 * wins; the guest profile is then removed. If the claiming device is
 * signed in (email/Telegram), nothing is merged or deleted — the session
 * simply switches to the linked profile.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const link = await prisma.linkToken.findUnique({
    where: { token: parsed.data.token },
    include: { player: true },
  });
  if (!link || link.usedAt || link.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  // Atomic single-use claim: only one device can win the race.
  const claimed = await prisma.linkToken.updateMany({
    where: { token: link.token, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    return NextResponse.json({ error: "expired" }, { status: 410 });
  }

  const target = link.player;
  const currentId = await getPlayerId();
  const mergedGames: string[] = [];
  let alreadyLinked = false;

  if (currentId === target.id) {
    alreadyLinked = true;
  } else if (currentId) {
    const current = await prisma.player.findUnique({
      where: { id: currentId },
      include: { saves: true },
    });
    const isGuest = current && !current.email && !current.telegramId;

    if (current && isGuest) {
      // Merge guest progress: newer save wins per game.
      const targetSaves = await prisma.gameSave.findMany({
        where: { playerId: target.id },
      });
      const targetByGame = new Map(targetSaves.map((s) => [s.game, s]));

      for (const save of current.saves) {
        const existing = targetByGame.get(save.game);
        if (!existing) {
          await prisma.gameSave.create({
            data: {
              playerId: target.id,
              game: save.game,
              state: save.state,
              progress: save.progress,
            },
          });
          mergedGames.push(save.game);
        } else if (save.updatedAt > existing.updatedAt) {
          await prisma.gameSave.update({
            where: { id: existing.id },
            data: { state: save.state, progress: save.progress },
          });
          mergedGames.push(save.game);
        }
        // else: target's save is newer — keep it, guest copy is discarded
      }

      await prisma.gameResult.updateMany({
        where: { playerId: current.id },
        data: { playerId: target.id },
      });
      await prisma.player.delete({ where: { id: current.id } });
    }
    // Signed-in profile on this device: no merge, no deletion — just switch.
  }

  await setSessionCookie(target.id);
  track("device_linked", target.id, { merged: mergedGames.length });
  return NextResponse.json({
    player: {
      id: target.id,
      name: target.name,
      email: target.email,
      isGuest: !target.email && !target.telegramId,
    },
    mergedGames,
    alreadyLinked,
  });
}
