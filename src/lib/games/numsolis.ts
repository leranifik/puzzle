/**
 * Numsolis — a relaxing blend of 2048 and Solitaire.
 *
 * One shared field with six top-anchored stacks (columns). Every card carries
 * a value that is a power of two (2..1024) and one of a few colors.
 *
 * Rules
 * - You may pick up the bottom (free) card of any stack and drop it on another
 *   stack.
 * - A card can be dropped on a stack whose bottom card has a HIGHER value,
 *   regardless of color (the classic solitaire descending rule).
 * - A card can be dropped on a stack whose bottom card has the SAME value AND
 *   the SAME color — the two collapse (2048-style merge).
 * - Whenever the two bottom cards of a stack share value AND color they
 *   collapse automatically, and the collapse cascades. Merging two 1024 cards
 *   of the same color clears them from the board; anything lower doubles.
 * - A stack may never exceed nine cards (shown by the bottom line).
 *
 * Clear every card to win. Boards are generated so a solution always exists.
 *
 * This module is a pure engine: no React, no I/O. It is fully unit tested,
 * including a solver that guarantees each generated board is solvable.
 */

export type Card = { id: number; v: number; c: number };
/** A column is ordered top -> bottom; the last element is the free card. */
export type Column = Card[];

export type NumsolisState = {
  columns: Column[];
  nextId: number;
  moves: number;
  seconds: number;
  /** Number of cards the board started with (for the progress bar). */
  initialCount: number;
};

export type Difficulty = "easy" | "medium" | "hard";

export const COLUMN_COUNT = 6;
export const MAX_STACK = 9;
export const MIN_VALUE = 2;
export const MAX_VALUE = 1024;
export const COLOR_COUNT = 4;

/* ----------------------------- small helpers ----------------------------- */

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function isPowerOfTwoInRange(v: number): boolean {
  if (v < MIN_VALUE || v > MAX_VALUE) return false;
  return (v & (v - 1)) === 0;
}

export function totalCards(state: NumsolisState): number {
  return state.columns.reduce((sum, col) => sum + col.length, 0);
}

/* ------------------------------- collapse -------------------------------- */

/**
 * Collapse the bottom of a column as far as it cascades. Two equal-value,
 * equal-color cards become one of double the value; a pair of MAX_VALUE cards
 * vanishes entirely. Returns the new column and the advanced id counter.
 */
export function collapseColumn(
  col: Column,
  startId: number,
): { col: Column; nextId: number; collapsed: boolean } {
  const out = col.slice();
  let nextId = startId;
  let collapsed = false;
  while (out.length >= 2) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a.v === b.v && a.c === b.c) {
      out.pop();
      out.pop();
      collapsed = true;
      if (a.v < MAX_VALUE) out.push({ id: nextId++, v: a.v * 2, c: a.c });
      // a pair of MAX_VALUE cards simply disappears
    } else {
      break;
    }
  }
  return { col: out, nextId, collapsed };
}

/** True when no stack has two auto-collapsible cards at its bottom. */
export function isStable(columns: Column[]): boolean {
  return columns.every((col) => {
    if (col.length < 2) return true;
    const a = col[col.length - 2];
    const b = col[col.length - 1];
    return !(a.v === b.v && a.c === b.c);
  });
}

/* -------------------------------- moves ---------------------------------- */

/** Can the free card of column `from` legally land on column `to`? */
export function canMove(state: NumsolisState, from: number, to: number): boolean {
  if (from === to) return false;
  const source = state.columns[from];
  const target = state.columns[to];
  if (!source || !target || source.length === 0) return false;

  const card = source[source.length - 1];

  if (target.length === 0) return true; // any card may fill an empty stack

  const t = target[target.length - 1];
  const merge = t.v === card.v && t.c === card.c;
  const stack = t.v > card.v;
  if (!merge && !stack) return false;

  // A plain stacking move must respect the nine-card limit; a merge collapses,
  // so it can never leave more than nine behind.
  if (!merge && target.length >= MAX_STACK) return false;
  return true;
}

/** Apply a move, returning the next state, or null if the move is illegal. */
export function applyMove(
  state: NumsolisState,
  from: number,
  to: number,
): NumsolisState | null {
  if (!canMove(state, from, to)) return null;

  const columns = state.columns.map((col) => col.slice());
  const card = columns[from].pop()!;
  columns[to].push(card);

  const { col, nextId } = collapseColumn(columns[to], state.nextId);
  columns[to] = col;

  return {
    columns,
    nextId,
    moves: state.moves + 1,
    seconds: state.seconds,
    initialCount: state.initialCount,
  };
}

export function isWon(state: NumsolisState): boolean {
  return state.columns.every((col) => col.length === 0);
}

/** 0..1 fraction of the initial cards already cleared. */
export function numsolisProgress(state: NumsolisState): number {
  if (state.initialCount === 0) return 1;
  const remaining = totalCards(state);
  return Math.min(1, Math.max(0, 1 - remaining / state.initialCount));
}

/* -------------------------------- solver --------------------------------- */
/**
 * Numeric solver used to guarantee generated boards are solvable. Cards are
 * encoded as `v * 8 + c` (color < 8), so identical encoding means identical
 * value and color. Empty stacks are interchangeable, so states are
 * canonicalised by sorting the columns before de-duplication.
 */

const SOLVER_NODE_CAP = 120_000;

function encode(v: number, c: number): number {
  return v * 8 + c;
}
function valueOf(code: number): number {
  return Math.floor(code / 8);
}

function collapseNums(col: number[]): number[] {
  const out = col.slice();
  while (out.length >= 2) {
    const a = out[out.length - 2];
    const b = out[out.length - 1];
    if (a === b) {
      out.pop();
      out.pop();
      const v = valueOf(a);
      if (v < MAX_VALUE) out.push(encode(v * 2, a % 8));
    } else {
      break;
    }
  }
  return out;
}

function legalNums(cols: number[][], from: number, to: number): boolean {
  if (from === to) return false;
  const source = cols[from];
  if (source.length === 0) return false;
  const card = source[source.length - 1];
  const target = cols[to];
  if (target.length === 0) return true;
  const t = target[target.length - 1];
  const merge = t === card;
  const stack = valueOf(t) > valueOf(card);
  if (!merge && !stack) return false;
  if (!merge && target.length >= MAX_STACK) return false;
  return true;
}

function canonical(cols: number[][]): string {
  return cols
    .map((c) => c.join(","))
    .sort()
    .join("|");
}

/** Returns true when the board can be cleared completely. */
export function solveNums(columns: number[][]): boolean {
  const start = columns.map((c) => c.slice());
  const stack: number[][][] = [start];
  const seen = new Set<string>([canonical(start)]);
  let nodes = 0;

  while (stack.length) {
    const cur = stack.pop()!;
    if (cur.every((c) => c.length === 0)) return true;
    if (++nodes > SOLVER_NODE_CAP) return false;

    const firstEmpty = cur.findIndex((c) => c.length === 0);
    const merges: number[][][] = [];
    const others: number[][][] = [];

    for (let i = 0; i < cur.length; i++) {
      if (cur[i].length === 0) continue;
      const card = cur[i][cur[i].length - 1];
      for (let j = 0; j < cur.length; j++) {
        if (j === i) continue;
        if (cur[j].length === 0 && j !== firstEmpty) continue; // empties are equal
        if (!legalNums(cur, i, j)) continue;
        const next = cur.map((c, k) =>
          k === i ? c.slice(0, -1) : k === j ? collapseNums(c.concat(card)) : c.slice(),
        );
        const key = canonical(next);
        if (seen.has(key)) continue;
        seen.add(key);
        const targetTop = cur[j][cur[j].length - 1];
        (targetTop === card ? merges : others).push(next);
      }
    }
    // Explore merges first (pushed last => popped first) to find clears sooner.
    for (const s of others) stack.push(s);
    for (const s of merges) stack.push(s);
  }
  return false;
}

export function isSolvable(columns: Column[]): boolean {
  return solveNums(columns.map((col) => col.map((card) => encode(card.v, card.c))));
}

/* ------------------------------ generation ------------------------------- */

type DiffConfig = {
  groups: number;
  minSplits: number;
  maxSplits: number;
  placeCols: number;
};

const DIFFICULTIES: Record<Difficulty, DiffConfig> = {
  easy: { groups: 2, minSplits: 0, maxSplits: 1, placeCols: 4 },
  medium: { groups: 3, minSplits: 1, maxSplits: 2, placeCols: 4 },
  hard: { groups: 4, minSplits: 1, maxSplits: 3, placeCols: 5 },
};

/**
 * Build one single-color "clear group": a multiset of powers of two summing to
 * 2048. Starting from [1024, 1024] and repeatedly splitting a card into two
 * halves keeps the group mergeable back down to a vanishing 1024 pair, so the
 * group is always clearable in isolation.
 */
function buildGroupValues(minSplits: number, maxSplits: number): number[] {
  const vals = [MAX_VALUE, MAX_VALUE];
  const splits = minSplits + randInt(maxSplits - minSplits + 1);
  for (let s = 0; s < splits; s++) {
    const candidates = vals
      .map((v, i) => ({ v, i }))
      .filter((o) => o.v >= 128); // keep halves >= 64, safely inside 2..1024
    if (candidates.length === 0) break;
    const pick = candidates[randInt(candidates.length)];
    vals.splice(pick.i, 1);
    vals.push(pick.v / 2, pick.v / 2);
  }
  return vals;
}

/** A tiny board that is always solvable — used as a safety net. */
function fallbackBoard(): { columns: Column[]; nextId: number; initialCount: number } {
  const columns: Column[] = Array.from({ length: COLUMN_COUNT }, () => []);
  let id = 1;
  columns[0].push({ id: id++, v: MAX_VALUE, c: 0 });
  columns[1].push({ id: id++, v: MAX_VALUE, c: 0 });
  columns[2].push({ id: id++, v: MAX_VALUE, c: 1 });
  columns[3].push({ id: id++, v: MAX_VALUE, c: 1 });
  return { columns, nextId: id, initialCount: 4 };
}

function generateBoard(difficulty: Difficulty): {
  columns: Column[];
  nextId: number;
  initialCount: number;
} {
  const cfg = DIFFICULTIES[difficulty];

  for (let attempt = 0; attempt < 120; attempt++) {
    const cards: Card[] = [];
    let id = 1;
    for (let g = 0; g < cfg.groups; g++) {
      const color = randInt(COLOR_COUNT);
      for (const v of buildGroupValues(cfg.minSplits, cfg.maxSplits)) {
        cards.push({ id: id++, v, c: color });
      }
    }
    shuffle(cards);

    const columns: Column[] = Array.from({ length: COLUMN_COUNT }, () => []);
    let ok = true;
    for (const card of cards) {
      const candidates: number[] = [];
      for (let k = 0; k < cfg.placeCols; k++) {
        const col = columns[k];
        if (col.length >= MAX_STACK) continue;
        const bottom = col[col.length - 1];
        if (bottom && bottom.v === card.v && bottom.c === card.c) continue; // stay stable
        candidates.push(k);
      }
      if (candidates.length === 0) {
        ok = false;
        break;
      }
      columns[candidates[randInt(candidates.length)]].push(card);
    }
    if (!ok) continue;

    if (isStable(columns) && isSolvable(columns)) {
      return { columns, nextId: id, initialCount: cards.length };
    }
  }

  return fallbackBoard();
}

export function newNumsolis(difficulty: Difficulty = "easy"): NumsolisState {
  const { columns, nextId, initialCount } = generateBoard(difficulty);
  return { columns, nextId, moves: 0, seconds: 0, initialCount };
}

/* ----------------------------- serialization ----------------------------- */

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as NumsolisState;
    if (!Array.isArray(parsed.columns) || parsed.columns.length !== COLUMN_COUNT) {
      return null;
    }
    for (const col of parsed.columns) {
      if (!Array.isArray(col) || col.length > MAX_STACK) return null;
      for (const card of col) {
        if (
          typeof card?.id !== "number" ||
          typeof card?.v !== "number" ||
          typeof card?.c !== "number" ||
          !isPowerOfTwoInRange(card.v) ||
          card.c < 0 ||
          card.c >= COLOR_COUNT
        ) {
          return null;
        }
      }
    }
    const remaining = parsed.columns.reduce((s, c) => s + c.length, 0);
    const maxId =
      parsed.columns.reduce((m, c) => c.reduce((mm, k) => Math.max(mm, k.id), m), 0) + 1;
    return {
      columns: parsed.columns,
      nextId: typeof parsed.nextId === "number" ? Math.max(parsed.nextId, maxId) : maxId,
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
      initialCount:
        typeof parsed.initialCount === "number" && parsed.initialCount >= remaining
          ? parsed.initialCount
          : remaining,
    };
  } catch {
    return null;
  }
}
