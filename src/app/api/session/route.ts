import { NextResponse } from "next/server";
import { ensurePlayer } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { touchPlayer } from "@/lib/analytics";
import type { PlayerDto, SaveDto, GameId } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/** GET /api/session — returns (and lazily creates) the current player + saves summary. */
export async function GET() {
  const player = await ensurePlayer();
  // Throttled activity tracking (counts a "visit" at most every 30 min).
  await touchPlayer(player);
  const saves = await prisma.gameSave.findMany({
    where: { playerId: player.id },
    orderBy: { updatedAt: "desc" },
  });

  const dto: PlayerDto = {
    id: player.id,
    name: player.name,
    email: player.email,
    isGuest: !player.email && !player.telegramId,
  };
  const saveDtos: SaveDto[] = saves.map((s) => ({
    game: s.game as GameId,
    state: s.state,
    progress: s.progress,
    updatedAt: s.updatedAt.toISOString(),
  }));

  return NextResponse.json({ player: dto, saves: saveDtos });
}
