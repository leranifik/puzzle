import { describe, expect, it } from "vitest";
import {
  NUMSOLIS_COLORS,
  NUMSOLIS_COLUMNS,
  NUMSOLIS_DIFFICULTIES,
  NUMSOLIS_MAX_DEALT_VALUE,
  NUMSOLIS_STACK_LIMIT,
  NUMSOLIS_TARGET,
  canMoveNumsolis,
  deserializeNumsolis,
  evaluateNumsolisDifficulty,
  generateNumsolis,
  isNumsolisWon,
  moveNumsolis,
  newNumsolis,
  previewNumsolisMove,
  serializeNumsolis,
  type NumsolisState,
} from "@/lib/games/numsolis";

function simpleState(columns: NumsolisState["columns"], closedColumns = new Array(6).fill(false)): NumsolisState {
  const ids = columns.flat().map((card) => card.id);
  return {
    columns,
    closedColumns,
    moves: 0,
    seconds: 0,
    nextId: Math.max(0, ...ids) + 1,
    difficulty: "medium",
  };
}

describe("numsolis", () => {
  it("uses exactly two logical colors", () => {
    expect(NUMSOLIS_COLORS).toEqual(["ivory", "slate"]);
  });

  it("generates six non-empty columns within the nine-card limit and never deals 2048", () => {
    for (const difficulty of NUMSOLIS_DIFFICULTIES) {
      for (let i = 0; i < 40; i++) {
        const state = newNumsolis(difficulty);
        expect(state.difficulty).toBe(difficulty);
        expect(state.columns).toHaveLength(NUMSOLIS_COLUMNS);
        expect(state.closedColumns).toEqual(new Array(NUMSOLIS_COLUMNS).fill(false));
        expect(state.columns.every((column) => column.length > 0 && column.length <= NUMSOLIS_STACK_LIMIT)).toBe(true);
        for (const card of state.columns.flat()) {
          expect(card.value).toBeGreaterThanOrEqual(2);
          expect(card.value).toBeLessThanOrEqual(NUMSOLIS_MAX_DEALT_VALUE);
          expect(card.value).not.toBe(NUMSOLIS_TARGET);
          expect(Math.log2(card.value) % 1).toBe(0);
          expect(NUMSOLIS_COLORS).toContain(card.color);
        }
      }
    }
  });

  it("every difficulty has a known legal path to 2048 in both colors with closing columns", () => {
    for (const difficulty of NUMSOLIS_DIFFICULTIES) {
      for (let i = 0; i < 20; i++) {
        const generated = generateNumsolis(difficulty);
        let state = generated.state;
        for (const step of generated.solution) {
          expect(canMoveNumsolis(state, step.from, step.to, step.start)).toBe(true);
          const next = moveNumsolis(state, step.from, step.to, step.start);
          expect(next).not.toBeNull();
          state = next!;
        }
        expect(isNumsolisWon(state)).toBe(true);
        for (const color of NUMSOLIS_COLORS) {
          expect(state.columns.flat().some((card) => card.color === color && card.value === 2048)).toBe(true);
        }
      }
    }
  });

  it("keeps easy unchanged while making medium and hard substantially denser", () => {
    for (let i = 0; i < 20; i++) {
      const easy = generateNumsolis("easy");
      const easyMetrics = evaluateNumsolisDifficulty(easy.state, easy.solution);
      expect(easyMetrics.score).toBeGreaterThanOrEqual(80);
      expect(easyMetrics.score).toBeLessThan(120);
      expect(easyMetrics.solutionMoves).toBeGreaterThanOrEqual(18);
      expect(easyMetrics.solutionMoves).toBeLessThanOrEqual(22);
      expect(easyMetrics.maxColumnHeight).toBeGreaterThanOrEqual(5);
      expect(easyMetrics.maxColumnHeight).toBeLessThanOrEqual(7);
      expect(easyMetrics.buriedPairDepth).toBeGreaterThanOrEqual(10);
      expect(easyMetrics.buriedPairDepth).toBeLessThanOrEqual(30);
      expect(easyMetrics.openMergeMoves).toBeLessThanOrEqual(12);
      expect(easyMetrics.decoyMoves).toBeGreaterThanOrEqual(10);
      expect(easyMetrics.decoyRatio).toBeGreaterThanOrEqual(0.5);

      const medium = generateNumsolis("medium");
      const mediumMetrics = evaluateNumsolisDifficulty(medium.state, medium.solution);
      expect(mediumMetrics.score).toBeGreaterThanOrEqual(160);
      expect(mediumMetrics.score).toBeLessThan(220);
      expect(mediumMetrics.solutionMoves).toBeGreaterThanOrEqual(36);
      expect(mediumMetrics.solutionMoves).toBeLessThanOrEqual(46);
      expect(mediumMetrics.maxColumnHeight).toBeGreaterThanOrEqual(7);
      expect(mediumMetrics.maxColumnHeight).toBeLessThanOrEqual(9);
      expect(mediumMetrics.buriedPairDepth).toBeGreaterThanOrEqual(30);
      expect(mediumMetrics.buriedPairDepth).toBeLessThanOrEqual(75);
      expect(mediumMetrics.openMergeMoves).toBeLessThanOrEqual(14);
      expect(mediumMetrics.decoyMoves).toBeGreaterThanOrEqual(20);
      expect(mediumMetrics.decoyRatio).toBeGreaterThanOrEqual(0.6);

      const hard = generateNumsolis("hard");
      const hardMetrics = evaluateNumsolisDifficulty(hard.state, hard.solution);
      expect(hardMetrics.score).toBeGreaterThanOrEqual(220);
      expect(hardMetrics.solutionMoves).toBeGreaterThanOrEqual(48);
      expect(hardMetrics.solutionMoves).toBeLessThanOrEqual(60);
      expect(hardMetrics.maxColumnHeight).toBeGreaterThanOrEqual(8);
      expect(hardMetrics.buriedPairDepth).toBeGreaterThanOrEqual(50);
      expect(hardMetrics.openMergeMoves).toBeLessThanOrEqual(12);
      expect(hardMetrics.decoyMoves).toBeGreaterThanOrEqual(20);
      expect(hardMetrics.decoyRatio).toBeGreaterThanOrEqual(0.62);
    }
  });

  it("allows a smaller card on a higher value regardless of color", () => {
    const state = simpleState([
      [{ id: 1, value: 64, color: "ivory" }],
      [{ id: 2, value: 128, color: "slate" }],
      [], [], [], [],
    ]);
    expect(canMoveNumsolis(state, 0, 1, 0)).toBe(true);
  });

  it("moves a whole suffix, including an entire column", () => {
    const state = simpleState([
      [
        { id: 1, value: 128, color: "ivory" },
        { id: 2, value: 64, color: "slate" },
        { id: 3, value: 32, color: "ivory" },
      ],
      [{ id: 4, value: 256, color: "slate" }],
      [], [], [], [],
    ]);

    const suffix = moveNumsolis(state, 0, 1, 1);
    expect(suffix?.columns[0].map((card) => card.value)).toEqual([128]);
    expect(suffix?.columns[1].map((card) => card.value)).toEqual([256, 64, 32]);
    expect(suffix?.closedColumns[0]).toBe(false);

    const whole = moveNumsolis(state, 0, 2, 0);
    expect(whole?.columns[0]).toEqual([]);
    expect(whole?.columns[2].map((card) => card.value)).toEqual([128, 64, 32]);
    expect(whole?.closedColumns[0]).toBe(true);
  });

  it("permanently forbids moves into a column after it has been emptied", () => {
    const state = simpleState([
      [{ id: 1, value: 64, color: "ivory" }],
      [{ id: 2, value: 128, color: "slate" }],
      [{ id: 3, value: 32, color: "ivory" }],
      [], [], [],
    ]);
    const emptied = moveNumsolis(state, 0, 1, 0)!;
    expect(emptied.columns[0]).toEqual([]);
    expect(emptied.closedColumns[0]).toBe(true);
    expect(canMoveNumsolis(emptied, 2, 0, 0)).toBe(false);
  });

  it("creates 2048 from matching 1024 cards but does not win until both colors reach 2048", () => {
    const oneColor = simpleState([
      [{ id: 1, value: 1024, color: "ivory" }],
      [{ id: 2, value: 1024, color: "ivory" }],
      [], [], [], [],
    ]);
    const merged = moveNumsolis(oneColor, 1, 0, 0);
    expect(merged?.columns[0]).toEqual([{ id: 1, value: 2048, color: "ivory" }]);
    expect(merged && isNumsolisWon(merged)).toBe(false);

    const bothColors = simpleState([
      [{ id: 1, value: 2048, color: "ivory" }],
      [{ id: 2, value: 2048, color: "slate" }],
      [], [], [], [],
    ]);
    expect(isNumsolisWon(bothColors)).toBe(true);

    const otherColor = simpleState([
      [{ id: 1, value: 1024, color: "ivory" }],
      [{ id: 2, value: 1024, color: "slate" }],
      [], [], [], [],
    ]);
    expect(canMoveNumsolis(otherColor, 1, 0, 0)).toBe(false);
  });

  it("exposes every chained collapse as a separate animation stage", () => {
    const state = simpleState([
      [{ id: 1, value: 512, color: "ivory" }],
      [
        { id: 2, value: 1024, color: "ivory" },
        { id: 3, value: 512, color: "ivory" },
      ],
      [], [], [], [],
    ]);
    const preview = previewNumsolisMove(state, 0, 1, 0);
    expect(preview).not.toBeNull();
    expect(preview!.stages).toHaveLength(3);
    expect(preview!.stages[0].columns[1].map((card) => card.value)).toEqual([1024, 512, 512]);
    expect(preview!.stages[1].columns[1].map((card) => card.value)).toEqual([1024, 1024]);
    expect(preview!.stages[2].columns[1].map((card) => card.value)).toEqual([2048]);
  });

  it("rejects stack moves that would leave more than nine cards", () => {
    const full = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      value: 1024 >> Math.min(i, 8),
      color: "slate" as const,
    }));
    const state = simpleState([
      [
        { id: 20, value: 4, color: "ivory" },
        { id: 21, value: 2, color: "slate" },
      ],
      full,
      [], [], [], [],
    ]);
    expect(canMoveNumsolis(state, 0, 1, 0)).toBe(false);
  });

  it("round-trips valid saves and rejects malformed or legacy ones", () => {
    const state = newNumsolis("hard");
    expect(deserializeNumsolis(serializeNumsolis(state))).toEqual(state);
    expect(deserializeNumsolis("not json")).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, difficulty: "nightmare" }))).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, columns: state.columns.slice(0, 5) }))).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, closedColumns: undefined }))).toBeNull();

    const overfull = structuredClone(state);
    while (overfull.columns[0].length <= NUMSOLIS_STACK_LIMIT) {
      overfull.columns[0].push({ id: overfull.nextId++, value: 2, color: "ivory" });
    }
    expect(deserializeNumsolis(JSON.stringify(overfull))).toBeNull();
  });
});