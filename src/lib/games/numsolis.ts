/**
 * Numsolis — solitaire-style card merge puzzle (Numsol rules).
 * 6 stacks (columns) — one common field. Cards pinned to the top.
 * Cards: value (power of 2) + color (gold / ink).
 * Solvable deterministic start (not random).
 * Rules:
 * - Move a card onto a stack with a higher value (any color) — card placed on top.
 * - Move a card onto same value + same color — merge: value doubles, card removed.
 * - Stack must not exceed 9 cards.
 * - Win: all stacks empty (board cleared).
 */

export type Card = { v: number; c: string };

export type NumsolisState = {
  stacks: Card[][]; // 7 columns, bottom -> top
  best: number;
  moves: number;
  seconds: number;
  won: boolean;
  over: boolean;
};

const COLORS = ["gold", "ink"] as const;
const VALUES = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024] as const;

function randomValue(): number {
  const vals = [2, 4, 8, 16, 32];
  return vals[Math.floor(Math.random() * vals.length)];
}

function randomColor(): string {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export function newNumsolis(best = 0): NumsolisState {
  // Deterministic solvable initial layout: pairs arranged to merge up
  const stacks: Card[][] = [
    [{ v: 2, c: "gold" }, { v: 2, c: "gold" }],
    [{ v: 4, c: "ink" }, { v: 4, c: "ink" }],
    [{ v: 8, c: "gold" }, { v: 8, c: "gold" }],
    [{ v: 16, c: "ink" }, { v: 16, c: "ink" }],
    [{ v: 32, c: "gold" }, { v: 32, c: "gold" }],
    [{ v: 2, c: "ink" }, { v: 4, c: "gold" }],
  ];
  return {
    stacks,
    best,
    moves: 0,
    seconds: 0,
    won: false,
    over: false,
  };
}

function cloneStacks(stacks: Card[][]): Card[][] {
  return stacks.map((col) => col.map((card) => ({ ...card })));
}

function totalCards(stacks: Card[][]): number {
  return stacks.reduce((sum, col) => sum + col.length, 0);
}

function canMoveState(stacks: Card[][], fromCol: number, toCol: number): boolean {
  if (fromCol === toCol) return false;
  const fromStack = stacks[fromCol];
  if (!fromStack || fromStack.length === 0) return false;
  const toStack = stacks[toCol];
  if (!toStack) return false;
  if (toStack.length >= 9) return false; // max 9 cards
  const card = fromStack[fromStack.length - 1]; // top card
  if (toStack.length === 0) return true;
  const target = toStack[toStack.length - 1];
  if (target.v > card.v) return true; // higher value, any color
  if (target.v === card.v && target.c === card.c) return true; // same value + color -> merge
  return false;
}

export function canMove(state: NumsolisState): boolean {
  const { stacks } = state;
  for (let from = 0; from < stacks.length; from++) {
    for (let to = 0; to < stacks.length; to++) {
      if (canMoveState(stacks, from, to)) return true;
    }
  }
  return false;
}

export function moveNumsolis(state: NumsolisState, fromCol: number, toCol: number): NumsolisState | null {
  if (state.won || state.over) return null;
  if (fromCol === toCol) return null;
  const stacks = cloneStacks(state.stacks);
  const fromStack = stacks[fromCol];
  const toStack = stacks[toCol];
  if (!fromStack || fromStack.length === 0) return null;
  if (!toStack) return null;
  if (toStack.length >= 9) return null; // max 9
  const card = { ...fromStack[fromStack.length - 1] };

  if (toStack.length === 0) {
    // Move to empty stack
    fromStack.pop();
    toStack.push(card);
  } else {
    const target = toStack[toStack.length - 1];
    if (target.v === card.v && target.c === card.c) {
      // Merge: value doubles, selected card removed
      toStack[toStack.length - 1] = { v: target.v * 2, c: target.c };
      fromStack.pop();
    } else if (target.v > card.v) {
      // Place on higher value
      fromStack.pop();
      toStack.push(card);
    } else {
      return null; // invalid
    }
  }

  const won = stacks.every((col) => col.length === 0);
  const over = !won && !canMove({ stacks, best: state.best, moves: state.moves, seconds: state.seconds, won, over: false });

  return {
    stacks,
    best: Math.max(state.best, 1024), // just track best value seen? Let's keep moves/seconds
    moves: state.moves + 1,
    seconds: state.seconds,
    won,
    over,
  };
}

export function progressNumsolis(state: NumsolisState): number {
  const total = totalCards(state.stacks);
  return Math.max(0, 1 - total / (6 * 5)); // rough progress toward empty
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify({
    stacks: state.stacks,
    best: state.best,
    moves: state.moves,
    seconds: state.seconds,
    won: state.won,
    over: state.over,
  });
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as {
      stacks?: Card[][];
      best?: number;
      moves?: number;
      seconds?: number;
      won?: boolean;
      over?: boolean;
    };
    if (!Array.isArray(parsed.stacks) || parsed.stacks.length !== 6) {
      if (!Array.isArray(parsed.stacks)) return null;
    }
    const stacks = (parsed.stacks || []).map((col) =>
      (col || []).map((card) => {
        if (typeof card === "object" && card !== null && "v" in card && "c" in card) {
          return { v: Number(card.v), c: String(card.c) };
        }
        return { v: 2, c: "gold" };
      }),
    );
    return {
      stacks,
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
