import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensurePlayer, hashPassword, setSessionCookie } from "@/lib/session";
import { registerSchema } from "@/lib/schemas";
import { track } from "@/lib/analytics";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const { name, email, password } = parsed.data;

  const taken = await prisma.player.findUnique({ where: { email } });
  if (taken) {
    return NextResponse.json({ error: "email_taken" }, { status: 409 });
  }

  // Upgrade the current guest profile so existing saves stay attached.
  const guest = await ensurePlayer();
  const player = await prisma.player.update({
    where: { id: guest.id },
    data: { name, email, passwordHash: hashPassword(password) },
  });

  await setSessionCookie(player.id);
  track("register", player.id);
  return NextResponse.json({
    player: { id: player.id, name: player.name, email: player.email, isGuest: false },
  });
}
