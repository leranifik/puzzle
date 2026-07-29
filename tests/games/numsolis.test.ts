import { describe, it, expect } from "vitest";
import {
  newNumsolis,
  applyMove,
  canMove,
  collapseColumn,
  isStable,
  isWon,
  isSolvable,
  solveNums,
  numsolisProgress,
  totalCards,
  isPowerOfTwoInRange,
  serializeNumsolis,
  deserializeNumsolis,
  COLUMN_COUNT,
  MAX_STACK,
  MAX_VALUE,
  COLOR_COUNT,
  type Card,
  type Column,
  type NumsolisState,
} from "@/lib/games/numsolis";

const card = (id: number, v: number, c: number): Card => ({ id, v, c });

function stateFrom(cols: Column[]): NumsolisState {
  const columns = Array.from({ length: COLUMN_COUNT }, (_, i) => cols[i] ?? []);
  const initialCount = columns.reduce((s, c) => s + c.length, 0);
  const maxId = columns.reduce((m, c) => c.reduce((mm, k) => Math.max(mm, k.id), m), 0);
  return { columns, nextId: maxId + 1, moves: 0, seconds: 0, initialCount };
}

/** A brute-force solver that returns the actual sequence of moves, if any. */
function findSolution(state: NumsolisState, cap = 200_000): [number, number][] | null {
  type Node = { cols: Column[]; path: [number, number][] };
  const start: Node = { cols: state.columns.map((c) => c.slice()), path: [] };
  const key = (cols: Column[]) =>
    cols
      .map((c) => c.map((k) => `${k.v}.${k.c}`).join(","))
      .sort()
      .join("|");
  const seen = new Set<string>([key(start.cols)]);
  const stack: Node[] = [start];
  let nodes = 0;
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.cols.every((c) => c.length === 0)) return cur.path;
    if (++nodes > cap) return null;
    const s: NumsolisState = {
      columns: cur.cols,
      nextId: 1,
      moves: 0,
      seconds: 0,
      initialCount: 0,
    };
    for (let i = 0; i < COLUMN_COUNT; i++) {
      for (let j = 0; j < COLUMN_COUNT; j++) {
        if (!canMove(s, i, j)) continue;
        const next = applyMove(s, i, j)!;
        const k = key(next.columns);
        if (seen.has(k)) continue;
        seen.add(k);
        stack.push({ cols: next.columns, path: [...cur.path, [i, j]] });
      }
    }
  }
  return null;
}

describe("numsolis engine", () => {
  describe("value helpers", () => {
    it("recognises powers of two in [2,1024]", () => {
      for (const v of [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024]) {
        expect(isPowerOfTwoInRange(v)).toBe(true);
      }
      for (const v of [1, 3, 6, 2048, 0, -2, 1000]) {
        expect(isPowerOfTwoInRange(v)).toBe(false);
      }
    });
  });

  describe("collapseColumn", () => {
    it("doubles a same value + same color bottom pair", () => {
      const { col, collapsed } = collapseColumn([card(1, 4, 0), card(2, 4, 0)], 10);
      expect(collapsed).toBe(true);
      expect(col).toHaveLength(1);
      expect(col[0].v).toBe(8);
      expect(col[0].c).toBe(0);
    });

    it("does not merge same value but different color", () => {
      const input = [card(1, 4, 0), card(2, 4, 1)];
      const { col, collapsed } = collapseColumn(input, 10);
      expect(collapsed).toBe(false);
      expect(col).toHaveLength(2);
    });

    it("cascades merges down a run", () => {
      // 2,2 -> 4, then 4 with existing 4 -> 8
      const { col } = collapseColumn([card(1, 4, 0), card(2, 2, 0), card(3, 2, 0)], 10);
      expect(col).toHaveLength(1);
      expect(col[0].v).toBe(8);
    });

    it("clears a pair of 1024 completely", () => {
      const { col, collapsed } = collapseColumn(
        [card(1, MAX_VALUE, 2), card(2, MAX_VALUE, 2)],
        10,
      );
      expect(collapsed).toBe(true);
      expect(col).toHaveLength(0);
    });
  });

  describe("canMove / applyMove rules", () => {
    it("allows a card onto a strictly higher card of any color", () => {
      const s = stateFrom([[card(1, 4, 0)], [card(2, 8, 1)]]);
      expect(canMove(s, 0, 1)).toBe(true); // 4 onto 8 (diff color) ok
    });

    it("rejects a card onto a lower or equal different-color card", () => {
      const s = stateFrom([[card(1, 8, 0)], [card(2, 4, 1)], [card(3, 8, 1)]]);
      expect(canMove(s, 0, 1)).toBe(false); // 8 onto 4
      expect(canMove(s, 0, 2)).toBe(false); // 8 onto 8 different color
    });

    it("allows and performs a same value + same color merge", () => {
      const s = stateFrom([[card(1, 4, 0)], [card(2, 4, 0)]]);
      expect(canMove(s, 0, 1)).toBe(true);
      const next = applyMove(s, 0, 1)!;
      expect(next.columns[0]).toHaveLength(0);
      expect(next.columns[1]).toHaveLength(1);
      expect(next.columns[1][0].v).toBe(8);
      expect(next.moves).toBe(1);
    });

    it("allows any card onto an empty stack", () => {
      const s = stateFrom([[card(1, 512, 3)], []]);
      expect(canMove(s, 0, 1)).toBe(true);
    });

    it("never lets a plain stack exceed nine cards", () => {
      // target already 9 cards (strictly descending, alt colors), push a smaller card
      const target: Column = [];
      for (let i = 0; i < MAX_STACK; i++) target.push(card(100 + i, 1024, i % 2));
      // make them strictly descending so it's a valid stack visually; values here
      // don't matter for the limit check, only length does.
      const s = stateFrom([[card(1, 2, 0)], target]);
      expect(target).toHaveLength(MAX_STACK);
      expect(canMove(s, 0, 1)).toBe(false);
    });

    it("permits a merge even when the target has nine cards", () => {
      const target: Column = [];
      for (let i = 0; i < MAX_STACK - 1; i++) target.push(card(200 + i, 1024, 0));
      target.push(card(299, 4, 1)); // bottom is 4/color1
      const s = stateFrom([[card(1, 4, 1)], target]);
      expect(target).toHaveLength(MAX_STACK);
      expect(canMove(s, 0, 1)).toBe(true);
    });

    it("returns null for an illegal move", () => {
      const s = stateFrom([[card(1, 8, 0)], [card(2, 4, 1)]]);
      expect(applyMove(s, 0, 1)).toBeNull();
      expect(applyMove(s, 0, 0)).toBeNull();
    });
  });

  describe("win + progress", () => {
    it("detects a cleared board", () => {
      expect(isWon(stateFrom([[], [], []]))).toBe(true);
      expect(isWon(stateFrom([[card(1, 2, 0)]]))).toBe(false);
    });

    it("reports progress as the fraction of cards cleared", () => {
      const s = stateFrom([[card(1, 8, 1)], [card(2, 4, 0)], [card(3, 4, 0)]]);
      expect(totalCards(s)).toBe(3);
      expect(numsolisProgress(s)).toBe(0);
      // merge the two 4/0 cards -> one 8, clearing one card from three
      const merged = applyMove(s, 1, 2)!;
      expect(totalCards(merged)).toBe(2);
      expect(numsolisProgress(merged)).toBeCloseTo(1 / 3, 5);
    });

    it("progress reaches 1 on a solved board", () => {
      // a pair of 1024 of the same color vanishes on merge -> board cleared
      const s = stateFrom([[card(1, MAX_VALUE, 0)], [card(2, MAX_VALUE, 0)]]);
      const done = applyMove(s, 0, 1)!;
      expect(isWon(done)).toBe(true);
      expect(numsolisProgress(done)).toBe(1);
    });
  });

  describe("generated boards", () => {
    it.each(["easy", "medium", "hard"] as const)(
      "produces valid, stable, solvable %s boards",
      (difficulty) => {
        for (let i = 0; i < 12; i++) {
          const s = newNumsolis(difficulty);
          expect(s.columns).toHaveLength(COLUMN_COUNT);
          expect(s.columns.every((c) => c.length <= MAX_STACK)).toBe(true);
          expect(
            s.columns.every((c) =>
              c.every((k) => isPowerOfTwoInRange(k.v) && k.c >= 0 && k.c < COLOR_COUNT),
            ),
          ).toBe(true);
          expect(isStable(s.columns)).toBe(true);
          expect(totalCards(s)).toBe(s.initialCount);
          expect(s.initialCount).toBeGreaterThan(0);
          expect(isSolvable(s.columns)).toBe(true);
        }
      },
    );

    it("a generated easy board can actually be played to a full clear", () => {
      const s = newNumsolis("easy");
      const solution = findSolution(s);
      expect(solution).not.toBeNull();
      // replay the moves and confirm the board clears
      let cur = s;
      for (const [from, to] of solution!) {
        const next = applyMove(cur, from, to);
        expect(next).not.toBeNull();
        cur = next!;
      }
      expect(isWon(cur)).toBe(true);
    });
  });

  describe("solveNums", () => {
    it("returns false for an unwinnable board", () => {
      // two lone cards of different value and color that can never merge or
      // fully stack away (each needs a partner to vanish).
      const cols = [[4 * 8 + 0], [8 * 8 + 1]];
      expect(solveNums(cols)).toBe(false);
    });
  });

  describe("serialization", () => {
    it("round-trips a state", () => {
      const s = newNumsolis("medium");
      const restored = deserializeNumsolis(serializeNumsolis(s));
      expect(restored).not.toBeNull();
      expect(restored!.columns).toEqual(s.columns);
      expect(restored!.initialCount).toBe(s.initialCount);
    });

    it("rejects malformed input", () => {
      expect(deserializeNumsolis("not json")).toBeNull();
      expect(deserializeNumsolis(JSON.stringify({ columns: [] }))).toBeNull();
      expect(
        deserializeNumsolis(JSON.stringify({ columns: Array.from({ length: 6 }, () => [{ id: 1, v: 3, c: 0 }]) })),
      ).toBeNull(); // 3 is not a power of two
      expect(
        deserializeNumsolis(
          JSON.stringify({ columns: Array.from({ length: 6 }, () => [{ id: 1, v: 4, c: 9 }]) }),
        ),
      ).toBeNull(); // color out of range
    });

    it("rejects a column longer than the stack limit", () => {
      const bad = {
        columns: [
          Array.from({ length: MAX_STACK + 1 }, (_, i) => ({ id: i, v: 4, c: 0 })),
          [],
          [],
          [],
          [],
          [],
        ],
      };
      expect(deserializeNumsolis(JSON.stringify(bad))).toBeNull();
    });
  });
});
