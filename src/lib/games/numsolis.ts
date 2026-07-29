/**
 * Numsolis (Numsol clone) engine.
 * Solitaire meets 2048:
 * - Move top cards around and merge those with the same value AND the same color.
 * - Move a card onto another card when the other card has a higher value, regardless of color.
 * - A stack must not exceed 9 cards (indicated by bottom line).
 * - Card values are powers of 2 (2 to 1024).
 * - Same color and size cards automatically collapse (merge).
 */

export type Card = {
  id: number;
  value: number; // 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024
  color: number; // 0, 1, 2, 3 (4 colors)
};

export type NumsolisState = {
  columns: Card[][];
  nextId: number;
  score: number;
  moves: number;
  seconds: number;
  over: boolean;
  won: boolean;
  best: number;
};

export type MoveOutcome = "none" | "moved" | "merged";

const NUM_COLUMNS = 6;
const MAX_STACK_SIZE = 9;

export function newNumsolis(best = 0): NumsolisState {
  let nextId = 1;
  const columns: Card[][] = Array.from({ length: NUM_COLUMNS }, () => []);

  // Initial guaranteed solvable card pool
  const initialPool = [
    { value: 2, color: 0 }, { value: 2, color: 0 },
    { value: 2, color: 1 }, { value: 2, color: 1 },
    { value: 2, color: 2 }, { value: 2, color: 2 },
    { value: 2, color: 3 }, { value: 2, color: 3 },
    { value: 4, color: 0 }, { value: 4, color: 0 },
    { value: 4, color: 1 }, { value: 4, color: 1 },
    { value: 4, color: 2 }, { value: 4, color: 2 },
    { value: 4, color: 3 }, { value: 4, color: 3 },
    { value: 8, color: 0 }, { value: 8, color: 1 },
    { value: 8, color: 2 }, { value: 8, color: 3 },
    { value: 16, color: 0 }, { value: 16, color: 1 },
  ];

  const pool = [...initialPool].sort(() => Math.random() - 0.5);

  for (const item of pool) {
    const validCols = columns
      .map((col, idx) => (col.length < 6 ? idx : -1))
      .filter((idx) => idx !== -1);
    if (validCols.length === 0) break;
    const targetCol = validCols[Math.floor(Math.random() * validCols.length)];
    columns[targetCol].push({
      id: nextId++,
      value: item.value,
      color: item.color,
    });
  }

  if (columns.every((col) => col.length === 0)) {
    columns[0].push({ id: nextId++, value: 2, color: 0 });
    columns[0].push({ id: nextId++, value: 2, color: 0 });
  }

  return {
    columns,
    nextId,
    score: 0,
    moves: 0,
    seconds: 0,
    over: false,
    won: false,
    best,
  };
}

export function canMove(
  state: NumsolisState,
  srcCol: number,
  destCol: number
): boolean {
  if (
    srcCol < 0 ||
    srcCol >= NUM_COLUMNS ||
    destCol < 0 ||
    destCol >= NUM_COLUMNS
  )
    return false;
  if (srcCol === destCol) return false;
  const src = state.columns[srcCol];
  if (src.length === 0) return false;

  const card = src[src.length - 1];
  const dest = state.columns[destCol];

  // If destination is empty, any card can be moved (stack size 1 <= 9)
  if (dest.length === 0) {
    return dest.length + 1 <= MAX_STACK_SIZE;
  }

  const destTop = dest[dest.length - 1];

  // 1. Same value AND same color -> merge (stack size decreases or stays same)
  if (card.value === destTop.value && card.color === destTop.color) {
    return true;
  }

  // 2. Target top has higher value -> stack (must not exceed max stack size 9)
  if (destTop.value > card.value) {
    return dest.length + 1 <= MAX_STACK_SIZE;
  }

  return false;
}

export function moveCard(
  state: NumsolisState,
  srcCol: number,
  destCol: number
): { state: NumsolisState; outcome: MoveOutcome } {
  if (!canMove(state, srcCol, destCol)) {
    return { state, outcome: "none" };
  }

  const columns = state.columns.map((col) => [...col]);
  const src = columns[srcCol];
  const card = src.pop()!;
  const dest = columns[destCol];

  let outcome: MoveOutcome = "moved";
  let scoreGained = 0;

  if (dest.length > 0) {
    const destTop = dest[dest.length - 1];
    if (card.value === destTop.value && card.color === destTop.color) {
      destTop.value *= 2;
      scoreGained += destTop.value;
      outcome = "merged";
    } else {
      dest.push(card);
    }
  } else {
    dest.push(card);
  }

  // Auto-collapse / merge check on destination column
  let collapsed = true;
  while (collapsed) {
    collapsed = false;
    if (dest.length >= 2) {
      const top = dest[dest.length - 1];
      const below = dest[dest.length - 2];
      if (top.value === below.value && top.color === below.color) {
        dest.pop();
        below.value *= 2;
        scoreGained += below.value;
        outcome = "merged";
        collapsed = true;
      }
    }
  }

  const newScore = state.score + scoreGained;
  const newMoves = state.moves + 1;
  const won = columns.every((col) => col.length === 0);

  let hasMoves = won;
  if (!won) {
    for (let r = 0; r < NUM_COLUMNS; r++) {
      for (let d = 0; d < NUM_COLUMNS; d++) {
        if (r !== d && canMove({ ...state, columns }, r, d)) {
          hasMoves = true;
          break;
        }
      }
      if (hasMoves) break;
    }
  }

  const over = won || !hasMoves;

  const nextState: NumsolisState = {
    ...state,
    columns,
    score: newScore,
    best: Math.max(state.best, newScore),
    moves: newMoves,
    won,
    over,
  };

  return { state: nextState, outcome };
}

export function progressNumsolis(state: NumsolisState): number {
  const maxVal = Math.max(
    2,
    ...state.columns.flatMap((col) => col.map((c) => c.value))
  );
  const valProgress = Math.log2(maxVal) / 10; // 1024 = 2^10
  const totalCards = state.columns.reduce((acc, col) => acc + col.length, 0);
  if (totalCards === 0) return 1;
  return Math.min(Math.max(valProgress, 0), 0.99);
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as NumsolisState;
    if (!Array.isArray(parsed.columns) || parsed.columns.length !== NUM_COLUMNS)
      return null;
    return {
      columns: parsed.columns.map((col) =>
        Array.isArray(col)
          ? col.filter(
              (c) =>
                typeof c?.id === "number" &&
                typeof c?.value === "number" &&
                typeof c?.color === "number"
            )
          : []
      ),
      nextId: parsed.nextId ?? 100,
      score: parsed.score ?? 0,
      best: parsed.best ?? 0,
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
      over: parsed.over ?? false,
      won: parsed.won ?? false,
    };
  } catch {
    return null;
  }
}
