/**
 * Playwright global setup:
 *  - recreates the isolated e2e database from the Prisma schema,
 *  - ensures a production build exists (builds once if .next is missing).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const E2E_DIR = path.join(ROOT, ".e2e");
const E2E_DB = path.join(E2E_DIR, "e2e.db");

export default function globalSetup() {
  // fresh database for every run
  rmSync(E2E_DIR, { recursive: true, force: true });
  mkdirSync(E2E_DIR, { recursive: true });
  // Prisma 7's schema engine expects the SQLite file to exist. This fresh
  // test database contains no data to discard, so no destructive flag is needed.
  writeFileSync(E2E_DB, "");
  execSync("npx prisma db push", {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: `file:${E2E_DB}` },
    stdio: "pipe",
  });

  // build once if there is no production bundle yet
  const buildId = path.join(ROOT, ".next", "BUILD_ID");
  if (!existsSync(buildId)) {
    execSync("npx next build", { cwd: ROOT, stdio: "inherit" });
  }
}
