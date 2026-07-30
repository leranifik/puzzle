/**
 * Numsolis — a solitaire-like power-of-two card puzzle.
 *
 * The last card in each column is exposed. It can be moved onto a strictly
 * higher card (color does not matter), or onto a card with the same value and
 * color. Equal cards merge immediately; two 1024 cards leave the board.
 *
 * Deals are built backwards from the empty board. Reversing every split gives
 * us a concrete winning sequence, so every generated deal is provably
 * solvable rather than merely shuffled until it looks plausible.
 */

export const NUMSOLIS_COLUMN_COUNT = 6;
export const NUMSOLIS_MAX_STACK = 9;
export const NUMSOLIS_MAX_VALUE = 1024;
export const NUMSOLIS_INITIAL_CARDS = 40;

export const NUMSOLIS_COLORS = ["amber", "ivory", "silver", "ruby"] as const;
export type NumsolisColor = (typeof NUMSOLIS_COLORS)[number];

export type NumsolisCard = {
  id: number;
  value: number;
  color: NumsolisColor;
};

export type NumsolisState = {
  columns: NumsolisCard[][];
  nextId: number;
  initialCards: number;
  moves: number;
  seconds: number;
};

export type NumsolisMove = {
  from: number;
  to: number;
};

export type NumsolisMoveOutcome = "none" | "moved" | "merged" | "cleared";

export type NumsolisMoveResult = {
  state: NumsolisState;
  outcome: NumsolisMoveOutcome;
  merges: number;
};

type Random = () => number;

function randomIndex(length: number, random: Random): number {
  return Math.min(length - 1, Math.floor(random() * length));
}

function top(column: NumsolisCard[]): NumsolisCard | undefined {
  return column[column.length - 1];
}

export function isNumsolisValue(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 2 &&
    value <= NUMSOLIS_MAX_VALUE &&
    (value & (value - 1)) === 0
  );
}

function sameCardFace(a: NumsolisCard | undefined, b: NumsolisCard | undefined): boolean {
  return !!a && !!b && a.value === b.value && a.color === b.color;
}

/** Whether the exposed card at `from` can be placed on column `to`. */
export function canMoveNumsolis(state: NumsolisState, from: number, to: number): boolean {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    from < 0 ||
    from >= NUMSOLIS_COLUMN_COUNT ||
    to < 0 ||
    to >= NUMSOLIS_COLUMN_COUNT ||
    from === to
  ) {
    return false;
  }

  const moving = top(state.columns[from]);
  const target = top(state.columns[to]);
  // As in Numsol, an empty column is closed: every move lands on a card.
  if (!moving || !target) return false;

  if (sameCardFace(moving, target)) return true;
  return target.value > moving.value && state.columns[to].length < NUMSOLIS_MAX_STACK;
}

/**
 * Collapse every equal face touching at the exposed end of a column.
 * The destination card keeps its stable id, which lets the UI animate a
 * moved card into it. A chain can perform several automatic merges.
 */
function collapseExposed(column: NumsolisCard[]): {
  column: NumsolisCard[];
  merges: number;
  removed1024: boolean;
} {
  const cards = [...column];
  let merges = 0;
  let removed1024 = false;

  while (cards.length >= 2) {
    const moving = cards[cards.length - 1];
    const target = cards[cards.length - 2];
    if (!sameCardFace(moving, target)) break;

    cards.pop();
    cards.pop();
    merges++;
    if (target.value === NUMSOLIS_MAX_VALUE) {
      removed1024 = true;
    } else {
      cards.push({ ...target, value: target.value * 2 });
    }
  }

  return { column: cards, merges, removed1024 };
}

export function moveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
): NumsolisMoveResult {
  if (!canMoveNumsolis(state, from, to)) {
    return { state, outcome: "none", merges: 0 };
  }

  const columns = state.columns.map((column) => [...column]);
  const moving = columns[from].pop()!;
  columns[to].push(moving);
  const collapsed = collapseExposed(columns[to]);
  columns[to] = collapsed.column;

  return {
    state: { ...state, columns, moves: state.moves + 1 },
    outcome:
      collapsed.merges === 0
        ? "moved"
        : collapsed.removed1024
          ? "cleared"
          : "merged",
    merges: collapsed.merges,
  };
}

export function numsolisCardCount(state: NumsolisState): number {
  return state.columns.reduce((sum, column) => sum + column.length, 0);
}

export function isNumsolisComplete(state: NumsolisState): boolean {
  return numsolisCardCount(state) === 0;
}

export function numsolisProgress(state: NumsolisState): number {
  if (state.initialCards <= 0) return 0;
  return Math.min(1, Math.max(0, 1 - numsolisCardCount(state) / state.initialCards));
}

function emptyState(): NumsolisState {
  return {
    columns: Array.from({ length: NUMSOLIS_COLUMN_COUNT }, () => []),
    nextId: 1,
    initialCards: NUMSOLIS_INITIAL_CARDS,
    moves: 0,
    seconds: 0,
  };
}

function candidateColumnsForPush(
  state: NumsolisState,
  excluded: number,
  card: Pick<NumsolisCard, "value" | "color">,
): number[] {
  return state.columns
    .map((column, index) => ({ column, index }))
    .filter(
      ({ column, index }) =>
        index !== excluded &&
        column.length < NUMSOLIS_MAX_STACK &&
        !sameCardFace(top(column), { id: -1, ...card }),
    )
    .sort((a, b) => a.column.length - b.column.length)
    .map(({ index }) => index);
}

/**
 * One reverse-generation attempt. Every recorded operation is the exact
 * inverse of the split/add operation that created the deal.
 */
function tryGenerate(random: Random): { state: NumsolisState; solution: NumsolisMove[] } | null {
  const state = emptyState();
  const reverseSteps: NumsolisMove[] = [];

  // The solved form of each color is a pair of 1024 cards. In forward play,
  // each pair merges away; here we add those pairs to begin reverse play.
  for (const color of NUMSOLIS_COLORS) {
    const firstCandidates = candidateColumnsForPush(state, -1, { value: 1024, color });
    if (firstCandidates.length === 0) return null;
    const shortestFirst = firstCandidates.filter(
      (index) => state.columns[index].length === state.columns[firstCandidates[0]].length,
    );
    const from = shortestFirst[randomIndex(shortestFirst.length, random)];
    state.columns[from].push({ id: state.nextId++, value: 1024, color });

    const secondCandidates = candidateColumnsForPush(state, from, { value: 1024, color });
    if (secondCandidates.length === 0) return null;
    const shortestSecond = secondCandidates.filter(
      (index) => state.columns[index].length === state.columns[secondCandidates[0]].length,
    );
    const to = shortestSecond[randomIndex(shortestSecond.length, random)];
    state.columns[to].push({ id: state.nextId++, value: 1024, color });
    reverseSteps.push({ from, to });
  }

  while (numsolisCardCount(state) < NUMSOLIS_INITIAL_CARDS) {
    const splits: { destination: number; origin: number }[] = [];

    for (let destination = 0; destination < NUMSOLIS_COLUMN_COUNT; destination++) {
      const parent = top(state.columns[destination]);
      if (!parent || parent.value <= 2) continue;
      const child = { value: parent.value / 2, color: parent.color };
      const below = state.columns[destination][state.columns[destination].length - 2];
      if (sameCardFace(below, { id: -1, ...child })) continue;

      for (const origin of candidateColumnsForPush(state, destination, child)) {
        splits.push({ destination, origin });
      }
    }

    if (splits.length === 0) return null;

    // Prefer a short origin so the six stacks remain balanced, then use the
    // supplied random source only to vary equally good choices.
    const minOriginHeight = Math.min(...splits.map(({ origin }) => state.columns[origin].length));
    const balanced = splits.filter(({ origin }) => state.columns[origin].length <= minOriginHeight + 1);
    const { destination, origin } = balanced[randomIndex(balanced.length, random)];
    const parent = top(state.columns[destination])!;
    const value = parent.value / 2;
    parent.value = value;
    state.columns[origin].push({
      id: state.nextId++,
      value,
      color: parent.color,
    });
    reverseSteps.push({ from: origin, to: destination });
  }

  const solution = [...reverseSteps].reverse();
  let check: NumsolisState = {
    ...state,
    columns: state.columns.map((column) => column.map((card) => ({ ...card }))),
  };
  for (const step of solution) {
    const result = moveNumsolis(check, step.from, step.to);
    if (result.outcome === "none") return null;
    check = result.state;
  }
  if (!isNumsolisComplete(check)) return null;

  return { state, solution };
}

/**
 * Generate a deal together with its certificate (a winning move sequence).
 * Supplying a seeded random function is useful for invariant tests.
 */
export function createNumsolisGame(
  random: Random = Math.random,
): { state: NumsolisState; solution: NumsolisMove[] } {
  for (let attempt = 0; attempt < 64; attempt++) {
    const generated = tryGenerate(random);
    if (generated) return generated;
  }

  // A caller can supply a deliberately pathological source (or one whose
  // short cycle repeatedly reaches a dead end). Fall back to a known full-
  // period LCG so generation still has a total, deterministic escape path.
  let seed = 0x9e3779b9;
  const fallback = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let attempt = 0; attempt < 64; attempt++) {
    const generated = tryGenerate(fallback);
    if (generated) return generated;
  }

  throw new Error("Unable to generate a solvable Numsolis deal");
}

export function newNumsolis(): NumsolisState {
  return createNumsolisGame().state;
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isNormalized(columns: NumsolisCard[][]): boolean {
  return columns.every((column) =>
    column.every((card, index) => index === 0 || !sameCardFace(column[index - 1], card)),
  );
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<NumsolisState>;
    if (!Array.isArray(parsed.columns) || parsed.columns.length !== NUMSOLIS_COLUMN_COUNT) {
      return null;
    }

    const ids = new Set<number>();
    const columns: NumsolisCard[][] = [];
    for (const rawColumn of parsed.columns) {
      if (!Array.isArray(rawColumn) || rawColumn.length > NUMSOLIS_MAX_STACK) return null;
      const column: NumsolisCard[] = [];
      for (const rawCard of rawColumn as Partial<NumsolisCard>[]) {
        if (
          !isNonNegativeInteger(rawCard?.id) ||
          rawCard.id === 0 ||
          ids.has(rawCard.id) ||
          !isNumsolisValue(rawCard?.value) ||
          !NUMSOLIS_COLORS.includes(rawCard?.color as NumsolisColor)
        ) {
          return null;
        }
        ids.add(rawCard.id);
        column.push({
          id: rawCard.id,
          value: rawCard.value,
          color: rawCard.color as NumsolisColor,
        });
      }
      columns.push(column);
    }

    const count = columns.reduce((sum, column) => sum + column.length, 0);
    if (
      !isNormalized(columns) ||
      !isNonNegativeInteger(parsed.moves) ||
      !isNonNegativeInteger(parsed.seconds) ||
      !isNonNegativeInteger(parsed.initialCards) ||
      parsed.initialCards < count ||
      parsed.initialCards > NUMSOLIS_COLUMN_COUNT * NUMSOLIS_MAX_STACK ||
      !isNonNegativeInteger(parsed.nextId) ||
      parsed.nextId <= Math.max(0, ...ids)
    ) {
      return null;
    }

    return {
      columns,
      nextId: parsed.nextId,
      initialCards: parsed.initialCards,
      moves: parsed.moves,
      seconds: parsed.seconds,
    };
  } catch {
    return null;
  }
}
