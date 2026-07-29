/**
 * Integration-test harness for API route handlers.
 *
 * - Real SQLite database in a temp dir (fresh per test file), schema created
 *   via raw DDL matching prisma/schema.prisma.
 * - next/headers `cookies()` is mocked with an in-memory jar per "device",
 *   so multi-device flows (guest merge, device links) can be simulated.
 *
 * Usage: `await initDb()` in beforeAll, then dynamic-import route handlers.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { vi } from "vitest";

export type CookieJar = Map<string, string>;

/** The jar representing the "current device" for next/headers mocks. */
let activeJar: CookieJar = new Map();
/** Request headers for the "current device" (e.g. Authorization: tma ...). */
let activeHeaders: Map<string, string> = new Map();

export function newDevice(): CookieJar {
  return new Map();
}

export function useDevice(jar: CookieJar, headers: Record<string, string> = {}) {
  activeJar = jar;
  activeHeaders = new Map(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
}

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      activeJar.has(name) ? { name, value: activeJar.get(name)! } : undefined,
    set: (name: string, value: string) => {
      activeJar.set(name, value);
    },
    delete: (name: string) => {
      activeJar.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) => activeHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

let dbDir: string | null = null;

const DDL = `
CREATE TABLE IF NOT EXISTS "Player" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL DEFAULT 'Guest',
  "email" TEXT,
  "passwordHash" TEXT,
  "telegramId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Player_email_key" ON "Player"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Player_telegramId_key" ON "Player"("telegramId");

CREATE TABLE IF NOT EXISTS "GameSave" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "game" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "progress" REAL NOT NULL DEFAULT 0,
  "updatedAt" DATETIME NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameSave_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "GameSave_playerId_game_key" ON "GameSave"("playerId", "game");

CREATE TABLE IF NOT EXISTS "GameResult" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "game" TEXT NOT NULL,
  "moves" INTEGER NOT NULL DEFAULT 0,
  "seconds" INTEGER NOT NULL DEFAULT 0,
  "meta" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GameResult_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "GameResult_playerId_game_idx" ON "GameResult"("playerId", "game");

CREATE TABLE IF NOT EXISTS "LinkToken" (
  "token" TEXT NOT NULL PRIMARY KEY,
  "playerId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME NOT NULL,
  "usedAt" DATETIME,
  CONSTRAINT "LinkToken_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "LinkToken_playerId_idx" ON "LinkToken"("playerId");

CREATE TABLE IF NOT EXISTS "Event" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "type" TEXT NOT NULL,
  "playerId" TEXT,
  "meta" TEXT NOT NULL DEFAULT '{}',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "Event_type_createdAt_idx" ON "Event"("type", "createdAt");
CREATE INDEX IF NOT EXISTS "Event_createdAt_idx" ON "Event"("createdAt");
`;

/** Creates the temp DB, points DATABASE_URL at it and applies the schema. */
export async function initDb() {
  dbDir = mkdtempSync(path.join(tmpdir(), "puzzlehub-test-"));
  const dbPath = path.join(dbDir, "test.db");
  process.env.DATABASE_URL = `file:${dbPath}`;

  const { prisma } = await import("@/lib/prisma");
  for (const stmt of DDL.split(";").map((s) => s.trim()).filter(Boolean)) {
    await prisma.$executeRawUnsafe(stmt);
  }
  return prisma;
}

export function teardownDb() {
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
  dbDir = null;
}

/** Build a NextRequest with a JSON body (link-device uses request.nextUrl). */
export async function jsonRequest(url: string, body?: unknown, method = "POST") {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://test.local${url}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
