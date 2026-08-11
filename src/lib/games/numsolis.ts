export const NUMSOLIS_COLUMNS = 6;
export const NUMSOLIS_STACK_LIMIT = 9;
export const NUMSOLIS_TARGET = 1024;
export const NUMSOLIS_COLORS = ["amber", "ivory", "slate", "umber"] as const;

export type NumsolisColor = (typeof NUMSOLIS_COLORS)[number];

export type NumsolisCard = {
  id: number;
  value: number;
  color: NumsolisColor;
};

export type NumsolisMove = { from: number; to: number };

export type NumsolisState = {
  columns: NumsolisCard[][];
  moves: number;
  seconds: number;
  nextId: number;
};

const isPowerOfTwo = (value: number) =>
  Number.isInteger(value) && value >= 2 && value <= NUMSOLIS_TARGET && (value & (value - 1)) === 0;

const sameMergePair = (a: NumsolisCard | undefined, b: NumsolisCard | undefined) =>
  !!a && !!b && a.value === b.value && a.color === b.color;

function collapseTop(column: NumsolisCard[]): NumsolisCard[] {
  const next = column.map((card) => ({ ...card }));
  while (next.length >= 2) {
    const top = next[next.length - 1];
    const below = next[next.length - 2];
    if (!sameMergePair(top, below) || top.value >= NUMSOLIS_TARGET) break;
    next.splice(next.length - 2, 2, {
      id: Math.min(top.id, below.id),
      value: top.value * 2,
      color: top.color,
    });
  }
  return next;
}

export function normalizeNumsolis(state: NumsolisState): NumsolisState {
  return { ...state, columns: state.columns.map(collapseTop) };
}

export function canMoveNumsolis(state: NumsolisState, from: number, to: number): boolean {
  if (from === to || from < 0 || to < 0 || from >= NUMSOLIS_COLUMNS || to >= NUMSOLIS_COLUMNS) return false;
  const source = state.columns[from];
  const target = state.columns[to];
  const card = source.at(-1);
  if (!card) return false;
  const targetCard = target.at(-1);
  if (!targetCard) return target.length < NUMSOLIS_STACK_LIMIT;
  const mergesImmediately = sameMergePair(card, targetCard);
  if (target.length >= NUMSOLIS_STACK_LIMIT && !mergesImmediately) return false;
  return targetCard.value > card.value || mergesImmediately;
}

export function moveNumsolis(state: NumsolisState, from: number, to: number): NumsolisState | null {
  if (!canMoveNumsolis(state, from, to)) return null;
  const columns = state.columns.map((column) => column.map((card) => ({ ...card })));
  const card = columns[from].pop();
  if (!card) return null;
  columns[to].push(card);
  columns[to] = collapseTop(columns[to]);
  return { ...state, columns, moves: state.moves + 1 };
}

export function isNumsolisWon(state: NumsolisState): boolean {
  const cards = state.columns.flat();
  return (
    cards.length === NUMSOLIS_COLORS.length &&
    NUMSOLIS_COLORS.every((color) => cards.some((card) => card.color === color && card.value === NUMSOLIS_TARGET))
  );
}

export function numsolisProgress(state: NumsolisState): number {
  let total = 0;
  for (const color of NUMSOLIS_COLORS) {
    const max = Math.max(0, ...state.columns.flat().filter((card) => card.color === color).map((card) => card.value));
    total += max / NUMSOLIS_TARGET;
  }
  return Math.min(1, total / NUMSOLIS_COLORS.length);
}

function randomChoice<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * Builds a puzzle backwards from the solved position. Every split has an exact
 * legal inverse move, and generated intermediate states contain no automatic
 * top merge. Replaying `solution` therefore always solves the board.
 */
export function generateNumsolis(splitCount = 28): { state: NumsolisState; solution: NumsolisMove[] } {
  const columns: NumsolisCard[][] = Array.from({ length: NUMSOLIS_COLUMNS }, () => []);
  let nextId = 1;
  NUMSOLIS_COLORS.forEach((color, index) => {
    columns[index].push({ id: nextId++, value: NUMSOLIS_TARGET, color });
  });

  const solution: NumsolisMove[] = [];
  for (let step = 0; step < splitCount; step++) {
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
    if (!option) break;
    const parent = columns[option.from].pop();
    if (!parent) break;
    const half = parent.value / 2;
    columns[option.from].push({ ...parent, value: half });
    columns[option.to].push({ id: nextId++, value: half, color: parent.color });
    solution.unshift({ from: option.to, to: option.from });
  }

  return {
    state: { columns, moves: 0, seconds: 0, nextId },
    solution,
  };
}

export function newNumsolis(): NumsolisState {
  return generateNumsolis().state;
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
    };
  } catch {
    return null;
  }
}
