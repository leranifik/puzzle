import { describe, it, expect } from "vitest";
import {
  newSudoku,
  isGiven,
  conflicts,
  isComplete,
  sudokuProgress,
  serializeSudoku,
  deserializeSudoku,
  type SudokuState,
} from "@/lib/games/sudoku";

function isValidSolution(cells: number[]): boolean {
  const seen = (values: number[]) => new Set(values).size === 9;
  for (let i = 0; i < 9; i++) {
    const row = cells.slice(i * 9, i * 9 + 9);
    const col = Array.from({ length: 9 }, (_, j) => cells[j * 9 + i]);
    const box = Array.from({ length: 9 }, (_, j) => {
      const r = Math.floor(i / 3) * 3 + Math.floor(j / 3);
      const c = (i % 3) * 3 + (j % 3);
      return cells[r * 9 + c];
    });
    if (!seen(row) || !seen(col) || !seen(box)) return false;
  }
  return true;
}

describe("sudoku engine", () => {
  describe("newSudoku", () => {
    it.each(["easy", "medium", "hard"] as const)(
      "generates a valid solution and consistent puzzle (%s)",
      (difficulty) => {
        const s = newSudoku(difficulty);
        expect(isValidSolution(s.solution)).toBe(true);
        // puzzle givens must match the solution
        s.puzzle.forEach((v, i) => {
          if (v !== 0) expect(v).toBe(s.solution[i]);
        });
        // cells start as a copy of the puzzle
        expect(s.cells).toEqual(s.puzzle);
        expect(s.notes).toHaveLength(81);
        expect(s.mistakes).toBe(0);
      },
    );

    it("harder difficulties leave fewer givens", () => {
      const givens = (d: Parameters<typeof newSudoku>[0]) =>
        newSudoku(d).puzzle.filter((v) => v !== 0).length;
      // ranges, since dig-out respects uniqueness and may stop early
      expect(givens("easy")).toBeGreaterThanOrEqual(43);
      expect(givens("hard")).toBeLessThan(givens("easy"));
    });
  });

  describe("isGiven", () => {
    it("distinguishes givens from empty cells", () => {
      const s = newSudoku("easy");
      const givenIdx = s.puzzle.findIndex((v) => v !== 0);
      const emptyIdx = s.puzzle.findIndex((v) => v === 0);
      expect(isGiven(s, givenIdx)).toBe(true);
      expect(isGiven(s, emptyIdx)).toBe(false);
    });
  });

  describe("conflicts", () => {
    // deterministic grid: 0 everywhere except a few cells
    const cells = new Array(81).fill(0);
    cells[0] = 5; // r0c0
    cells[8] = 7; // r0c8 (same row as 0)
    cells[72] = 9; // r8c0 (same col as 0)
    cells[10] = 3; // r1c1 (same box as 0)

    it("detects row, column and box conflicts", () => {
      expect(conflicts(cells, 4, 5)).toContain(0); // same row
      expect(conflicts(cells, 36, 5)).toContain(0); // same column (r4c0)
      expect(conflicts(cells, 20, 3)).toContain(10); // same box (r2c2)
    });

    it("returns empty for value 0 and non-conflicting placements", () => {
      expect(conflicts(cells, 40, 0)).toEqual([]);
      expect(conflicts(cells, 40, 1)).toEqual([]);
    });

    it("does not report the cell itself", () => {
      expect(conflicts(cells, 0, 5)).not.toContain(0);
    });
  });

  describe("isComplete / sudokuProgress", () => {
    it("full correct grid is complete with progress 1", () => {
      const s = newSudoku("easy");
      const done: SudokuState = { ...s, cells: [...s.solution] };
      expect(isComplete(done)).toBe(true);
      expect(sudokuProgress(done)).toBe(1);
    });

    it("wrong entries do not count toward progress", () => {
      const s = newSudoku("easy");
      const emptyIdx = s.puzzle.findIndex((v) => v === 0);
      const wrong = s.solution[emptyIdx] === 1 ? 2 : 1;
      const cells = [...s.puzzle];
      cells[emptyIdx] = wrong;
      expect(sudokuProgress({ ...s, cells })).toBe(0);
      cells[emptyIdx] = s.solution[emptyIdx];
      expect(sudokuProgress({ ...s, cells })).toBeGreaterThan(0);
    });
  });

  describe("serialize / deserialize", () => {
    it("round-trips a state", () => {
      const s = newSudoku("medium");
      expect(deserializeSudoku(serializeSudoku(s))).toEqual(s);
    });

    it("rejects malformed payloads", () => {
      expect(deserializeSudoku("nope")).toBeNull();
      expect(deserializeSudoku('{"puzzle":[1,2,3]}')).toBeNull();
    });

    it("regenerates notes when missing or wrong length", () => {
      const s = newSudoku("easy");
      const raw = JSON.stringify({ ...s, notes: [[1]] });
      const restored = deserializeSudoku(raw)!;
      expect(restored.notes).toHaveLength(81);
      expect(restored.notes.every((n) => Array.isArray(n))).toBe(true);
    });
  });
});
