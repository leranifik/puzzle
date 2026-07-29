import { describe, it, expect } from "vitest";
import {
  solvedBoard,
  isSolved,
  isSolvable,
  shuffledBoard,
  newFifteen,
  moveTile,
  fifteenProgress,
  serializeFifteen,
  deserializeFifteen,
  type FifteenState,
} from "@/lib/games/fifteen";

describe("fifteen engine", () => {
  describe("solvedBoard / isSolved", () => {
    it("builds the goal board with 0 in the last cell", () => {
      expect(solvedBoard(3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
      expect(solvedBoard(4).at(-1)).toBe(0);
      expect(solvedBoard(4)).toHaveLength(16);
    });

    it("recognises solved and unsolved boards", () => {
      expect(isSolved(solvedBoard(4))).toBe(true);
      expect(isSolved([2, 1, 3, 4, 5, 6, 7, 8, 0])).toBe(false);
    });
  });

  describe("isSolvable", () => {
    it("accepts the classic solvable 4x4 position", () => {
      // one swap of adjacent tiles in row + even permutation logic
      const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 0, 15];
      expect(isSolvable(board, 4)).toBe(true);
    });

    it("rejects the famous unsolvable 14-15 swap", () => {
      const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 14, 0];
      expect(isSolvable(board, 4)).toBe(false);
    });

    it("odd grids: solvable iff inversions are even", () => {
      expect(isSolvable([1, 2, 3, 4, 5, 6, 7, 8, 0], 3)).toBe(true); // 0 inversions
      expect(isSolvable([2, 1, 3, 4, 5, 6, 7, 8, 0], 3)).toBe(false); // 1 inversion
    });
  });

  describe("shuffledBoard / newFifteen", () => {
    it.each([3, 4, 5])("always produces a solvable, unsolved %ix%i board", (size) => {
      for (let i = 0; i < 25; i++) {
        const board = shuffledBoard(size);
        expect(isSolvable(board, size)).toBe(true);
        expect(isSolved(board)).toBe(false);
        expect([...board].sort((a, b) => a - b)).toEqual(
          Array.from({ length: size * size }, (_, j) => j),
        );
      }
    });

    it("newFifteen starts with zero moves and seconds", () => {
      const g = newFifteen(4);
      expect(g).toMatchObject({ size: 4, moves: 0, seconds: 0 });
    });
  });

  describe("moveTile", () => {
    const base: FifteenState = {
      size: 3,
      board: [1, 2, 3, 4, 0, 5, 6, 7, 8],
      moves: 0,
      seconds: 10,
    };

    it("slides a tile adjacent to the empty cell and counts the move", () => {
      const next = moveTile(base, 1); // tile "2" above the hole
      expect(next).not.toBeNull();
      expect(next!.board).toEqual([1, 0, 3, 4, 2, 5, 6, 7, 8]);
      expect(next!.moves).toBe(1);
      expect(next!.seconds).toBe(10); // untouched
      expect(base.board[1]).toBe(2); // original not mutated
    });

    it("rejects non-adjacent tiles (including diagonals)", () => {
      expect(moveTile(base, 0)).toBeNull(); // diagonal
      expect(moveTile(base, 8)).toBeNull(); // far corner
    });

    it("rejects wrap-around moves across row edges", () => {
      const state: FifteenState = { size: 3, board: [1, 2, 0, 3, 4, 5, 6, 7, 8], moves: 0, seconds: 0 };
      // index 3 is start of next row; visually not adjacent to hole at end of row 0
      expect(moveTile(state, 3)).toBeNull();
    });
  });

  describe("fifteenProgress", () => {
    it("is 1 for a solved board and counts placed tiles otherwise", () => {
      const solved: FifteenState = { size: 3, board: solvedBoard(3), moves: 0, seconds: 0 };
      expect(fifteenProgress(solved)).toBe(1);

      const half: FifteenState = { size: 3, board: [1, 2, 3, 4, 0, 5, 6, 7, 8], moves: 0, seconds: 0 };
      // tiles 1,2,3,4 on target = 4 of 8
      expect(fifteenProgress(half)).toBeCloseTo(4 / 8);
    });
  });

  describe("serialize / deserialize", () => {
    it("round-trips a state", () => {
      const g = newFifteen(4);
      expect(deserializeFifteen(serializeFifteen(g))).toEqual(g);
    });

    it("rejects malformed payloads", () => {
      expect(deserializeFifteen("not json")).toBeNull();
      expect(deserializeFifteen('{"size":4,"board":[1,2,3]}')).toBeNull();
      expect(deserializeFifteen('{"size":"x"}')).toBeNull();
    });

    it("defaults missing counters to 0", () => {
      const raw = JSON.stringify({ size: 3, board: [1, 2, 3, 4, 5, 6, 7, 8, 0] });
      expect(deserializeFifteen(raw)).toMatchObject({ moves: 0, seconds: 0 });
    });
  });
});
