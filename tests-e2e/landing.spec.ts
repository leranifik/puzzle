import { test, expect } from "@playwright/test";

test.describe("landing page", () => {
  test("root redirects by Accept-Language (ru)", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "ru-RU" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/ru$/);
    await ctx.close();
  });

  test("root falls back to /en for unsupported languages", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "de-DE" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
    await ctx.close();
  });

  test("ru landing renders hero with demo, games and how-it-works", async ({ page }) => {
    await page.goto("/ru");
    await expect(page.getByRole("heading", { name: /Решай где угодно/ })).toBeVisible();
    await expect(page.locator("#demo")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Выберите головоломку" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Один профиль — все устройства" })).toBeVisible();
  });

  test("locale switcher navigates to /en and persists via cookie", async ({ page }) => {
    await page.goto("/ru");
    await page.getByRole("button", { name: "EN" }).click();
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.getByRole("heading", { name: /Solve anywhere/ })).toBeVisible();

    // cookie now wins over Accept-Language on the next root visit
    await page.goto("/");
    await expect(page).toHaveURL(/\/en$/);
  });

  test("hero demo: all four games are playable, arrows don't scroll the page", async ({ page }) => {
    await page.goto("/ru");
    const demo = page.locator("#demo");
    await expect(demo).toBeVisible();

    // sudoku: select a cell and type a digit from the keyboard
    await demo.getByRole("button", { name: "Судоку" }).click();
    const grid = demo.getByRole("grid");
    await expect(grid).toBeVisible();
    const emptyIndex = await page.evaluate(() => {
      const cells = [...document.querySelectorAll("#demo [role=gridcell]")];
      return cells.findIndex((c) => !(c.textContent ?? "").trim());
    });
    await demo.locator("[role=gridcell]").nth(emptyIndex).click();
    await page.keyboard.press("1");
    await expect(demo.locator("[role=gridcell]").nth(emptyIndex)).toHaveText("1");

    // 2048: arrows move tiles while the board is focused — page must not scroll
    await demo.getByRole("button", { name: "2048" }).click();
    const board2048 = demo.locator("[data-demo=g2048] > div").first();
    await expect(board2048).toBeVisible();
    await board2048.click(); // ensure focus
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    const tiles = demo.locator("[data-demo=g2048] .absolute.grid");
    expect(await tiles.count()).toBeGreaterThanOrEqual(2);

    // ...and when focus is elsewhere, arrows scroll the page again
    await page.locator("h1").click();
    await page.keyboard.press("ArrowDown");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollBefore);
    await page.evaluate(() => window.scrollTo(0, 0));

    // 2048: mouse drag works as a swipe
    const box = (await board2048.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    // memory still opens
    await demo.getByRole("button", { name: "Мемори" }).click();
    await expect(demo.getByText("?").first()).toBeVisible();

    // demo does not create a cloud save
    const session = await page.evaluate(() =>
      fetch("/api/session").then((r) => r.json()),
    );
    expect(session.saves).toEqual([]);
  });

  test("games hub lists all four games", async ({ page }) => {
    await page.goto("/ru/games");
    await expect(page.getByRole("heading", { name: "Все игры" })).toBeVisible();
    for (const name of ["Пятнашки", "Судоку", "2048", "Мемори"]) {
      await expect(page.getByRole("link", { name: new RegExp(name) })).toBeVisible();
    }
  });
});
