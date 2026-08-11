export const NUMSOLIS_COLUMNS = 6;
export const NUMSOLIS_STACK_LIMIT = 9;
export const NUMSOLIS_TARGET = 2048;
export const NUMSOLIS_MAX_DEALT_VALUE = 1024;
export const NUMSOLIS_COLORS = ["amber", "ivory", "slate", "umber"] as const;
export const NUMSOLIS_DIFFICULTIES = ["easy", "medium", "hard"] as const;

export type NumsolisColor = (typeof NUMSOLIS_COLORS)[number];
export type NumsolisDifficulty = (typeof NUMSOLIS_DIFFICULTIES)[number];

export type NumsolisCard = {
  id: number;
  value: number;
  color: NumsolisColor;
};

export type NumsolisMove = { from: number; to: number; start: number };

export type NumsolisState = {
  columns: NumsolisCard[][];
  moves: number;
  seconds: number;
  nextId: number;
  difficulty: NumsolisDifficulty;
};

const EXTRA_SPLITS: Record<NumsolisDifficulty, number> = {
  easy: 14,
  medium: 24,
  hard: 36,
};

const isPowerOfTwo = (value: number) =>
  Number.isInteger(value) && value >= 2 && value <= NUMSOLIS_TARGET && (value & (value - 1)) === 0;

const sameMergePair = (a: NumsolisCard | undefined, b: NumsolisCard | undefined) =>
  !!a && !!b && a.value === b.value && a.color === b.color;

/** Collapse every adjacent equal-value/equal-color pair until stable. */
function collapseColumn(column: NumsolisCard[]): NumsolisCard[] {
  const next = column.map((card) => ({ ...card }));
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < next.length - 1; i++) {
      const below = next[i];
      const above = next[i + 1];
      if (!sameMergePair(below, above) || below.value >= NUMSOLIS_TARGET) continue;
      next.splice(i, 2, {
        id: Math.min(below.id, above.id),
        value: below.value * 2,
        color: below.color,
      });
      changed = true;
      break;
    }
  }
  return next;
}

export function normalizeNumsolis(state: NumsolisState): NumsolisState {
  return { ...state, columns: state.columns.map(collapseColumn) };
}

function validColumnIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < NUMSOLIS_COLUMNS;
}

/**
 * Move a contiguous suffix of a column. `start=0` moves the whole column;
 * `start=column.length-1` moves only the top card.
 */
export function canMoveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  start = state.columns[from]?.length - 1,
): boolean {
  if (!validColumnIndex(from) || !validColumnIndex(to) || from === to) return false;
  const source = state.columns[from];
  const target = state.columns[to];
  if (!Number.isInteger(start) || start < 0 || start >= source.length) return false;

  const moving = source.slice(start);
  const bottomMoving = moving[0];
  const targetTop = target.at(-1);

  // Color never restricts placement. Dimension/value does: the destination
  // must be empty, strictly larger, or an equal same-color merge pair.
  if (targetTop && !(targetTop.value > bottomMoving.value || sameMergePair(targetTop, bottomMoving))) {
    return false;
  }

  return collapseColumn([...target, ...moving]).length <= NUMSOLIS_STACK_LIMIT;
}

export function moveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  start = state.columns[from]?.length - 1,
): NumsolisState | null {
  if (!canMoveNumsolis(state, from, to, start)) return null;
  const columns = state.columns.map((column) => column.map((card) => ({ ...card })));
  const moving = columns[from].splice(start);
  columns[to] = collapseColumn([...columns[to], ...moving]);
  return { ...state, columns, moves: state.moves + 1 };
}

export function isNumsolisWon(state: NumsolisState): boolean {
  return state.columns.some((column) => column.some((card) => card.value === NUMSOLIS_TARGET));
}

export function numsolisProgress(state: NumsolisState): number {
  const max = Math.max(0, ...state.columns.flat().map((card) => card.value));
  return Math.min(1, max / NUMSOLIS_TARGET);
}

function randomChoice<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function splitTop(
  columns: NumsolisCard[][],
  from: number,
  to: number,
  nextId: number,
): { nextId: number; inverse: NumsolisMove } | null {
  const parent = columns[from].pop();
  if (!parent || parent.value <= 2) return null;
  const half = parent.value / 2;
  columns[from].push({ ...parent, value: half });
  columns[to].push({ id: nextId, value: half, color: parent.color });
  return { nextId: nextId + 1, inverse: { from: to, to: from, start: columns[to].length - 1 } };
}

function buildGenerated(difficulty: NumsolisDifficulty): { state: NumsolisState; solution: NumsolisMove[] } | null {
  const columns: NumsolisCard[][] = Array.from({ length: NUMSOLIS_COLUMNS }, () => []);
  let nextId = 1;
  NUMSOLIS_COLORS.forEach((color, index) => {
    columns[index].push({ id: nextId++, value: NUMSOLIS_TARGET, color });
  });

  const solution: NumsolisMove[] = [];

  // Mandatory first split for every color. This guarantees that a freshly
  // dealt board never contains 2048; the largest dealt card is 1024.
  for (let from = 0; from < NUMSOLIS_COLORS.length; from++) {
    const to = 4 + (from % 2);
    const result = splitTop(columns, from, to, nextId);
    if (!result) return null;
    nextId = result.nextId;
    solution.unshift(result.inverse);
  }

  for (let step = 0; step < EXTRA_SPLITS[difficulty]; step++) {
    const options: Array<{ from: number; to: number }> = [];
    for (let from = 0; from < NUMSOLIS_COLUMNS; from++) {
      const source = columns[from];
      const top = source.at(-1);
      if (!top || top.value <= 2) continue;
      const half = top.value / 2;
      const below = source.at(-2);
      if (below && below.value === half && below.color === top.color) continue;

      for (let to = 0; to < NUMSOLIS_COLUMNS; to++) {
        if (to === from || columns[to].length >= NUMSOLIS_STACK_LIMIT) continue;
        const targetTop = columns[to].at(-1);
        if (targetTop && targetTop.value === half && targetTop.color === top.color) continue;
        options.push({ from, to });
      }
    }

    const option = randomChoice(options);
    if (!option) return null;
    const result = splitTop(columns, option.from, option.to, nextId);
    if (!result) return null;
    nextId = result.nextId;
    solution.unshift(result.inverse);
  }

  const state: NumsolisState = { columns, moves: 0, seconds: 0, nextId, difficulty };
  if (state.columns.some((column) => column.length > NUMSOLIS_STACK_LIMIT)) return null;
  if (state.columns.flat().some((card) => card.value > NUMSOLIS_MAX_DEALT_VALUE)) return null;
  return { state, solution };
}

/**
 * Builds the puzzle backwards from four 2048 end states. Each generated split
 * has an exact inverse legal move, so replaying `solution` always reaches 2048.
 */
export function generateNumsolis(
  difficulty: NumsolisDifficulty = "medium",
): { state: NumsolisState; solution: NumsolisMove[] } {
  for (let attempt = 0; attempt < 100; attempt++) {
    const generated = buildGenerated(difficulty);
    if (generated) return generated;
  }
  throw new Error("Unable to generate a solvable Numsolis board");
}

export function newNumsolis(difficulty: NumsolisDifficulty = "medium"): NumsolisState {
  return generateNumsolis(difficulty).state;
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as NumsolisState;
    if (!parsed || !Array.isArray(parsed.columns) || parsed.columns.length !== NUMSOLIS_COLUMNS) return null;
    if (!Number.isInteger(parsed.moves) || parsed.moves < 0 || !Number.isInteger(parsed.seconds) || parsed.seconds < 0) return null;
    if (!Number.isInteger(parsed.nextId) || parsed.nextId < 1) return null;
    if (!NUMSOLIS_DIFFICULTIES.includes(parsed.difficulty)) return null;

    const ids = new Set<number>();
    const sums = new Map<NumsolisColor, number>(NUMSOLIS_COLORS.map((color) => [color, 0]));
    let maxId = 0;
    for (const column of parsed.columns) {
      if (!Array.isArray(column) || column.length > NUMSOLIS_STACK_LIMIT) return null;
      for (const card of column) {
        if (!card || !Number.isInteger(card.id) || card.id < 1 || ids.has(card.id)) return null;
        if (!isPowerOfTwo(card.value) || !NUMSOLIS_COLORS.includes(card.color)) return null;
        ids.add(card.id);
        maxId = Math.max(maxId, card.id);
        sums.set(card.color, (sums.get(card.color) ?? 0) + card.value);
      }
    }
    if (parsed.nextId <= maxId) return null;
    if (NUMSOLIS_COLORS.some((color) => sums.get(color) !== NUMSOLIS_TARGET)) return null;

    return {
      columns: parsed.columns.map((column) => column.map((card) => ({ ...card }))),
      moves: parsed.moves,
      seconds: parsed.seconds,
      nextId: parsed.nextId,
      difficulty: parsed.difficulty,
    };
  } catch {
    return null;
  }
}
