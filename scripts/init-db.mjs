#!/usr/bin/env node
/**
 * Initializes / upgrades the SQLite database for production deployments.
 *
 * Runs with the `better-sqlite3` package that ships inside the standalone
 * bundle — no Prisma CLI or dev dependencies needed on the server.
 * The DDL is idempotent (CREATE TABLE IF NOT EXISTS), safe to run on
 * every release.
 *
 * Usage:  DATABASE_URL="file:/var/lib/puzzlehub/prod.db" node scripts/init-db.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// Resolve better-sqlite3 from the standalone bundle's node_modules.
const require = createRequire(path.join(here, "..", "node_modules"));
const Database = require("better-sqlite3");

const url = process.env.DATABASE_URL ?? "file:./prisma/dev.db";
if (!url.startsWith("file:")) {
  console.error("DATABASE_URL must be a file: URL for SQLite, got:", url);
  process.exit(1);
}
const dbPath = url.slice("file:".length);
mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
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
`);

// --- incremental migrations for databases created by older releases ---
const playerCols = db.prepare(`PRAGMA table_info("Player")`).all().map((c) => c.name);
if (!playerCols.includes("lastSeenAt")) {
  db.exec(`ALTER TABLE "Player" ADD COLUMN "lastSeenAt" DATETIME`);
  db.exec(`UPDATE "Player" SET "lastSeenAt" = COALESCE("createdAt", CURRENT_TIMESTAMP)`);
  console.log("Migrated: Player.lastSeenAt added");
}

db.close();
console.log(`Database ready at ${dbPath}`);
