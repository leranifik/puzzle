import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const startedAt = Date.now();

function readVersion(): string {
  try {
    // The release bundle ships a VERSION file next to server.js.
    return readFileSync(path.join(process.cwd(), "VERSION"), "utf8").trim();
  } catch {
    return "dev";
  }
}
const version = readVersion();

/**
 * GET /api/health — liveness + DB check for uptime monitors.
 * 200 {"status":"ok"} when the app and the database respond,
 * 503 when the database is unreachable.
 */
export async function GET() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    return NextResponse.json({
      status: "ok",
      version,
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", version, error: "database_unreachable" },
      { status: 503 },
    );
  }
}
