/**
 * Sudoku engine: generator (backtracking with dig-out), validator, serializer.
 * Cells are a flat array of 81 numbers; 0 = empty.
 */

export type SudokuDifficulty = "easy" | "medium" | "hard";

export type SudokuState = {
  puzzle: number[]; // initial givens (0 = empty)
  solution: number[]; // full solution
  cells: number[]; // current user grid (includes givens)
  notes: number[][]; // pencil marks per cell
  difficulty: SudokuDifficulty;
  moves: number;
  seconds: number;
  mistakes: number;
};

const HOLES: Record<SudokuDifficulty, number> = {
  easy: 38,
  medium: 46,
  hard: 52,
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function canPlace(cells: number[], index: number, value: number): boolean {
  const row = Math.floor(index / 9);
  const col = index % 9;
  for (let i = 0; i < 9; i++) {
    if (cells[row * 9 + i] === value) return false;
    if (cells[i * 9 + col] === value) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      if (cells[r * 9 + c] === value) return false;
    }
  }
  return true;
}

function fillGrid(cells: number[], index = 0): boolean {
  if (index === 81) return true;
  if (cells[index] !== 0) return fillGrid(cells, index + 1);
  for (const value of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
    if (canPlace(cells, index, value)) {
      cells[index] = value;
      if (fillGrid(cells, index + 1)) return true;
      cells[index] = 0;
    }
  }
  return false;
}

/** Counts solutions up to `limit` (used to keep puzzles unique). */
function countSolutions(cells: number[], limit = 2): number {
  const index = cells.indexOf(0);
  if (index === -1) return 1;
  let count = 0;
  for (let value = 1; value <= 9; value++) {
    if (canPlace(cells, index, value)) {
      cells[index] = value;
      count += countSolutions(cells, limit - count);
      cells[index] = 0;
      if (count >= limit) break;
    }
  }
  return count;
}

export function newSudoku(difficulty: SudokuDifficulty = "easy"): SudokuState {
  const solution = new Array<number>(81).fill(0);
  fillGrid(solution);

  const puzzle = [...solution];
  const order = shuffle(Array.from({ length: 81 }, (_, i) => i));
  let removed = 0;

  for (const index of order) {
    if (removed >= HOLES[difficulty]) break;
    const backup = puzzle[index];
    puzzle[index] = 0;
    const copy = [...puzzle];
    if (countSolutions(copy) !== 1) {
      puzzle[index] = backup; // keep uniqueness
    } else {
      removed++;
    }
  }

  return {
    puzzle,
    solution,
    cells: [...puzzle],
    notes: Array.from({ length: 81 }, () => []),
    difficulty,
    moves: 0,
    seconds: 0,
    mistakes: 0,
  };
}

export function isGiven(state: SudokuState, index: number): boolean {
  return state.puzzle[index] !== 0;
}

/** Indexes that conflict with placing `value` at `index` in the current grid. */
export function conflicts(cells: number[], index: number, value: number): number[] {
  if (value === 0) return [];
  const row = Math.floor(index / 9);
  const col = index % 9;
  const out: number[] = [];
  for (let i = 0; i < 9; i++) {
    const ri = row * 9 + i;
    const ci = i * 9 + col;
    if (ri !== index && cells[ri] === value) out.push(ri);
    if (ci !== index && cells[ci] === value) out.push(ci);
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++) {
    for (let c = bc; c < bc + 3; c++) {
      const bi = r * 9 + c;
      if (bi !== index && cells[bi] === value) out.push(bi);
    }
  }
  return [...new Set(out)];
}

export function isComplete(state: SudokuState): boolean {
  return state.cells.every((v, i) => v === state.solution[i]);
}

export function sudokuProgress(state: SudokuState): number {
  const total = state.puzzle.filter((v) => v === 0).length;
  if (total === 0) return 1;
  const correct = state.puzzle.reduce(
    (acc, given, i) =>
      given === 0 && state.cells[i] === state.solution[i] ? acc + 1 : acc,
    0,
  );
  return correct / total;
}

export function serializeSudoku(state: SudokuState): string {
  return JSON.stringify(state);
}

export function deserializeSudoku(raw: string): SudokuState | null {
  try {
    const parsed = JSON.parse(raw) as SudokuState;
    if (
      !Array.isArray(parsed.puzzle) ||
      parsed.puzzle.length !== 81 ||
      !Array.isArray(parsed.cells) ||
      parsed.cells.length !== 81 ||
      !Array.isArray(parsed.solution) ||
      parsed.solution.length !== 81
    ) {
      return null;
    }
    return {
      puzzle: parsed.puzzle,
      solution: parsed.solution,
      cells: parsed.cells,
      notes: Array.isArray(parsed.notes) && parsed.notes.length === 81
        ? parsed.notes
        : Array.from({ length: 81 }, () => []),
      difficulty: parsed.difficulty ?? "easy",
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
      mistakes: parsed.mistakes ?? 0,
    };
  } catch {
    return null;
  }
}
