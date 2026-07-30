import { describe, expect, it } from "vitest";
import {
  NUMSOLIS_COLORS,
  NUMSOLIS_COLUMN_COUNT,
  NUMSOLIS_MAX_STACK,
  NUMSOLIS_MAX_VALUE,
  canMoveNumsolis,
  createNumsolisGame,
  deserializeNumsolis,
  isNumsolisComplete,
  isNumsolisValue,
  moveNumsolis,
  numsolisCardCount,
  numsolisInitialCardCount,
  numsolisProgress,
  serializeNumsolis,
  type NumsolisCard,
  type NumsolisColorCount,
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
    colorCount: 2,
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
  const activeColors = NUMSOLIS_COLORS.slice(0, state.colorCount);
  for (const column of state.columns) {
    expect(column.length).toBeLessThanOrEqual(NUMSOLIS_MAX_STACK);
    column.forEach((current, index) => {
      expect(isNumsolisValue(current.value)).toBe(true);
      expect(activeColors).toContain(current.color);
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
    it.each([1, 2] as NumsolisColorCount[])(
      "creates a balanced six-column deal with %i color(s)",
      (colorCount) => {
        const { state, solution } = createNumsolisGame(colorCount, seeded(1));
        expectValid(state);
        expect(state.colorCount).toBe(colorCount);
        expect(numsolisCardCount(state)).toBe(numsolisInitialCardCount(colorCount));
        expect(state.columns.every((column) => column.length > 0)).toBe(true);
        expect(solution.length).toBeGreaterThan(0);
        expect(state.moves).toBe(0);

        for (const color of NUMSOLIS_COLORS.slice(0, colorCount)) {
          const mass = state.columns
            .flat()
            .filter((current) => current.color === color)
            .reduce((sum, current) => sum + current.value, 0);
          expect(mass).toBe(NUMSOLIS_MAX_VALUE);
        }
      },
    );

    it("ships a legal winning certificate for 1- and 2-color deals", () => {
      for (const colorCount of [1, 2] as const) {
        for (let seed = 1; seed <= 50; seed++) {
          const generated = createNumsolisGame(colorCount, seeded(seed));
          let state = generated.state;
          for (const { from, to } of generated.solution) {
            expect(canMoveNumsolis(state, from, to)).toBe(true);
            const result = moveNumsolis(state, from, to);
            expect(result.outcome).not.toBe("none");
            state = result.state;
            expectValid(state);
          }
          expect(isNumsolisComplete(state)).toBe(true);
          expect(state.columns.flat()).toHaveLength(colorCount);
          expect(state.columns.flat().every((current) => current.value === 2048)).toBe(true);
        }
      }
    });
  });

  describe("single- and multi-card moves", () => {
    it("moves one exposed card onto a higher value regardless of color", () => {
      const state = stateOf([
        [card(1, 4, "amber")],
        [card(2, 16, "ivory")],
      ]);
      const result = moveNumsolis(state, 0, 1);
      expect(result.outcome).toBe("moved");
      expect(result.state.columns[0]).toEqual([]);
      expect(result.state.columns[1].map((c) => c.value)).toEqual([16, 4]);
      expect(result.state.moves).toBe(1);
    });

    it("moves a selected card together with every card below it", () => {
      const state = stateOf([
        [card(1, 32, "amber"), card(2, 16, "ivory"), card(3, 8, "amber")],
        [card(4, 64, "amber")],
      ]);
      expect(canMoveNumsolis(state, 0, 1, 1)).toBe(true);
      const result = moveNumsolis(state, 0, 1, 1);
      expect(result.outcome).toBe("moved");
      expect(result.state.columns[0]).toEqual([card(1, 32, "amber")]);
      expect(result.state.columns[1].map((c) => c.value)).toEqual([64, 16, 8]);
    });

    it("collapses matches at a moved packet boundary and chains automatically", () => {
      const state = stateOf([
        [card(1, 8, "amber"), card(2, 16, "amber")],
        [card(3, 16, "amber"), card(4, 8, "amber")],
      ]);
      const result = moveNumsolis(state, 0, 1, 0);
      expect(result.outcome).toBe("merged");
      expect(result.merges).toBe(2);
      expect(result.mergedCardId).toBe(3);
      expect(result.state.columns[0]).toEqual([]);
      expect(result.state.columns[1]).toEqual([
        card(3, 32, "amber"),
        card(2, 16, "amber"),
      ]);
    });

    it("merges equal values only when their colors also match", () => {
      const matching = stateOf([
        [card(1, 8, "amber")],
        [card(2, 8, "amber")],
      ]);
      const merged = moveNumsolis(matching, 0, 1);
      expect(merged.outcome).toBe("merged");
      expect(merged.state.columns[1]).toEqual([card(2, 16, "amber")]);

      const differentColor = stateOf([
        [card(1, 8, "amber")],
        [card(2, 8, "ivory")],
      ]);
      expect(moveNumsolis(differentColor, 0, 1).outcome).toBe("none");
    });

    it("keeps a newly reached 2048 card visible and does not merge it again", () => {
      const state = stateOf(
        [
          [card(1, 1024, "amber")],
          [card(2, 1024, "amber")],
        ],
        { colorCount: 1, initialCards: 2 },
      );
      const result = moveNumsolis(state, 0, 1);
      expect(result.outcome).toBe("merged");
      expect(result.state.columns[1]).toEqual([card(2, 2048, "amber")]);
      expect(isNumsolisComplete(result.state)).toBe(true);
      expect(numsolisProgress(result.state)).toBe(1);

      const twoMax = stateOf([
        [card(3, 2048, "amber")],
        [card(4, 2048, "amber")],
      ]);
      expect(canMoveNumsolis(twoMax, 0, 1)).toBe(false);
    });

    it("rejects empty locked targets, lower targets and a packet over the limit", () => {
      const fullTarget = Array.from({ length: NUMSOLIS_MAX_STACK }, (_, i) =>
        card(i + 10, i % 2 ? 512 : 1024, i % 2 ? "amber" : "ivory"),
      );
      const state = stateOf([
        [card(1, 16, "amber"), card(2, 8, "ivory")],
        fullTarget,
        [],
        [card(3, 4, "amber")],
      ]);
      expect(canMoveNumsolis(state, 0, 0, 0)).toBe(false);
      expect(canMoveNumsolis(state, 0, 2, 0)).toBe(false);
      expect(canMoveNumsolis(state, 0, 3, 0)).toBe(false);
      expect(canMoveNumsolis(state, 0, 1, 0)).toBe(false);
      expect(moveNumsolis(state, 0, 2, 0).state).toBe(state);
    });
  });

  describe("progress and persistence", () => {
    it("tracks progress toward one 2048 per color", () => {
      const state = stateOf(
        [
          [card(1, 512, "amber")],
          [card(2, 512, "amber")],
          [card(3, 512, "amber")],
          [card(4, 512, "amber")],
        ],
        { colorCount: 1, initialCards: 4 },
      );
      expect(numsolisProgress(state)).toBe(0);
      expect(numsolisProgress(moveNumsolis(state, 0, 1).state)).toBeCloseTo(1 / 3);
    });

    it.each([1, 2] as NumsolisColorCount[])("round-trips a valid %i-color game", (count) => {
      const state = createNumsolisGame(count, seeded(99)).state;
      expect(deserializeNumsolis(serializeNumsolis(state))).toEqual(state);
    });

    it("rejects legacy, malformed, oversized, duplicate and non-normalized saves", () => {
      expect(deserializeNumsolis("junk")).toBeNull();
      expect(deserializeNumsolis('{"columns":[]}')).toBeNull();

      const valid = createNumsolisGame(2, seeded(3)).state;
      const duplicate = structuredClone(valid);
      duplicate.columns[0][0].id = duplicate.columns[1][0].id;
      expect(deserializeNumsolis(JSON.stringify(duplicate))).toBeNull();

      const oversized = structuredClone(valid);
      oversized.columns[0] = Array.from({ length: 10 }, (_, i) => card(100 + i, 2, "amber"));
      expect(deserializeNumsolis(JSON.stringify(oversized))).toBeNull();

      const adjacent = structuredClone(valid);
      adjacent.columns[0] = [card(100, 4, "amber"), card(101, 4, "amber")];
      expect(deserializeNumsolis(JSON.stringify(adjacent))).toBeNull();

      const badValue = structuredClone(valid);
      badValue.columns[0][0].value = 3;
      expect(deserializeNumsolis(JSON.stringify(badValue))).toBeNull();

      const legacy = structuredClone(valid) as Partial<NumsolisState>;
      delete legacy.colorCount;
      expect(deserializeNumsolis(JSON.stringify(legacy))).toBeNull();
    });
  });
});
