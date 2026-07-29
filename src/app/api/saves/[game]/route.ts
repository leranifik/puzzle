import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlayer, getPlayerId } from "@/lib/session";
import { gameIdSchema, saveGameSchema } from "@/lib/schemas";

type Params = { params: Promise<{ game: string }> };

/** GET /api/saves/:game — load the save for the current player. */
export async function GET(_request: NextRequest, { params }: Params) {
  const { game } = await params;
  const parsedGame = gameIdSchema.safeParse(game);
  if (!parsedGame.success) {
    return NextResponse.json({ error: "unknown_game" }, { status: 404 });
  }

  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ save: null });

  const save = await prisma.gameSave.findUnique({
    where: { playerId_game: { playerId, game: parsedGame.data } },
  });

  return NextResponse.json({
    save: save
      ? {
          game: save.game,
          state: save.state,
          progress: save.progress,
          updatedAt: save.updatedAt.toISOString(),
        }
      : null,
  });
}

/** PUT /api/saves/:game — upsert the save (autosave). */
export async function PUT(request: NextRequest, { params }: Params) {
  const { game } = await params;
  const parsedGame = gameIdSchema.safeParse(game);
  if (!parsedGame.success) {
    return NextResponse.json({ error: "unknown_game" }, { status: 404 });
  }

  const body = await request.json().catch(() => null);
  const parsed = saveGameSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const player = await ensurePlayer();
  const save = await prisma.gameSave.upsert({
    where: { playerId_game: { playerId: player.id, game: parsedGame.data } },
    create: {
      playerId: player.id,
      game: parsedGame.data,
      state: parsed.data.state,
      progress: parsed.data.progress,
    },
    update: { state: parsed.data.state, progress: parsed.data.progress },
  });

  return NextResponse.json({ ok: true, updatedAt: save.updatedAt.toISOString() });
}

/** DELETE /api/saves/:game — clear the save (game finished or abandoned). */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { game } = await params;
  const parsedGame = gameIdSchema.safeParse(game);
  if (!parsedGame.success) {
    return NextResponse.json({ error: "unknown_game" }, { status: 404 });
  }

  const playerId = await getPlayerId();
  if (playerId) {
    await prisma.gameSave.deleteMany({
      where: { playerId, game: parsedGame.data },
    });
  }
  return NextResponse.json({ ok: true });
}
