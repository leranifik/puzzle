import { describe, expect, it } from "vitest";
import {
  NUMSOLIS_COLORS,
  NUMSOLIS_COLUMN_COUNT,
  NUMSOLIS_INITIAL_CARDS,
  NUMSOLIS_MAX_STACK,
  canMoveNumsolis,
  createNumsolisGame,
  deserializeNumsolis,
  isNumsolisComplete,
  isNumsolisValue,
  moveNumsolis,
  numsolisCardCount,
  numsolisProgress,
  serializeNumsolis,
  type NumsolisCard,
  type NumsolisState,
} from "@/lib/games/numsolis";

function card(id: number, value: number, color: NumsolisCard["color"]): NumsolisCard {
  return { id, value, color };
}

function stateOf(columns: NumsolisCard[][], extra: Partial<NumsolisState> = {}): NumsolisState {
  const padded = [...columns, ...Array.from({ length: NUMSOLIS_COLUMN_COUNT - columns.length }, () => [])];
  const count = padded.flat().length;
  return {
    columns: padded,
    nextId: Math.max(0, ...padded.flat().map((c) => c.id)) + 1,
    initialCards: count,
    moves: 0,
    seconds: 0,
    ...extra,
  };
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function expectValid(state: NumsolisState): void {
  expect(state.columns).toHaveLength(NUMSOLIS_COLUMN_COUNT);
  expect(numsolisCardCount(state)).toBeLessThanOrEqual(NUMSOLIS_COLUMN_COUNT * NUMSOLIS_MAX_STACK);
  const ids = new Set<number>();
  for (const column of state.columns) {
    expect(column.length).toBeLessThanOrEqual(NUMSOLIS_MAX_STACK);
    column.forEach((current, index) => {
      expect(isNumsolisValue(current.value)).toBe(true);
      expect(NUMSOLIS_COLORS).toContain(current.color);
      expect(ids.has(current.id)).toBe(false);
      ids.add(current.id);
      if (index > 0) {
        const below = column[index - 1];
        expect(current.value === below.value && current.color === below.color).toBe(false);
      }
    });
  }
}

describe("Numsolis engine", () => {
  describe("guaranteed-solvable generation", () => {
    it("creates six top-anchored stacks with at most nine valid cards", () => {
      const { state, solution } = createNumsolisGame(seeded(1));
      expectValid(state);
      expect(numsolisCardCount(state)).toBe(NUMSOLIS_INITIAL_CARDS);
      expect(solution.length).toBeGreaterThan(0);
      expect(state.moves).toBe(0);
    });

    it("ships a legal winning certificate for every generated deal", () => {
      for (let seed = 1; seed <= 100; seed++) {
        const generated = createNumsolisGame(seeded(seed));
        let state = generated.state;
        for (const { from, to } of generated.solution) {
          expect(canMoveNumsolis(state, from, to)).toBe(true);
          const result = moveNumsolis(state, from, to);
          expect(result.outcome).not.toBe("none");
          state = result.state;
          expectValid(state);
        }
        expect(isNumsolisComplete(state)).toBe(true);
      }
    });
  });

  describe("moves and automatic merging", () => {
    it("moves an exposed card onto a higher value regardless of color", () => {
      const state = stateOf([
        [card(1, 4, "ruby")],
        [card(2, 16, "silver")],
      ]);
      const result = moveNumsolis(state, 0, 1);
      expect(result.outcome).toBe("moved");
      expect(result.state.columns[0]).toEqual([]);
      expect(result.state.columns[1].map((c) => c.value)).toEqual([16, 4]);
      expect(result.state.moves).toBe(1);
    });

    it("merges equal values only when their colors also match", () => {
      const matching = stateOf([
        [card(1, 8, "amber")],
        [card(2, 8, "amber")],
      ]);
      const merged = moveNumsolis(matching, 0, 1);
      expect(merged.outcome).toBe("merged");
      expect(merged.merges).toBe(1);
      expect(merged.state.columns[1]).toEqual([card(2, 16, "amber")]);

      const differentColor = stateOf([
        [card(1, 8, "amber")],
        [card(2, 8, "ruby")],
      ]);
      expect(moveNumsolis(differentColor, 0, 1).outcome).toBe("none");
    });

    it("automatically performs a merge chain", () => {
      const state = stateOf([
        [card(1, 8, "ivory")],
        [card(2, 32, "ruby"), card(3, 16, "ivory"), card(4, 8, "ivory")],
      ]);
      const result = moveNumsolis(state, 0, 1);
      expect(result.outcome).toBe("merged");
      expect(result.merges).toBe(2);
      expect(result.state.columns[1]).toEqual([
        card(2, 32, "ruby"),
        card(3, 32, "ivory"),
      ]);
    });

    it("removes a matching pair of 1024 cards", () => {
      const state = stateOf([
        [card(1, 1024, "silver")],
        [card(2, 1024, "silver")],
      ]);
      const result = moveNumsolis(state, 0, 1);
      expect(result.outcome).toBe("cleared");
      expect(isNumsolisComplete(result.state)).toBe(true);
      expect(numsolisProgress(result.state)).toBe(1);
    });

    it("rejects empty targets, lower targets, same columns and a tenth card", () => {
      const fullTarget = Array.from({ length: NUMSOLIS_MAX_STACK }, (_, i) =>
        card(i + 2, 1024 - (i % 2) * 512, i % 2 ? "amber" : "ruby"),
      );
      const state = stateOf([
        [card(1, 4, "ivory")],
        fullTarget,
        [],
        [card(20, 2, "amber")],
      ]);
      expect(canMoveNumsolis(state, 0, 0)).toBe(false);
      expect(canMoveNumsolis(state, 0, 2)).toBe(false);
      expect(canMoveNumsolis(state, 0, 3)).toBe(false);
      expect(canMoveNumsolis(state, 0, 1)).toBe(false);
      expect(moveNumsolis(state, 0, 1).state).toBe(state);
    });
  });

  describe("progress and persistence", () => {
    it("tracks progress by cards cleared", () => {
      const state = stateOf(
        [[card(1, 2, "amber")], [card(2, 2, "amber")]],
        { initialCards: 4 },
      );
      expect(numsolisProgress(state)).toBe(0.5);
      expect(numsolisProgress(moveNumsolis(state, 0, 1).state)).toBe(0.75);
    });

    it("round-trips a valid game", () => {
      const state = createNumsolisGame(seeded(99)).state;
      expect(deserializeNumsolis(serializeNumsolis(state))).toEqual(state);
    });

    it("rejects malformed, oversized, duplicate and non-normalized saves", () => {
      expect(deserializeNumsolis("junk")).toBeNull();
      expect(deserializeNumsolis('{"columns":[]}')).toBeNull();

      const valid = createNumsolisGame(seeded(3)).state;
      const duplicate = structuredClone(valid);
      duplicate.columns[0][0].id = duplicate.columns[1][0].id;
      expect(deserializeNumsolis(JSON.stringify(duplicate))).toBeNull();

      const oversized = structuredClone(valid);
      oversized.columns[0] = Array.from({ length: 10 }, (_, i) => card(100 + i, 2, "amber"));
      expect(deserializeNumsolis(JSON.stringify(oversized))).toBeNull();

      const adjacent = structuredClone(valid);
      adjacent.columns[0] = [card(100, 4, "ruby"), card(101, 4, "ruby")];
      expect(deserializeNumsolis(JSON.stringify(adjacent))).toBeNull();

      const badValue = structuredClone(valid);
      badValue.columns[0][0].value = 3;
      expect(deserializeNumsolis(JSON.stringify(badValue))).toBeNull();
    });
  });
});
