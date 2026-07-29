import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlayer } from "@/lib/session";
import { track } from "@/lib/analytics";
import { resultSchema } from "@/lib/schemas";

/** POST /api/results — record a finished game. */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = resultSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const player = await ensurePlayer();
  const result = await prisma.gameResult.create({
    data: {
      playerId: player.id,
      game: parsed.data.game,
      moves: parsed.data.moves,
      seconds: parsed.data.seconds,
      meta: JSON.stringify(parsed.data.meta),
    },
  });
  track("game_finished", player.id, {
    game: parsed.data.game,
    moves: parsed.data.moves,
    seconds: parsed.data.seconds,
  });

  return NextResponse.json({ ok: true, id: result.id });
}
