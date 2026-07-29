import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { getPlayerId, setSessionCookie } from "@/lib/session";
import { validateInitData } from "@/lib/telegram";
import { track } from "@/lib/analytics";

const bodySchema = z.object({ initData: z.string().min(1).max(8192) });

/**
 * POST /api/auth/telegram — sign in with Telegram Mini Apps initData.
 * Validates the HMAC signature server-side with the bot token.
 * Existing guest progress is merged into the Telegram-linked profile.
 */
export async function POST(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) {
    return NextResponse.json({ error: "telegram_disabled" }, { status: 503 });
  }

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  const tgUser = validateInitData(parsed.data.initData, botToken);
  if (!tgUser) {
    return NextResponse.json({ error: "invalid_init_data" }, { status: 401 });
  }

  const telegramId = String(tgUser.id);
  const displayName =
    [tgUser.first_name, tgUser.last_name].filter(Boolean).join(" ") ||
    tgUser.username ||
    "Player";

  const existing = await prisma.player.findUnique({ where: { telegramId } });
  const guestId = await getPlayerId();

  let player;
  if (existing) {
    // Known Telegram user. If the current cookie points to a *different*
    // guest profile with progress, merge that progress in (don't overwrite
    // newer saves on the Telegram profile).
    if (guestId && guestId !== existing.id) {
      const guest = await prisma.player.findUnique({
        where: { id: guestId },
        include: { saves: true },
      });
      if (guest && !guest.email && !guest.telegramId) {
        for (const save of guest.saves) {
          await prisma.gameSave.upsert({
            where: { playerId_game: { playerId: existing.id, game: save.game } },
            create: {
              playerId: existing.id,
              game: save.game,
              state: save.state,
              progress: save.progress,
            },
            update: {},
          });
        }
        await prisma.gameResult.updateMany({
          where: { playerId: guest.id },
          data: { playerId: existing.id },
        });
        await prisma.player.delete({ where: { id: guest.id } });
      }
    }
    player = await prisma.player.update({
      where: { id: existing.id },
      data: { name: displayName },
    });
  } else if (guestId) {
    // Upgrade the current guest (or attach to an email account) in place.
    const current = await prisma.player.findUnique({ where: { id: guestId } });
    if (current && !current.telegramId) {
      player = await prisma.player.update({
        where: { id: guestId },
        data: { telegramId, name: current.email ? current.name : displayName },
      });
    } else {
      player = await prisma.player.create({
        data: { id: nanoid(16), name: displayName, telegramId },
      });
    }
  } else {
    player = await prisma.player.create({
      data: { id: nanoid(16), name: displayName, telegramId },
    });
  }

  await setSessionCookie(player.id);
  track("telegram_login", player.id);
  return NextResponse.json({
    player: {
      id: player.id,
      name: player.name,
      email: player.email,
      isGuest: !player.email && !player.telegramId,
    },
    languageCode: tgUser.language_code ?? null,
  });
}
