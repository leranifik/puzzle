/**
 * Numsolis — number chain puzzle.
 * Click a tile to clear all connected tiles of the same value (4-way adjacency).
 * Empty cells fall down and are filled with new random numbers.
 */

export type NumsolisState = {
  size: number;
  board: number[]; // 0 = empty
  score: number;
  best: number;
  moves: number;
  seconds: number;
  won: boolean;
  over: boolean;
};

export function newNumsolis(size = 4, best = 0): NumsolisState {
  const board = Array.from({ length: size * size }, () =>
    Math.floor(Math.random() * 4) + 1,
  );
  return {
    size,
    board,
    score: 0,
    best,
    moves: 0,
    seconds: 0,
    won: false,
    over: false,
  };
}

function getValue(board: number[], r: number, c: number, size: number): number {
  return board[r * size + c];
}

function setValue(board: number[], r: number, c: number, size: number, v: number) {
  board[r * size + c] = v;
}

export function canMove(state: NumsolisState): boolean {
  const { size, board } = state;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const v = getValue(board, r, c, size);
      if (v === 0) return true; // empty cell is a move opportunity (will spawn)
      // Check adjacent same value
      const dirs = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [nr, nc] of dirs) {
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (getValue(board, nr, nc, size) === v) return true;
        }
      }
    }
  }
  return false;
}

export function moveNumsolis(state: NumsolisState, index: number): NumsolisState | null {
  const { size, board } = state;
  if (state.won || state.over) return null;
  const r = Math.floor(index / size);
  const c = index % size;
  const v = getValue(board, r, c, size);
  if (v === 0) return null; // can't click empty

  // Find all connected tiles of same value (4-way BFS)
  const connected: [number, number][] = [];
  const visited = new Set<string>();
  const stack: [number, number][] = [[r, c]];
  while (stack.length > 0) {
    const [cr, cc] = stack.pop()!;
    const key = `${cr},${cc}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (getValue(board, cr, cc, size) === v) {
      connected.push([cr, cc]);
      const dirs = [
        [cr - 1, cc],
        [cr + 1, cc],
        [cr, cc - 1],
        [cr, cc + 1],
      ];
      for (const [nr, nc] of dirs) {
        if (nr >= 0 && nr < size && nc >= 0 && nc < size) {
          if (!visited.has(`${nr},${nc}`)) {
            stack.push([nr, nc]);
          }
        }
      }
    }
  }

  if (connected.length < 1) return null; // nothing to clear (shouldn't happen)

  // Create new board: clear connected tiles
  const nextBoard = [...board];
  for (const [cr, cc] of connected) {
    setValue(nextBoard, cr, cc, size, 0);
  }

  // Apply gravity: for each column, pull tiles down, fill top with new random tiles
  const afterGravity = new Array(size * size).fill(0);
  for (let c = 0; c < size; c++) {
    const column: number[] = [];
    for (let r = size - 1; r >= 0; r--) {
      const val = getValue(nextBoard, r, c, size);
      if (val !== 0) column.push(val);
    }
    // Fill from bottom
    for (let r = size - 1; r >= 0; r--) {
      const idxInCol = size - 1 - r;
      if (idxInCol < column.length) {
        setValue(afterGravity, r, c, size, column[idxInCol]);
      } else {
        setValue(afterGravity, r, c, size, Math.floor(Math.random() * 4) + 1);
      }
    }
  }

  const score = state.score + v * connected.length;
  const won = score >= 128; // target score
  const over = !won && !canMove({ size, board: afterGravity, score, best: state.best, moves: state.moves, seconds: state.seconds, won: false, over: false }) && afterGravity.every((v) => v !== 0);

  return {
    ...state,
    board: afterGravity,
    score,
    best: Math.max(state.best, score),
    moves: state.moves + 1,
    won,
    over,
  };
}

export function progressNumsolis(state: NumsolisState): number {
  return Math.min(state.score / 128, 1);
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as NumsolisState;
    if (
      typeof parsed.size !== "number" ||
      !Array.isArray(parsed.board) ||
      parsed.board.length !== parsed.size * parsed.size ||
      typeof parsed.score !== "number" ||
      typeof parsed.best !== "number" ||
      typeof parsed.moves !== "number" ||
      typeof parsed.seconds !== "number" ||
      typeof parsed.won !== "boolean" ||
      typeof parsed.over !== "boolean"
    ) {
      return null;
    }
    return {
      size: parsed.size,
      board: parsed.board,
      score: parsed.score ?? 0,
      best: parsed.best ?? 0,
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
      won: parsed.won ?? false,
      over: parsed.over ?? false,
    };
  } catch {
    return null;
  }
}
