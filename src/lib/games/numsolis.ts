import { z } from "zod";

export type NumsolisDifficulty = "easy" | "medium" | "hard";
export type NumsolisCard = { id: number; value: number; suit: 0 | 1 };
/** Columns are ordered visually from top (buried) to bottom (exposed). */
export type NumsolisColumns = NumsolisCard[][];
export type NumsolisMove = { from: number; index: number; to: number };
export type NumsolisSnapshot = { columns: NumsolisColumns; moves: number };
export type NumsolisState = {
  version: 1;
  rulesVersion: 1;
  generatorVersion: 1;
  id: string;
  seed: number;
  difficulty: NumsolisDifficulty;
  columns: NumsolisColumns;
  initialColumns: NumsolisColumns;
  moves: number;
  seconds: number;
  history: NumsolisSnapshot[];
};

export const NUMSOLIS_MAX_HEIGHT = 9;
export const NUMSOLIS_MAX_HISTORY = 12;
export const NUMSOLIS_MAX_SAVE_LENGTH = 49_000;
const copyColumns = (columns: NumsolisColumns): NumsolisColumns =>
  columns.map((column) => column.map((card) => ({ ...card })));
const matches = (a: NumsolisCard, b: NumsolisCard) =>
  a.value === b.value && a.suit === b.suit && a.value < 2048;

export function createNumsolisState(
  columns: NumsolisColumns,
  difficulty: NumsolisDifficulty,
  seed: number,
  id = `numsolis-${difficulty}-${seed}`,
): NumsolisState {
  return {
    version: 1, rulesVersion: 1, generatorVersion: 1, id, seed, difficulty,
    columns: copyColumns(columns), initialColumns: copyColumns(columns),
    moves: 0, seconds: 0, history: [],
  };
}

export function canMoveColumns(columns: NumsolisColumns, move: NumsolisMove): boolean {
  const { from, index, to } = move;
  if (![from, index, to].every(Number.isSafeInteger) || from === to) return false;
  const source = columns[from];
  const target = columns[to];
  if (!source || !target?.length || index < 0 || index >= source.length) return false;
  const first = source[index];
  const last = target[target.length - 1];
  const merge = matches(first, last);
  return (first.value < last.value || merge) &&
    target.length + source.length - index - Number(merge) <= NUMSOLIS_MAX_HEIGHT;
}

/** Only the contact merge starts a cascade; unrelated pairs are untouched. */
function applyColumns(columns: NumsolisColumns, move: NumsolisMove, collect?: (columns: NumsolisColumns) => void): NumsolisColumns | null {
  if (!canMoveColumns(columns, move)) return null;
  const next = columns.map((column) => column.slice());
  const group = next[move.from].splice(move.index);
  const target = next[move.to];
  let active = target.length - 1;
  const contact = matches(target[active], group[0]);
  target.push(...group);
  if (contact) {
    target.splice(active, 2, { ...target[active], value: target[active].value * 2 });
    collect?.(copyColumns(next));
    while (true) {
      // A lower neighbour wins when both neighbours match the active card.
      if (active + 1 < target.length && matches(target[active], target[active + 1])) {
        target.splice(active, 2, { ...target[active], value: target[active].value * 2 });
      } else if (active > 0 && matches(target[active], target[active - 1])) {
        target.splice(active - 1, 2, { ...target[active - 1], value: target[active].value * 2 });
        active--;
      } else break;
      collect?.(copyColumns(next));
    }
  } else collect?.(copyColumns(next));
  return next;
}

export function applyNumsolisColumns(columns: NumsolisColumns, move: NumsolisMove): NumsolisColumns | null {
  return applyColumns(columns, move);
}

/** Animation-only snapshots; saves and Undo always use the atomic final state. */
export function getNumsolisMoveFrames(columns: NumsolisColumns, move: NumsolisMove): NumsolisColumns[] {
  const frames: NumsolisColumns[] = [];
  applyColumns(columns, move, (frame) => frames.push(frame));
  return frames;
}

export function getNumsolisColumnMoves(columns: NumsolisColumns): NumsolisMove[] {
  const result: NumsolisMove[] = [];
  for (let from = 0; from < columns.length; from++) {
    for (let index = 0; index < columns[from].length; index++) {
      for (let to = 0; to < columns.length; to++) {
        const move = { from, index, to };
        if (canMoveColumns(columns, move)) result.push(move);
      }
    }
  }
  return result;
}

export function isNumsolisColumnsWon(columns: NumsolisColumns, difficulty: NumsolisDifficulty): boolean {
  const cards = columns.flat();
  const goals = difficulty === "easy" ? 1 : 2;
  return cards.length === goals && cards.every((card) => card.value === 2048) &&
    cards.some((card) => card.suit === 0) &&
    (goals === 1 || cards.some((card) => card.suit === 1));
}
export const isNumsolisWon = (state: NumsolisState) => isNumsolisColumnsWon(state.columns, state.difficulty);
export const canMove = (state: NumsolisState, move: NumsolisMove) => !isNumsolisWon(state) && canMoveColumns(state.columns, move);
export const getLegalMoves = (state: NumsolisState) => isNumsolisWon(state) ? [] : getNumsolisColumnMoves(state.columns);
export const isNumsolisLost = (state: NumsolisState) => !isNumsolisWon(state) && getLegalMoves(state).length === 0;

export function applyMove(state: NumsolisState, move: NumsolisMove): NumsolisState | null {
  if (!canMove(state, move) || state.moves === Number.MAX_SAFE_INTEGER) return null;
  const columns = applyNumsolisColumns(state.columns, move)!;
  const next: NumsolisState = {
    ...state, columns, moves: state.moves + 1,
    history: [...state.history, { columns: state.columns, moves: state.moves }].slice(-NUMSOLIS_MAX_HISTORY),
  };
  while (next.history.length && JSON.stringify(next).length > NUMSOLIS_MAX_SAVE_LENGTH) next.history.shift();
  return next;
}

export function undoNumsolis(state: NumsolisState): NumsolisState | null {
  const previous = state.history.at(-1);
  return previous ? { ...state, columns: copyColumns(previous.columns), moves: previous.moves, history: state.history.slice(0, -1) } : null;
}
export function restartNumsolis(state: NumsolisState, id = state.id): NumsolisState {
  return createNumsolisState(state.initialColumns, state.difficulty, state.seed, id);
}
export function numsolisProgress(state: NumsolisState): number {
  if (isNumsolisWon(state)) return 1;
  const initial = state.initialColumns.flat().length;
  const goals = state.difficulty === "easy" ? 1 : 2;
  return Math.max(0, Math.min(0.999999, (initial - state.columns.flat().length) / Math.max(1, initial - goals)));
}
export const serializeNumsolis = (state: NumsolisState): string => JSON.stringify(state);

const counter = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const cardSchema = z.object({
  id: counter,
  value: z.number().int().min(2).max(2048).refine((value) => (value & (value - 1)) === 0),
  suit: z.union([z.literal(0), z.literal(1)]),
}).strict();
const columnsSchema = z.array(z.array(cardSchema).max(NUMSOLIS_MAX_HEIGHT)).length(6);
const stateSchema = z.object({
  version: z.literal(1), rulesVersion: z.literal(1), generatorVersion: z.literal(1),
  id: z.string().min(1).max(128), seed: z.number().int().min(0).max(0xffffffff),
  difficulty: z.enum(["easy", "medium", "hard"]), columns: columnsSchema,
  initialColumns: columnsSchema, moves: counter, seconds: counter,
  history: z.array(z.object({ columns: columnsSchema, moves: counter }).strict()).max(NUMSOLIS_MAX_HISTORY),
}).strict();

export function deserializeNumsolis(raw: string): NumsolisState | null {
  if (typeof raw !== "string" || raw.length > NUMSOLIS_MAX_SAVE_LENGTH) return null;
  try {
    const parsed = stateSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const state = parsed.data;
    const originals = new Map(state.initialColumns.flat().map((card) => [card.id, card]));
    const validColumns = (columns: NumsolisColumns) => {
      const cards = columns.flat();
      const totals = [0, 0];
      const ids = new Set<number>();
      for (const card of cards) {
        const original = originals.get(card.id);
        if (ids.has(card.id) || !original || original.suit !== card.suit || card.value < original.value) return false;
        ids.add(card.id);
        totals[card.suit] += card.value;
      }
      return totals[0] === 2048 && totals[1] === (state.difficulty === "easy" ? 0 : 2048);
    };
    if (state.initialColumns.some((column) => column.length === 0) ||
        !validColumns(state.initialColumns) || !validColumns(state.columns) ||
        state.columns.flat().length > state.initialColumns.flat().length) return null;
    if (state.moves === 0 && JSON.stringify(state.columns) !== JSON.stringify(state.initialColumns)) return null;
    let previousMoves = -1;
    let previousCount = state.initialColumns.flat().length;
    for (const snapshot of state.history) {
      const count = snapshot.columns.flat().length;
      if (!validColumns(snapshot.columns) || snapshot.moves <= previousMoves || snapshot.moves >= state.moves ||
          (previousMoves >= 0 && snapshot.moves !== previousMoves + 1) || count > previousCount) return null;
      previousMoves = snapshot.moves;
      previousCount = count;
    }
    if (state.history.length && (previousMoves !== state.moves - 1 || state.columns.flat().length > previousCount)) return null;
    return state;
  } catch { return null; }
}
