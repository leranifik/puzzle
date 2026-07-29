import { test, expect } from "@playwright/test";

test.describe("auth dialog", () => {
  test("register upgrades the guest and shows the player name", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByRole("tab", { name: "Sign up" }).click();

    const email = `user-${Date.now()}@e2e.dev`;
    await page.getByLabel("Name").fill("E2E Player");
    await page.locator("#ru-email").fill(email);
    await page.locator("#ru-pass").fill("secret123");
    await page.getByRole("button", { name: "Create & link progress" }).click();

    // dialog closes, header shows the account
    await expect(page.locator("header").getByText("E2E Player")).toBeVisible({ timeout: 5000 });

    // logout brings the Sign in button back
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  });

  test("shows an error toast for wrong credentials", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator("#li-email").fill("nobody@e2e.dev");
    await page.locator("#li-pass").fill("wrongpass");
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByText("Wrong email or password")).toBeVisible({ timeout: 5000 });
  });

  test("validates email format client-side", async ({ page }) => {
    await page.goto("/en");
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.locator("#li-email").fill("not-an-email");
    await page.locator("#li-pass").fill("secret123");
    await page.getByRole("button", { name: "Sign in" }).last().click();
    await expect(page.getByText("Enter a valid email")).toBeVisible();
  });
});

test.describe("device link", () => {
  test("full flow: issue link -> claim on a second device -> saves follow", async ({ browser }) => {
    // Device A: guest with progress
    const ctxA = await browser.newContext();
    const pageA = await ctxA.newPage();
    await pageA.goto("/en/games");
    await pageA.evaluate(() =>
      fetch("/api/saves/fifteen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: JSON.stringify({ size: 4, board: [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15], moves: 42, seconds: 60 }),
          progress: 0.42,
        }),
      }),
    );
    const playerA = (await pageA.evaluate(() => fetch("/api/session").then((r) => r.json()))).player;

    // open the dialog, verify QR + countdown
    await pageA.getByRole("button", { name: "Open on another device" }).click();
    await expect(pageA.getByRole("img", { name: "QR" })).toBeVisible({ timeout: 10_000 });
    await expect(pageA.getByText(/Link expires in \d:\d\d/)).toBeVisible();

    // grab a fresh link via API (same profile)
    const url = await pageA.evaluate(() =>
      fetch("/api/link-device", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: "en" }),
      }).then((r) => r.json()).then((d) => d.url as string),
    );

    // Device B claims it
    const ctxB = await browser.newContext();
    const pageB = await ctxB.newPage();
    await pageB.goto(url);
    await expect(pageB.getByText("Device linked! Your saves are here.")).toBeVisible({ timeout: 10_000 });

    const sessionB = await pageB.evaluate(() => fetch("/api/session").then((r) => r.json()));
    expect(sessionB.player.id).toBe(playerA.id);
    expect(sessionB.saves.map((s: { game: string }) => s.game)).toContain("fifteen");

    // link is single-use: a third device gets the expired screen
    const ctxC = await browser.newContext();
    const pageC = await ctxC.newPage();
    await pageC.goto(url);
    await expect(pageC.getByText("This link has expired or was already used.")).toBeVisible({ timeout: 10_000 });

    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  });
});

test.describe("cross-device live sync", () => {
  test("open game offers the newer cloud save after a remote update", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/en/play/fifteen");

    // dismiss the continue dialog if present, then make a move to establish syncedAt
    try {
      await page.getByRole("button", { name: "Start new", exact: true }).click({ timeout: 3000 });
    } catch { /* no dialog */ }
    const cells = page.locator("[role=gridcell]");
    const movesCounter = page.locator(".font-display.tabular-nums").first();
    const before = await movesCounter.innerText();
    const savedPromise = page.waitForResponse(
      (res) =>
        res.url().includes("/api/saves/fifteen") &&
        res.request().method() === "PUT" &&
        res.ok(),
      { timeout: 10_000 },
    );
    for (let i = 0; i < 16; i++) {
      await cells.nth(i).click({ force: true }).catch(() => {});
      if ((await movesCounter.innerText()) !== before) break;
    }
    await savedPromise; // own autosave landed -> syncedAt is set

    // remote device overwrites the save
    await page.evaluate(() =>
      fetch("/api/saves/fifteen", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state: JSON.stringify({ size: 4, board: [1,2,3,4,5,6,7,8,9,10,11,12,13,15,14,0], moves: 77, seconds: 300 }),
          progress: 0.87,
        }),
      }),
    );

    // the 15s poll picks it up (interval + fetch + render margin)
    await expect(page.getByText("Updated on another device")).toBeVisible({ timeout: 25_000 });
    await page.getByRole("button", { name: "Load newer version" }).click();
    await expect(movesCounter).toHaveText("77");

    await ctx.close();
  });
});
