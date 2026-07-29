import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { setSessionCookie, verifyPassword } from "@/lib/session";
import { loginSchema } from "@/lib/schemas";
import { track } from "@/lib/analytics";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { email, password } = parsed.data;

  const player = await prisma.player.findUnique({ where: { email } });
  if (!player?.passwordHash || !verifyPassword(password, player.passwordHash)) {
    return NextResponse.json({ error: "credentials" }, { status: 401 });
  }

  await setSessionCookie(player.id);
  track("login", player.id);
  return NextResponse.json({
    player: { id: player.id, name: player.name, email: player.email, isGuest: false },
  });
}
