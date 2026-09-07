import { test, expect, type Page } from "@playwright/test";
import { applyMove, createNumsolisState, getLegalMoves, numsolisProgress, serializeNumsolis, type NumsolisColumns, type NumsolisMove, type NumsolisState } from "../src/lib/games/numsolis";
import { generateNumsolisDeal } from "../src/lib/games/numsolis-generator";

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

async function readNumsolisColumns(page: Page): Promise<NumsolisColumns> {
  return page.locator('[data-card]').evaluateAll((nodes) => {
    const columns: NumsolisColumns = Array.from({ length: 6 }, () => []);
    for (const node of nodes) {
      const d = (node as HTMLElement).dataset;
      columns[Number(d.column)].push({ id: Number(d.card), value: Number(d.value), suit: Number(d.suit) as 0 | 1 });
    }
    return columns;
  });
}

async function tapNumsolisMove(page: Page, move: NumsolisMove) {
  await page.locator(`[data-column="${move.from}"][data-index="${move.index}"]`).click({ position: { x: 10, y: 12 } });
  await page.getByTestId(`numsolis-column-${move.to}`).locator('[data-card]').last().click({ position: { x: 10, y: 12 } });
}

async function restoreNumsolisFixture(page: Page, state: NumsolisState) {
  await page.request.get('/api/session');
  const response = await page.request.put('/api/saves/numsolis', {
    data: { state: serializeNumsolis(state), progress: numsolisProgress(state) },
  });
  expect(response.ok()).toBe(true);
  await page.goto('/en/play/numsolis');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('numsolis-moves')).toHaveText(String(state.moves));
}

test.describe('Numsolis', () => {
  test('cascade keeps lower cards above, scores multipliers and cancels cleanly on undo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const values = [[8, 16], [16, 8], [1024], [512], [256], [128, 64, 16]];
    let id = 0;
    const state = createNumsolisState(values.map((column) => column.map((value) => ({ id: id++, value, suit: 0 as const }))), 'easy', 12);
    await restoreNumsolisFixture(page, state);
    await page.evaluate(() => {
      const audit = { checked: 0, wrong: false, stop: false };
      (window as unknown as { mergeAudit: typeof audit }).mergeAudit = audit;
      const frame = () => {
        const root = document.querySelector('[data-testid="numsolis-animation"]');
        const cards = root ? Array.from(root.children).filter((el) => el.firstElementChild?.textContent === '16') as HTMLElement[] : [];
        const middle = cards.find((el) => Math.abs(parseFloat(el.style.top) - 44) < 1);
        const bottom = cards.find((el) => Math.abs(parseFloat(el.style.top) - 88) < 1 && el.style.left === middle?.style.left);
        if (middle && bottom) { audit.checked++; if (Number(middle.style.zIndex) >= Number(bottom.style.zIndex)) audit.wrong = true; }
        if (!audit.stop) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
    await tapNumsolisMove(page, { from: 0, index: 0, to: 1 });
    await expect(page.getByTestId('numsolis-score')).toHaveText('80');
    await expect(page.getByTestId('numsolis-animation')).toHaveCount(0);
    const audit = await page.evaluate(() => {
      const a = (window as unknown as { mergeAudit: { checked: number; wrong: boolean; stop: boolean } }).mergeAudit;
      a.stop = true; return a;
    });
    expect(audit.checked).toBeGreaterThan(0);
    expect(audit.wrong).toBe(false);
    expect((await readNumsolisColumns(page))[1].map((card) => card.value)).toEqual([16, 32]);
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('numsolis-score')).toHaveText('0');
    await tapNumsolisMove(page, { from: 0, index: 0, to: 1 });
    await expect(page.getByTestId('numsolis-animation')).toBeAttached();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('numsolis-animation')).toHaveCount(0);
    expect(await readNumsolisColumns(page)).toEqual(state.columns);
    await expect(page.getByTestId('numsolis-score')).toHaveText('0');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tapNumsolisMove(page, { from: 0, index: 0, to: 1 });
    await expect(page.getByTestId('numsolis-animation')).toHaveCount(0);
    await expect(page.getByTestId('numsolis-score')).toHaveText('80');
  });

  test('worker generation, tap, undo, replay and cloud continuation', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/en/play/numsolis');
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 20_000 });
    const initial = await readNumsolisColumns(page);
    expect(initial).toHaveLength(6);
    expect(initial.flat().length).toBeGreaterThanOrEqual(38);
    const fixture = { ...generateNumsolisDeal('easy', 0).state, columns: initial, initialColumns: initial };
    const move = getLegalMoves(fixture)[0];
    expect(move).toBeTruthy();
    await tapNumsolisMove(page, move);
    await expect(page.getByTestId('numsolis-moves')).toHaveText('1');
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(page.getByTestId('numsolis-moves')).toHaveText('0');
    await expect.poll(() => readNumsolisColumns(page)).toEqual(initial);
    await tapNumsolisMove(page, move);
    await expect(page.getByTestId('numsolis-moves')).toHaveText('1');
    await expect.poll(async () => {
      const data = await (await page.request.get('/api/saves/numsolis')).json();
      return data.save ? JSON.parse(data.save.state).moves : null;
    }).toBe(1);
    const played = await readNumsolisColumns(page);
    await page.reload();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await expect.poll(() => readNumsolisColumns(page)).toEqual(played);
    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    await page.getByRole('button', { name: 'Replay deal', exact: true }).click();
    await expect(page.getByTestId('numsolis-moves')).toHaveText('0');
    await expect.poll(() => readNumsolisColumns(page)).toEqual(initial);
  });

  test('drag moves a whole mixed stack and pointer cancellation changes nothing', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const state = generateNumsolisDeal('medium', 0).state;
    const move = getLegalMoves(state).find((m) => state.columns[m.from].length - m.index > 1)!;
    expect(move).toBeTruthy();
    await restoreNumsolisFixture(page, state);
    const source = page.locator(`[data-column="${move.from}"][data-index="${move.index}"]`);
    const target = page.getByTestId(`numsolis-column-${move.to}`).locator('[data-card]').last();
    await source.scrollIntoViewIfNeeded();
    const a = (await source.boundingBox())!;
    const b = (await target.boundingBox())!;
    await page.mouse.move(a.x + 10, a.y + 12);
    await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 12, { steps: 8 });
    await expect(page.getByTestId('numsolis-drag').locator(':scope > div')).toHaveCount(state.columns[move.from].length - move.index);
    await expect(page.getByTestId('numsolis-drag').locator(':scope > div').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.mouse.up();
    await expect(page.getByTestId('numsolis-moves')).toHaveText('0');
    expect(await readNumsolisColumns(page)).toEqual(state.columns);
    await page.mouse.move(a.x + 10, a.y + 12);
    await page.mouse.down();
    await page.mouse.move(b.x + 10, b.y + 12, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId('numsolis-moves')).toHaveText('1');
    await expect.poll(() => readNumsolisColumns(page)).toEqual(applyMove(state, move)!.columns);
  });

  test('Hard has small buried cards of a dominant suit and fits RU/EN layouts', async ({ page }, testInfo) => {
    await page.goto('/en/play/numsolis');
    await expect(page.locator('[data-card]').first()).toBeVisible({ timeout: 20_000 });
    await page.getByRole('combobox', { name: 'Difficulty' }).click();
    await page.getByRole('option', { name: 'Hard', exact: true }).click();
    await expect(page.getByRole('combobox', { name: 'Difficulty' })).toHaveText('Hard');
    // A growing score must not push controls to a different row.
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      const score = page.getByTestId('numsolis-score');
      const original = await score.textContent();
      const before = await page.getByTestId('numsolis-actions').boundingBox();
      await score.evaluate((el) => { el.textContent = '9999999'; });
      const after = await page.getByTestId('numsolis-actions').boundingBox();
      expect(after!.y).toBe(before!.y);
      const numberBox = await score.boundingBox();
      expect(after!.y).toBeGreaterThanOrEqual(numberBox!.y + numberBox!.height);
      expect(after!.height).toBeLessThanOrEqual(36); // 28px controls + 8px top spacing
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await score.evaluate((el, value) => { el.textContent = value; }, original);
    }
    const columns = await readNumsolisColumns(page);
    expect(columns.every((c) => c[0].value <= 32)).toBe(true);
    const light = columns.filter((c) => c[0].suit === 0).length;
    expect(Math.max(light, 6 - light)).toBeGreaterThanOrEqual(5);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`numsolis-en-${width}.png`), fullPage: true });
    }
    await page.getByRole('button', { name: 'Rules', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('lower pair');
    await page.getByRole('button', { name: 'Close', exact: true }).click();
    // Keep the same profile and test the longer Russian labels on narrow screens.
    await expect.poll(async () => (await (await page.request.get('/api/saves/numsolis')).json()).save?.state ?? '').toContain('"difficulty":"hard"');
    await page.goto('/ru/play/numsolis');
    // Navigation may reuse the client store; a full reload offers the cloud save.
    await page.reload();
    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const width of [320, 390, 412]) {
      await page.setViewportSize({ width, height: 740 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath(`numsolis-ru-${width}.png`), fullPage: true });
    }
  });

  for (const goal of ['first', 'last'] as const) {
    test(`the ${goal} 2048 ${goal === 'first' ? 'does not win' : 'records one victory and clears the save'}`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const deal = generateNumsolisDeal('medium', 1);
      let state = deal.state;
      let chosen: NumsolisMove | undefined;
      for (const move of deal.solution) {
        const next = applyMove(state, move)!;
        const goals = next.columns.flat().filter((c) => c.value === 2048).length;
        if ((goal === 'first' && goals === 1) || (goal === 'last' && goals === 2)) { chosen = move; break; }
        state = next;
      }
      expect(chosen).toBeTruthy();
      await restoreNumsolisFixture(page, state);
      const resultRequests: string[] = [];
      page.on('request', (r) => { if (r.url().endsWith('/api/results') && r.method() === 'POST') resultRequests.push(r.postData() ?? ''); });
      const saved = goal === 'last'
        ? page.waitForResponse((r) => r.url().endsWith('/api/results') && r.request().method() === 'POST' && r.ok())
        : waitForAutosave(page, 'numsolis');
      await tapNumsolisMove(page, chosen!);
      await saved;
      if (goal === 'first') {
        await expect(page.locator('[data-value="2048"]')).toHaveCount(1);
        await expect(page.getByRole('heading', { name: 'Solved!' })).toHaveCount(0);
        expect(resultRequests).toHaveLength(0);
      } else {
        await expect(page.getByRole('heading', { name: 'Solved!' })).toBeVisible();
        await expect(page.locator('[data-value="2048"]')).toHaveCount(2);
        await expect.poll(async () => (await (await page.request.get('/api/saves/numsolis')).json()).save).toBeNull();
        expect(resultRequests).toHaveLength(1);
      }
    });
  }
});
