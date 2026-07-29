import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * E2E suite. `npm run test:e2e` will:
 *  1. build the app if needed (reuses .next when present),
 *  2. start `next start` on port 3199 with an isolated test database,
 *  3. run the specs in tests-e2e/.
 *
 * The database file lives in .e2e/ and is recreated from the Prisma schema
 * by tests-e2e/global-setup.ts before the server starts.
 */
const E2E_DB = path.join(__dirname, ".e2e", "e2e.db");

export default defineConfig({
  testDir: "tests-e2e",
  globalSetup: "./tests-e2e/global-setup.ts",
  fullyParallel: false, // shared DB: keep execution deterministic
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 45_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3199",
    trace: "retain-on-failure",
    viewport: { width: 390, height: 844 }, // mobile-first, like our users
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npx next start -p 3199",
    url: "http://localhost:3199/en",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: `file:${E2E_DB}`,
      SESSION_SECRET: "e2e-test-secret",
      TELEGRAM_BOT_TOKEN: "12345:E2E_TEST_TOKEN",
    },
  },
});
