/**
 * Numsolis — a solitaire-like power-of-two card puzzle.
 *
 * A card and every card below it form a movable packet. The packet can land
 * on a strictly higher card (color does not matter), or on a card with the
 * same value and color. Equal neighbors merge automatically up to 2048.
 * Empty columns are locked and can never receive cards.
 *
 * Deals are built backwards from their solved form (one visible 2048 per
 * color). Reversing every split gives a concrete winning sequence, so every
 * generated deal is provably solvable.
 */

export const NUMSOLIS_COLUMN_COUNT = 6;
export const NUMSOLIS_MAX_STACK = 9;
export const NUMSOLIS_MAX_VALUE = 2048;

export const NUMSOLIS_COLORS = ["amber", "ivory"] as const;
export type NumsolisColor = (typeof NUMSOLIS_COLORS)[number];
export type NumsolisColorCount = 1 | 2;

export function numsolisInitialCardCount(colorCount: NumsolisColorCount): number {
  return colorCount === 1 ? 32 : 36;
}

export type NumsolisCard = {
  id: number;
  value: number;
  color: NumsolisColor;
};

export type NumsolisState = {
  columns: NumsolisCard[][];
  nextId: number;
  colorCount: NumsolisColorCount;
  initialCards: number;
  moves: number;
  seconds: number;
};

export type NumsolisMove = {
  from: number;
  to: number;
};

export type NumsolisMoveOutcome = "none" | "moved" | "merged";

export type NumsolisMoveResult = {
  state: NumsolisState;
  outcome: NumsolisMoveOutcome;
  merges: number;
  mergedCardId: number | null;
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

/**
 * Normalize all equal neighboring faces in a column. Keeping the lower card's
 * id makes the merge survivor stable for layout and collapse animations.
 */
function collapseColumn(column: NumsolisCard[]): {
  column: NumsolisCard[];
  merges: number;
  mergedCardId: number | null;
} {
  const cards = column.map((card) => ({ ...card }));
  let merges = 0;
  let mergedCardId: number | null = null;
  let index = 0;

  while (index < cards.length - 1) {
    const target = cards[index];
    const moving = cards[index + 1];
    if (!sameCardFace(target, moving) || target.value >= NUMSOLIS_MAX_VALUE) {
      index++;
      continue;
    }

    const merged = { ...target, value: target.value * 2 };
    cards.splice(index, 2, merged);
    merges++;
    mergedCardId = merged.id;
    // A merge may now match a neighbor on either side.
    index = Math.max(0, index - 1);
  }

  return { column: cards, merges, mergedCardId };
}

/** Whether a packet beginning at `fromIndex` can be placed on column `to`. */
export function canMoveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  fromIndex = state.columns[from]?.length - 1,
): boolean {
  if (
    !Number.isInteger(from) ||
    !Number.isInteger(to) ||
    !Number.isInteger(fromIndex) ||
    from < 0 ||
    from >= NUMSOLIS_COLUMN_COUNT ||
    to < 0 ||
    to >= NUMSOLIS_COLUMN_COUNT ||
    from === to
  ) {
    return false;
  }

  const source = state.columns[from];
  const destination = state.columns[to];
  if (fromIndex < 0 || fromIndex >= source.length) return false;

  const moving = source[fromIndex];
  const target = top(destination);
  // An empty column is permanently locked: every move must land on a card.
  if (!moving || !target) return false;

  const mergesAtBoundary =
    sameCardFace(moving, target) && moving.value < NUMSOLIS_MAX_VALUE;
  if (!mergesAtBoundary && target.value <= moving.value) return false;

  // A packet may only be placed when the normalized result respects the
  // nine-card limit. Matching at the boundary can make an otherwise full
  // destination legal because the collapse is immediate.
  const packet = source.slice(fromIndex);
  const collapsed = collapseColumn([...destination, ...packet]);
  return collapsed.column.length <= NUMSOLIS_MAX_STACK;
}

export function moveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  fromIndex = state.columns[from]?.length - 1,
): NumsolisMoveResult {
  if (!canMoveNumsolis(state, from, to, fromIndex)) {
    return { state, outcome: "none", merges: 0, mergedCardId: null };
  }

  const columns = state.columns.map((column) => column.map((card) => ({ ...card })));
  const packet = columns[from].splice(fromIndex);
  const collapsed = collapseColumn([...columns[to], ...packet]);
  columns[to] = collapsed.column;

  return {
    state: { ...state, columns, moves: state.moves + 1 },
    outcome: collapsed.merges > 0 ? "merged" : "moved",
    merges: collapsed.merges,
    mergedCardId: collapsed.mergedCardId,
  };
}

export function numsolisCardCount(state: NumsolisState): number {
  return state.columns.reduce((sum, column) => sum + column.length, 0);
}

export function isNumsolisComplete(state: NumsolisState): boolean {
  const cards = state.columns.flat();
  const activeColors = NUMSOLIS_COLORS.slice(0, state.colorCount);
  return (
    cards.length === state.colorCount &&
    activeColors.every(
      (color) =>
        cards.filter((card) => card.color === color && card.value === NUMSOLIS_MAX_VALUE).length === 1,
    )
  );
}

export function numsolisProgress(state: NumsolisState): number {
  const mergesNeeded = state.initialCards - state.colorCount;
  if (mergesNeeded <= 0) return isNumsolisComplete(state) ? 1 : 0;
  const mergesDone = state.initialCards - numsolisCardCount(state);
  return Math.min(1, Math.max(0, mergesDone / mergesNeeded));
}

function emptyState(colorCount: NumsolisColorCount): NumsolisState {
  return {
    columns: Array.from({ length: NUMSOLIS_COLUMN_COUNT }, () => []),
    nextId: 1,
    colorCount,
    initialCards: numsolisInitialCardCount(colorCount),
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

/** One reverse-generation attempt. */
function tryGenerate(
  colorCount: NumsolisColorCount,
  random: Random,
): { state: NumsolisState; solution: NumsolisMove[] } | null {
  const state = emptyState(colorCount);
  const reverseSteps: NumsolisMove[] = [];

  // Begin at the solved board. A 2048 remains visible and cannot merge again.
  for (const color of NUMSOLIS_COLORS.slice(0, colorCount)) {
    const candidates = candidateColumnsForPush(state, -1, {
      value: NUMSOLIS_MAX_VALUE,
      color,
    });
    if (candidates.length === 0) return null;
    const shortest = candidates.filter(
      (index) => state.columns[index].length === state.columns[candidates[0]].length,
    );
    const destination = shortest[randomIndex(shortest.length, random)];
    state.columns[destination].push({
      id: state.nextId++,
      value: NUMSOLIS_MAX_VALUE,
      color,
    });
  }

  while (numsolisCardCount(state) < state.initialCards) {
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

    const minOriginHeight = Math.min(...splits.map(({ origin }) => state.columns[origin].length));
    const balanced = splits.filter(
      ({ origin }) => state.columns[origin].length <= minOriginHeight + 1,
    );
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

/** Generate a deal together with a legal winning certificate. */
export function createNumsolisGame(
  colorCount: NumsolisColorCount = 2,
  random: Random = Math.random,
): { state: NumsolisState; solution: NumsolisMove[] } {
  for (let attempt = 0; attempt < 64; attempt++) {
    const generated = tryGenerate(colorCount, random);
    if (generated) return generated;
  }

  // Escape a deliberately pathological supplied random source with a known
  // full-period deterministic generator.
  let seed = 1;
  const fallback = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x1_0000_0000;
  };
  for (let attempt = 0; attempt < 64; attempt++) {
    const generated = tryGenerate(colorCount, fallback);
    if (generated) return generated;
  }

  throw new Error("Unable to generate a solvable Numsolis deal");
}

export function newNumsolis(colorCount: NumsolisColorCount = 2): NumsolisState {
  return createNumsolisGame(colorCount).state;
}

export function serializeNumsolis(state: NumsolisState): string {
  return JSON.stringify(state);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isNormalized(columns: NumsolisCard[][]): boolean {
  return columns.every((column) =>
    column.every((card, index) => index === 0 || !sameCardFace(column[index - 1], card)),
  );
}

export function deserializeNumsolis(raw: string): NumsolisState | null {
  try {
    const parsed = JSON.parse(raw) as Partial<NumsolisState>;
    if (
      !Array.isArray(parsed.columns) ||
      parsed.columns.length !== NUMSOLIS_COLUMN_COUNT ||
      (parsed.colorCount !== 1 && parsed.colorCount !== 2)
    ) {
      return null;
    }

    const colorCount = parsed.colorCount;
    const activeColors = NUMSOLIS_COLORS.slice(0, colorCount);
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
          !activeColors.includes(rawCard?.color as NumsolisColor)
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

    const cards = columns.flat();
    const count = cards.length;
    const massIsValid = activeColors.every(
      (color) =>
        cards
          .filter((card) => card.color === color)
          .reduce((sum, card) => sum + card.value, 0) === NUMSOLIS_MAX_VALUE,
    );
    if (
      !isNormalized(columns) ||
      !massIsValid ||
      !isNonNegativeInteger(parsed.moves) ||
      !isNonNegativeInteger(parsed.seconds) ||
      parsed.initialCards !== numsolisInitialCardCount(colorCount) ||
      parsed.initialCards < count ||
      !isNonNegativeInteger(parsed.nextId) ||
      parsed.nextId <= Math.max(0, ...ids)
    ) {
      return null;
    }

    return {
      columns,
      nextId: parsed.nextId,
      colorCount,
      initialCards: parsed.initialCards,
      moves: parsed.moves,
      seconds: parsed.seconds,
    };
  } catch {
    return null;
  }
}
