/**
 * Fifteen (sliding puzzle) engine.
 * Board is a flat array of length size*size; 0 is the empty cell.
 */

export type FifteenState = {
  size: number;
  board: number[];
  moves: number;
  seconds: number;
};

export function solvedBoard(size: number): number[] {
  const n = size * size;
  return Array.from({ length: n }, (_, i) => (i + 1) % n);
}

export function isSolved(board: number[]): boolean {
  const goal = solvedBoard(Math.sqrt(board.length));
  return board.every((v, i) => v === goal[i]);
}

/** Solvability check for the classic n^2-1 puzzle. */
export function isSolvable(board: number[], size: number): boolean {
  let inversions = 0;
  const tiles = board.filter((v) => v !== 0);
  for (let i = 0; i < tiles.length; i++) {
    for (let j = i + 1; j < tiles.length; j++) {
      if (tiles[i] > tiles[j]) inversions++;
    }
  }
  if (size % 2 === 1) return inversions % 2 === 0;
  const emptyRowFromBottom = size - Math.floor(board.indexOf(0) / size);
  return (inversions + emptyRowFromBottom) % 2 === 1;
}

export function shuffledBoard(size: number): number[] {
  const board = solvedBoard(size);
  do {
    for (let i = board.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [board[i], board[j]] = [board[j], board[i]];
    }
  } while (!isSolvable(board, size) || isSolved(board));
  return board;
}

export function newFifteen(size = 4): FifteenState {
  return { size, board: shuffledBoard(size), moves: 0, seconds: 0 };
}

/** Returns the new state if the tile at `index` can slide, otherwise null. */
export function moveTile(state: FifteenState, index: number): FifteenState | null {
  const { size, board } = state;
  const empty = board.indexOf(0);
  const rowA = Math.floor(index / size);
  const colA = index % size;
  const rowB = Math.floor(empty / size);
  const colB = empty % size;

  const adjacent =
    (rowA === rowB && Math.abs(colA - colB) === 1) ||
    (colA === colB && Math.abs(rowA - rowB) === 1);
  if (!adjacent) return null;

  const next = [...board];
  [next[index], next[empty]] = [next[empty], next[index]];
  return { ...state, board: next, moves: state.moves + 1 };
}

/** Fraction of tiles already on their target cell (for save progress). */
export function fifteenProgress(state: FifteenState): number {
  const goal = solvedBoard(state.size);
  const placed = state.board.filter((v, i) => v !== 0 && v === goal[i]).length;
  return placed / (state.board.length - 1);
}

export function serializeFifteen(state: FifteenState): string {
  return JSON.stringify(state);
}

export function deserializeFifteen(raw: string): FifteenState | null {
  try {
    const parsed = JSON.parse(raw) as FifteenState;
    if (
      typeof parsed.size !== "number" ||
      !Array.isArray(parsed.board) ||
      parsed.board.length !== parsed.size * parsed.size
    ) {
      return null;
    }
    return {
      size: parsed.size,
      board: parsed.board,
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
    };
  } catch {
    return null;
  }
}
