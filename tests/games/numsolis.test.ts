import { describe, expect, it } from "vitest";
import {
  NUMSOLIS_COLORS,
  NUMSOLIS_COLUMNS,
  NUMSOLIS_STACK_LIMIT,
  NUMSOLIS_TARGET,
  canMoveNumsolis,
  deserializeNumsolis,
  generateNumsolis,
  isNumsolisWon,
  moveNumsolis,
  newNumsolis,
  serializeNumsolis,
} from "@/lib/games/numsolis";

describe("numsolis", () => {
  it("generates six-column layouts within the nine-card stack limit", () => {
    for (let i = 0; i < 200; i++) {
      const state = newNumsolis();
      expect(state.columns).toHaveLength(NUMSOLIS_COLUMNS);
      expect(state.columns.every((column) => column.length <= NUMSOLIS_STACK_LIMIT)).toBe(true);
      for (const card of state.columns.flat()) {
        expect(card.value).toBeGreaterThanOrEqual(2);
        expect(card.value).toBeLessThanOrEqual(NUMSOLIS_TARGET);
        expect(Math.log2(card.value) % 1).toBe(0);
        expect(NUMSOLIS_COLORS).toContain(card.color);
      }
    }
  });

  it("every generated layout has a known legal solution", () => {
    for (let i = 0; i < 100; i++) {
      const generated = generateNumsolis();
      let state = generated.state;
      for (const step of generated.solution) {
        expect(canMoveNumsolis(state, step.from, step.to)).toBe(true);
        const next = moveNumsolis(state, step.from, step.to);
        expect(next).not.toBeNull();
        state = next!;
      }
      expect(isNumsolisWon(state)).toBe(true);
    }
  });

  it("allows smaller cards on higher values regardless of color", () => {
    const { state } = generateNumsolis(0);
    state.columns[0] = [{ id: 10, value: 64, color: "amber" }];
    state.columns[1] = [{ id: 11, value: 128, color: "slate" }];
    state.columns[2] = [];
    state.columns[3] = [{ id: 12, value: 256, color: "ivory" }];
    state.columns[4] = [{ id: 13, value: 512, color: "umber" }];
    state.nextId = 14;
    expect(canMoveNumsolis(state, 0, 1)).toBe(true);
  });

  it("auto-merges equal values only when their colors also match", () => {
    const state = {
      columns: [
        [{ id: 1, value: 4, color: "amber" as const }],
        [{ id: 2, value: 4, color: "amber" as const }],
        [{ id: 3, value: 4, color: "slate" as const }],
        [], [], [],
      ],
      moves: 0,
      seconds: 0,
      nextId: 4,
    };
    const merged = moveNumsolis(state, 1, 0);
    expect(merged?.columns[0]).toEqual([{ id: 1, value: 8, color: "amber" }]);
    expect(canMoveNumsolis(state, 2, 0)).toBe(false);
  });

  it("rejects moves that would exceed nine cards", () => {
    const full = Array.from({ length: NUMSOLIS_STACK_LIMIT }, (_, i) => ({
      id: i + 1,
      value: 1024,
      color: "slate" as const,
    }));
    const state = {
      columns: [[{ id: 20, value: 2, color: "amber" as const }], full, [], [], [], []],
      moves: 0,
      seconds: 0,
      nextId: 21,
    };
    expect(canMoveNumsolis(state, 0, 1)).toBe(false);
  });

  it("round-trips valid saves and rejects malformed ones", () => {
    const state = newNumsolis();
    expect(deserializeNumsolis(serializeNumsolis(state))).toEqual(state);
    expect(deserializeNumsolis("not json")).toBeNull();
    expect(deserializeNumsolis(JSON.stringify({ ...state, columns: state.columns.slice(0, 5) }))).toBeNull();

    const overfull = structuredClone(state);
    while (overfull.columns[0].length <= NUMSOLIS_STACK_LIMIT) {
      overfull.columns[0].push({ id: overfull.nextId++, value: 2, color: "amber" });
    }
    expect(deserializeNumsolis(JSON.stringify(overfull))).toBeNull();
  });
});
