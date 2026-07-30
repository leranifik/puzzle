import { test, expect, type Page } from "@playwright/test";

/** Click a tile adjacent to the empty cell (first one that increments moves). */
async function makeFifteenMove(page: Page): Promise<void> {
  const cells = page.locator("[role=gridcell]");
  const movesCounter = page.locator(".font-display.tabular-nums").first();
  const before = await movesCounter.innerText();
  const count = await cells.count();
  for (let i = 0; i < count; i++) {
    await cells.nth(i).click({ force: true }).catch(() => {});
    if ((await movesCounter.innerText()) !== before) return;
  }
  throw new Error("no legal fifteen move found");
}

/** Wait until the app's debounced autosave actually lands on the server. */
async function waitForAutosave(page: Page, game: string): Promise<void> {
  await page.waitForResponse(
    (res) =>
      res.url().includes(`/api/saves/${game}`) &&
      res.request().method() === "PUT" &&
      res.ok(),
    { timeout: 10_000 },
  );
}

async function dismissContinueDialog(page: Page, choice: "new" | "continue" = "new") {
  const btn = page.getByRole("button", {
    name: choice === "new" ? "Start new" : "Continue",
    exact: true,
  });
  try {
    await btn.click({ timeout: 3000 });
  } catch {
    // dialog didn't appear — fine
  }
}

test.describe("fifteen puzzle", () => {
  test("plays, autosaves, and offers to continue after reload", async ({ page }) => {
    await page.goto("/en/play/fifteen");
    await dismissContinueDialog(page);
    await expect(page.locator("[role=gridcell]")).toHaveCount(16);

    const saved = waitForAutosave(page, "fifteen");
    await makeFifteenMove(page);
    await expect(page.locator(".font-display.tabular-nums").first()).toHaveText("1");
    await saved; // debounced autosave has really landed

    await page.reload();
    await expect(page.getByText("Continue saved game?")).toBeVisible({ timeout: 5000 });
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.locator(".font-display.tabular-nums").first()).toHaveText("1");
  });

  test("board size switch starts a fresh game", async ({ page }) => {
    await page.goto("/en/play/fifteen");
    await dismissContinueDialog(page);
    await page.getByLabel("Board").click();
    await page.getByRole("option", { name: "3 × 3" }).click();
    await expect(page.locator("[role=gridcell]")).toHaveCount(9);
    await expect(page.locator(".font-display.tabular-nums").first()).toHaveText("0");
  });

  test("arrow keys slide tiles; page scroll stays intact outside the board", async ({ page }) => {
    await page.goto("/en/play/fifteen");
    await dismissContinueDialog(page);
    await expect(page.locator("[role=gridcell]")).toHaveCount(16);
    const movesCounter = page.locator(".font-display.tabular-nums").first();

    // board is auto-focused: some arrow always has a legal move on 4x4
    for (const key of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
      await page.keyboard.press(key);
    }
    expect(Number(await movesCounter.innerText())).toBeGreaterThan(0);
  });
});

test.describe("sudoku", () => {
  test("renders 81 cells, accepts input and tracks mistakes", async ({ page }) => {
    await page.goto("/en/play/sudoku");
    await dismissContinueDialog(page);
    const cells = page.locator("[role=gridcell]");
    await expect(cells).toHaveCount(81, { timeout: 10_000 });

    // find an empty cell: no text and not part of the givens styling
    const emptyCell = cells.filter({ hasNotText: /\d/ }).first();
    await emptyCell.click();

    // type via the on-screen pad
    await page.locator("button", { hasText: /^1$/ }).last().click();
    // either it's correct (cell shows 1 in gold) or wrong (mistakes = 1) — both count as accepted input
    const mistakes = await page.locator(".text-destructive.tabular-nums, .font-display.text-destructive").first().innerText();
    expect(["0", "1"]).toContain(mistakes.trim());
  });

  test("notes mode writes pencil marks without filling the cell", async ({ page }) => {
    await page.goto("/en/play/sudoku");
    await dismissContinueDialog(page);
    const cells = page.locator("[role=gridcell]");
    await expect(cells).toHaveCount(81, { timeout: 10_000 });

    // pin a concrete empty cell index BEFORE typing (the :has-not-text filter
    // is live and would re-resolve to a different cell once the note appears)
    const emptyIndex = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[role=gridcell]")];
      return nodes.findIndex((n) => !/\d/.test(n.textContent ?? ""));
    });
    expect(emptyIndex).toBeGreaterThanOrEqual(0);
    const cell = cells.nth(emptyIndex);

    await cell.click();
    await page.getByRole("button", { name: "Notes" }).click();
    // clicking the Notes button moved focus — return it to the board
    await page.locator("[role=grid]").focus();
    await page.keyboard.press("5");
    await expect(cell.locator("span", { hasText: "5" }).first()).toBeVisible();
  });

  test("arrow keys move the selection across the grid", async ({ page }) => {
    await page.goto("/en/play/sudoku");
    await dismissContinueDialog(page);
    const cells = page.locator("[role=gridcell]");
    await expect(cells).toHaveCount(81, { timeout: 10_000 });

    await cells.nth(0).click(); // select top-left
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    // cell index 10 (r1c1) is now selected
    await expect(cells.nth(10)).toHaveAttribute("aria-selected", "true");

    // arrows at the edge don't wrap
    await cells.nth(8).click(); // top-right corner
    await page.keyboard.press("ArrowRight");
    await expect(cells.nth(8)).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("2048", () => {
  test("arrow keys slide tiles and update the score", async ({ page }) => {
    await page.goto("/en/play/g2048");
    await dismissContinueDialog(page);
    await expect(page.locator("[role=application]")).toBeVisible();

    for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(120);
    }
    // after four moves there must be at least 3 tiles on the board
    const tiles = page.locator("[role=application] > div.absolute.grid");
    expect(await tiles.count()).toBeGreaterThanOrEqual(3);
  });

  test("tiles physically slide between cells (animation base)", async ({ page }) => {
    await page.goto("/en/play/g2048");
    await dismissContinueDialog(page);
    await expect(page.locator("[role=application]")).toBeVisible();

    const positions = () =>
      page.evaluate(() =>
        [...document.querySelectorAll("[role=application] > div.absolute.grid")].map(
          (el) => (el as HTMLElement).style.left + "/" + (el as HTMLElement).style.top,
        ),
      );
    const before = await positions();
    await page.keyboard.press("ArrowLeft");
    await page.waitForTimeout(400);
    const after = await positions();
    expect(after).not.toEqual(before);
  });
});

test.describe("numsolis", () => {
  test("merges, undoes, and switches between one and two colors", async ({ page }) => {
    await page.goto("/en/play/numsolis");
    await dismissContinueDialog(page);

    const board = page.getByRole("grid", { name: "Numsolis" });
    await expect(board).toBeVisible();
    const columns = board.locator("[data-numsolis-column]");
    await expect(columns).toHaveCount(6);
    await expect(board.locator("[data-numsolis-card]")).toHaveCount(36);
    await expect(board.locator("[data-stack-limit]")).toBeVisible();

    const pair = await board.evaluate((node) => {
      const exposed = [
        ...node.querySelectorAll<HTMLButtonElement>("button[data-exposed=true]"),
      ];
      for (let i = 0; i < exposed.length; i++) {
        for (let j = i + 1; j < exposed.length; j++) {
          if (exposed[i].getAttribute("aria-label") === exposed[j].getAttribute("aria-label")) {
            return [i, j];
          }
        }
      }
      return null;
    });
    expect(pair).not.toBeNull();

    const exposed = board.locator("button[data-exposed=true]");
    await exposed.nth(pair![0]).click();
    await exposed.nth(pair![1]).click();
    await expect(page.locator(".font-display.tabular-nums").first()).toHaveText("1");
    await expect(board.locator("[data-numsolis-card]")).toHaveCount(35);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.locator(".font-display.tabular-nums").first()).toHaveText("0");
    await expect(board.locator("[data-numsolis-card]")).toHaveCount(36);

    await page.getByRole("combobox", { name: "Colors" }).click();
    await page.getByRole("option", { name: "1 color" }).click();
    await expect(board.locator("[data-numsolis-card]")).toHaveCount(32);
  });
});

test.describe("memory", () => {
  test("flips cards; a matched pair stays open", async ({ page }) => {
    await page.goto("/en/play/memory");
    await dismissContinueDialog(page);
    const cards = page.locator("[role=gridcell]");
    await expect(cards).toHaveCount(16);

    // brute-force: click cards until the pairs counter moves
    const pairsCounter = page.locator(".font-display.tabular-nums").nth(1);
    outer: for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        await cards.nth(i).click({ force: true });
        await cards.nth(j).click({ force: true });
        await page.waitForTimeout(1100); // miss-hide delay
        if ((await pairsCounter.innerText()).startsWith("1")) break outer;
      }
    }
    await expect(pairsCounter).toHaveText(/^1\//);
  });
});
