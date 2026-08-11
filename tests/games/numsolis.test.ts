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
  generateNumsolis,
  isNumsolisWon,
  moveNumsolis,
  newNumsolis,
  serializeNumsolis,
  type NumsolisState,
} from "@/lib/games/numsolis";

function simpleState(columns: NumsolisState["columns"]): NumsolisState {
  const ids = columns.flat().map((card) => card.id);
  return {
    columns,
    moves: 0,
    seconds: 0,
    nextId: Math.max(0, ...ids) + 1,
    difficulty: "medium",
  };
}

describe("numsolis", () => {
  it("uses exactly three logical colors", () => {
    expect(NUMSOLIS_COLORS).toEqual(["ivory", "slate", "umber"]);
  });

  it("generates six-column layouts within the nine-card limit and never deals 2048", () => {
    for (const difficulty of NUMSOLIS_DIFFICULTIES) {
      for (let i = 0; i < 80; i++) {
        const state = newNumsolis(difficulty);
        expect(state.difficulty).toBe(difficulty);
        expect(state.columns).toHaveLength(NUMSOLIS_COLUMNS);
        expect(state.columns.every((column) => column.length <= NUMSOLIS_STACK_LIMIT)).toBe(true);
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

  it("every difficulty has a known legal path to 2048 in every color", () => {
    for (const difficulty of NUMSOLIS_DIFFICULTIES) {
      for (let i = 0; i < 40; i++) {
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
        { id: 2, value: 64, color: "umber" },
        { id: 3, value: 32, color: "slate" },
      ],
      [{ id: 4, value: 256, color: "umber" }],
      [], [], [], [],
    ]);

    const suffix = moveNumsolis(state, 0, 1, 1);
    expect(suffix?.columns[0].map((card) => card.value)).toEqual([128]);
    expect(suffix?.columns[1].map((card) => card.value)).toEqual([256, 64, 32]);

    const whole = moveNumsolis(state, 0, 2, 0);
    expect(whole?.columns[0]).toEqual([]);
    expect(whole?.columns[2].map((card) => card.value)).toEqual([128, 64, 32]);
  });

  it("creates 2048 from matching 1024 cards but does not win until all colors reach 2048", () => {
    const oneColor = simpleState([
      [{ id: 1, value: 1024, color: "ivory" }],
      [{ id: 2, value: 1024, color: "ivory" }],
      [], [], [], [],
    ]);
    const merged = moveNumsolis(oneColor, 1, 0, 0);
    expect(merged?.columns[0]).toEqual([{ id: 1, value: 2048, color: "ivory" }]);
    expect(merged && isNumsolisWon(merged)).toBe(false);

    const allColors = simpleState([
      [{ id: 1, value: 2048, color: "ivory" }],
      [{ id: 2, value: 2048, color: "slate" }],
      [{ id: 3, value: 2048, color: "umber" }],
      [], [], [],
    ]);
    expect(isNumsolisWon(allColors)).toBe(true);

    const otherColor = simpleState([
      [{ id: 1, value: 1024, color: "ivory" }],
      [{ id: 2, value: 1024, color: "slate" }],
      [], [], [], [],
    ]);
    expect(canMoveNumsolis(otherColor, 1, 0, 0)).toBe(false);
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
        { id: 21, value: 2, color: "umber" },
      ],
      full,
      [], [], [], [],
    ]);
    expect(canMoveNumsolis(state, 0, 1, 0)).toBe(false);
  });

  it("round-trips valid saves and rejects malformed ones", () => {
    const state = newNumsolis("hard");
    expect(deserializeNumsolis(serializeNumsolis(state))).toEqual(state);
    expect(deserializeNumsolis("not json")).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, difficulty: "nightmare" }))).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, columns: state.columns.slice(0, 5) }))).toBeNull();

    const overfull = structuredClone(state);
    while (overfull.columns[0].length <= NUMSOLIS_STACK_LIMIT) {
      overfull.columns[0].push({ id: overfull.nextId++, value: 2, color: "ivory" });
    }
    expect(deserializeNumsolis(JSON.stringify(overfull))).toBeNull();
  });
});
