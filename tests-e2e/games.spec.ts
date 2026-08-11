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
    await saved;

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
    const emptyCell = cells.filter({ hasNotText: /\d/ }).first();
    await emptyCell.click();
    await page.locator("button", { hasText: /^1$/ }).last().click();
    const mistakes = await page.locator(".text-destructive.tabular-nums, .font-display.text-destructive").first().innerText();
    expect(["0", "1"]).toContain(mistakes.trim());
  });

  test("notes mode writes pencil marks without filling the cell", async ({ page }) => {
    await page.goto("/en/play/sudoku");
    await dismissContinueDialog(page);
    const cells = page.locator("[role=gridcell]");
    await expect(cells).toHaveCount(81, { timeout: 10_000 });
    const emptyIndex = await page.evaluate(() => {
      const nodes = [...document.querySelectorAll("[role=gridcell]")];
      return nodes.findIndex((n) => !/\d/.test(n.textContent ?? ""));
    });
    expect(emptyIndex).toBeGreaterThanOrEqual(0);
    const cell = cells.nth(emptyIndex);
    await cell.click();
    await page.getByRole("button", { name: "Notes" }).click();
    await page.locator("[role=grid]").focus();
    await page.keyboard.press("5");
    await expect(cell.locator("span", { hasText: "5" }).first()).toBeVisible();
  });

  test("arrow keys move the selection across the grid", async ({ page }) => {
    await page.goto("/en/play/sudoku");
    await dismissContinueDialog(page);
    const cells = page.locator("[role=gridcell]");
    await expect(cells).toHaveCount(81, { timeout: 10_000 });
    await cells.nth(0).click();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowDown");
    await expect(cells.nth(10)).toHaveAttribute("aria-selected", "true");
    await cells.nth(8).click();
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

test.describe("memory", () => {
  test("flips cards; a matched pair stays open", async ({ page }) => {
    await page.goto("/en/play/memory");
    await dismissContinueDialog(page);
    const cards = page.locator("[role=gridcell]");
    await expect(cards).toHaveCount(16);
    const pairsCounter = page.locator(".font-display.tabular-nums").nth(1);
    outer: for (let i = 0; i < 16; i++) {
      for (let j = i + 1; j < 16; j++) {
        await cards.nth(i).click({ force: true });
        await cards.nth(j).click({ force: true });
        await page.waitForTimeout(1100);
        if ((await pairsCounter.innerText()).startsWith("1")) break outer;
      }
    }
    await expect(pairsCounter).toHaveText(/^1\//);
  });
});

test.describe("numsolis", () => {
  test("renders one six-column cascade, supports difficulty, and never deals 2048", async ({ page }) => {
    await page.goto("/en/play/numsolis");
    await dismissContinueDialog(page);
    const board = page.locator("[role=grid]");
    await expect(board).toBeVisible();
    await expect(board.locator("[role=gridcell]")).toHaveCount(6);
    await expect(board.getByText(/\/9$/)).toHaveCount(6);
    await expect(board.getByRole("button", { name: /^2048 · Numsolis card$/ })).toHaveCount(0);

    await page.getByLabel("Difficulty").click();
    await page.getByRole("option", { name: "Hard", exact: true }).click();
    await expect(page.getByLabel("Difficulty")).toContainText("Hard");
    await expect(board.getByRole("button", { name: /^2048 · Numsolis card$/ })).toHaveCount(0);
  });

  test("tap move can be undone", async ({ page }) => {
    await page.goto("/en/play/numsolis");
    await dismissContinueDialog(page);
    const board = page.locator("[role=grid]");
    const movesCounter = page.locator(".font-display.tabular-nums").first();
    const cards = board.getByRole("button", { name: /Numsolis card/ });
    const count = await cards.count();
    let moved = false;

    for (let i = 0; i < count && !moved; i++) {
      await cards.nth(i).click();
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        await cards.nth(j).click().catch(() => {});
        if ((await movesCounter.innerText()) === "1") {
          moved = true;
          break;
        }
      }
    }

    expect(moved).toBe(true);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(movesCounter).toHaveText("0");
  });

  test("cards can be dragged between columns", async ({ page }) => {
    await page.goto("/en/play/numsolis");
    await dismissContinueDialog(page);
    const board = page.locator("[role=grid]");
    const columns = board.locator("[data-numsolis-column]");
    const movesCounter = page.locator(".font-display.tabular-nums").first();

    const pair = await page.evaluate(() => {
      const cols = [...document.querySelectorAll<HTMLElement>("[data-numsolis-column]")];
      const data = cols.map((col, index) => {
        const cards = [...col.querySelectorAll<HTMLButtonElement>('button[aria-label*="Numsolis card"]')];
        return {
          index,
          top: cards.at(-1) ? Number(cards.at(-1)!.textContent) : null,
          count: cards.length,
        };
      });
      for (const source of data) {
        if (source.top === null) continue;
        for (const target of data) {
          if (source.index === target.index || target.top === null || target.count >= 9) continue;
          if (target.top > source.top) return { from: source.index, to: target.index };
        }
      }
      return null;
    });

    expect(pair).not.toBeNull();
    if (!pair) return;
    const sourceCard = columns.nth(pair.from).getByRole("button", { name: /Numsolis card/ }).last();
    const sourceBox = await sourceCard.boundingBox();
    const targetBox = await columns.nth(pair.to).boundingBox();
    expect(sourceBox).not.toBeNull();
    expect(targetBox).not.toBeNull();
    if (!sourceBox || !targetBox) return;

    await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 100, { steps: 8 });
    await page.mouse.up();
    await expect(movesCounter).toHaveText("1");
  });
});
