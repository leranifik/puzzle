export const NUMSOLIS_COLUMNS = 6;
export const NUMSOLIS_STACK_LIMIT = 9;
export const NUMSOLIS_TARGET = 2048;
export const NUMSOLIS_MAX_DEALT_VALUE = 1024;
export const NUMSOLIS_COLORS = ["ivory", "slate"] as const;
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
  closedColumns: boolean[];
  moves: number;
  seconds: number;
  nextId: number;
  difficulty: NumsolisDifficulty;
};

export type NumsolisAnimationStage = {
  columns: NumsolisCard[][];
  pulseId: number | null;
};

export type NumsolisMovePreview = {
  finalState: NumsolisState;
  stages: NumsolisAnimationStage[];
};

export type NumsolisDifficultyMetrics = {
  cardCount: number;
  solutionMoves: number;
  maxColumnHeight: number;
  minColumnHeight: number;
  legalMoves: number;
  openMergeMoves: number;
  decoyMoves: number;
  decoyRatio: number;
  buriedPairDepth: number;
  score: number;
};

type NumsolisDifficultyProfile = {
  extraSplits: readonly [number, number];
  scrambleMoves: readonly [number, number];
  score: readonly [number, number];
  maxColumnHeight: readonly [number, number];
  buriedPairDepth: readonly [number, number];
  openMergeMoves: readonly [number, number];
  minDecoyMoves: number;
  minDecoyRatio: number;
};

type NumsolisGenerated = {
  state: NumsolisState;
  solution: NumsolisMove[];
};

const DIFFICULTY_PROFILES: Record<NumsolisDifficulty, NumsolisDifficultyProfile> = {
  easy: {
    extraSplits: [14, 18],
    scrambleMoves: [0, 0],
    score: [80, 119],
    maxColumnHeight: [5, 7],
    buriedPairDepth: [10, 30],
    openMergeMoves: [0, 12],
    minDecoyMoves: 10,
    minDecoyRatio: 0.5,
  },
  medium: {
    extraSplits: [32, 38],
    scrambleMoves: [0, 4],
    score: [160, 219],
    maxColumnHeight: [7, NUMSOLIS_STACK_LIMIT],
    buriedPairDepth: [30, 75],
    openMergeMoves: [0, 14],
    minDecoyMoves: 20,
    minDecoyRatio: 0.6,
  },
  hard: {
    extraSplits: [40, 44],
    scrambleMoves: [4, 12],
    score: [220, Number.POSITIVE_INFINITY],
    maxColumnHeight: [8, NUMSOLIS_STACK_LIMIT],
    buriedPairDepth: [50, Number.POSITIVE_INFINITY],
    openMergeMoves: [0, 12],
    minDecoyMoves: 20,
    minDecoyRatio: 0.62,
  },
};

const cloneColumns = (columns: NumsolisCard[][]) =>
  columns.map((column) => column.map((card) => ({ ...card })));

const isPowerOfTwo = (value: number) =>
  Number.isInteger(value) && value >= 2 && value <= NUMSOLIS_TARGET && (value & (value - 1)) === 0;

const sameMergePair = (a: NumsolisCard | undefined, b: NumsolisCard | undefined) =>
  !!a && !!b && a.value === b.value && a.color === b.color;

function collapseOne(column: NumsolisCard[]): { column: NumsolisCard[]; pulseId: number } | null {
  for (let i = 0; i < column.length - 1; i++) {
    const below = column[i];
    const above = column[i + 1];
    if (!sameMergePair(below, above) || below.value >= NUMSOLIS_TARGET) continue;
    const survivorId = Math.min(below.id, above.id);
    const next = column.map((card) => ({ ...card }));
    next.splice(i, 2, {
      id: survivorId,
      value: below.value * 2,
      color: below.color,
    });
    return { column: next, pulseId: survivorId };
  }
  return null;
}

/** Collapse every adjacent equal-value/equal-color pair until stable. */
function collapseColumn(column: NumsolisCard[]): NumsolisCard[] {
  let next = column.map((card) => ({ ...card }));
  while (true) {
    const merged = collapseOne(next);
    if (!merged) return next;
    next = merged.column;
  }
}

export function normalizeNumsolis(state: NumsolisState): NumsolisState {
  return { ...state, columns: state.columns.map(collapseColumn) };
}

function validColumnIndex(index: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < NUMSOLIS_COLUMNS;
}

/**
 * Move a contiguous suffix of a column. `start=0` moves the whole column;
 * `start=column.length-1` moves only the top card. A column that has been
 * emptied is permanently closed and can never be a destination again.
 */
export function canMoveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  start = state.columns[from]?.length - 1,
): boolean {
  if (!validColumnIndex(from) || !validColumnIndex(to) || from === to) return false;
  if (state.closedColumns[to]) return false;
  const source = state.columns[from];
  const target = state.columns[to];
  if (!Number.isInteger(start) || start < 0 || start >= source.length) return false;

  const moving = source.slice(start);
  const bottomMoving = moving[0];
  const targetTop = target.at(-1);

  if (targetTop && !(targetTop.value > bottomMoving.value || sameMergePair(targetTop, bottomMoving))) {
    return false;
  }

  return collapseColumn([...target, ...moving]).length <= NUMSOLIS_STACK_LIMIT;
}

/**
 * Returns the visual sequence for a legal move: first the moved cards land in
 * the destination, then every merge is exposed as its own animation stage.
 */
export function previewNumsolisMove(
  state: NumsolisState,
  from: number,
  to: number,
  start = state.columns[from]?.length - 1,
): NumsolisMovePreview | null {
  if (!canMoveNumsolis(state, from, to, start)) return null;

  const columns = cloneColumns(state.columns);
  const moving = columns[from].splice(start);
  columns[to] = [...columns[to], ...moving];
  const stages: NumsolisAnimationStage[] = [{ columns: cloneColumns(columns), pulseId: null }];

  while (true) {
    const merged = collapseOne(columns[to]);
    if (!merged) break;
    columns[to] = merged.column;
    stages.push({ columns: cloneColumns(columns), pulseId: merged.pulseId });
  }

  const closedColumns = [...state.closedColumns];
  if (columns[from].length === 0) closedColumns[from] = true;

  return {
    stages,
    finalState: {
      ...state,
      columns: cloneColumns(columns),
      closedColumns,
      moves: state.moves + 1,
    },
  };
}

export function moveNumsolis(
  state: NumsolisState,
  from: number,
  to: number,
  start = state.columns[from]?.length - 1,
): NumsolisState | null {
  return previewNumsolisMove(state, from, to, start)?.finalState ?? null;
}

/** The game ends only after both logical colors have produced their own 2048. */
export function isNumsolisWon(state: NumsolisState): boolean {
  const cards = state.columns.flat();
  return NUMSOLIS_COLORS.every((color) =>
    cards.some((card) => card.color === color && card.value === NUMSOLIS_TARGET),
  );
}

/** Progress is averaged across both colors so one finished color is only half done. */
export function numsolisProgress(state: NumsolisState): number {
  const cards = state.columns.flat();
  const total = NUMSOLIS_COLORS.reduce((sum, color) => {
    const maxForColor = Math.max(0, ...cards.filter((card) => card.color === color).map((card) => card.value));
    return sum + Math.min(1, maxForColor / NUMSOLIS_TARGET);
  }, 0);
  return total / NUMSOLIS_COLORS.length;
}

function randomChoice<T>(items: T[]): T | undefined {
  return items[Math.floor(Math.random() * items.length)];
}

function randomInteger([min, max]: readonly [number, number]): number {
  return min + Math.floor(Math.random() * (max - min + 1));
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

function countBuriedPairDepth(columns: NumsolisCard[][]): number {
  const groups = new Map<string, number[]>();
  for (const column of columns) {
    for (let index = 0; index < column.length; index++) {
      const card = column[index];
      const key = `${card.color}:${card.value}`;
      const depths = groups.get(key) ?? [];
      depths.push(column.length - 1 - index);
      groups.set(key, depths);
    }
  }

  let total = 0;
  for (const depths of groups.values()) {
    if (depths.length < 2) continue;
    depths.sort((a, b) => a - b);
    total += depths[0] + depths[1];
  }
  return total;
}

/**
 * Human-oriented difficulty estimate for a generated deal. It combines the
 * known solution length with crowding, pair burial and legal non-merge choices.
 * It is intentionally not a shortest-path solver; generation still keeps a
 * certified reverse-built solution and uses this score only to shape the deal.
 */
export function evaluateNumsolisDifficulty(
  state: NumsolisState,
  solution: readonly NumsolisMove[],
): NumsolisDifficultyMetrics {
  const heights = state.columns.map((column) => column.length);
  let legalMoves = 0;
  let openMergeMoves = 0;

  for (let from = 0; from < NUMSOLIS_COLUMNS; from++) {
    const source = state.columns[from];
    for (let start = 0; start < source.length; start++) {
      const bottomMoving = source[start];
      for (let to = 0; to < NUMSOLIS_COLUMNS; to++) {
        if (!canMoveNumsolis(state, from, to, start)) continue;
        legalMoves += 1;
        if (sameMergePair(state.columns[to].at(-1), bottomMoving)) openMergeMoves += 1;
      }
    }
  }

  const buriedPairDepth = countBuriedPairDepth(state.columns);
  const decoyMoves = Math.max(0, legalMoves - openMergeMoves);
  const decoyRatio = legalMoves === 0 ? 0 : decoyMoves / legalMoves;
  const maxColumnHeight = Math.max(0, ...heights);
  const minColumnHeight = Math.min(...heights);
  const heightSpread = maxColumnHeight - minColumnHeight;
  const rawScore =
    solution.length * 2 +
    buriedPairDepth * 1.2 +
    maxColumnHeight * 4 +
    heightSpread * 1.5 +
    decoyMoves * 0.6 -
    openMergeMoves * 0.8;

  return {
    cardCount: state.columns.flat().length,
    solutionMoves: solution.length,
    maxColumnHeight,
    minColumnHeight,
    legalMoves,
    openMergeMoves,
    decoyMoves,
    decoyRatio,
    buriedPairDepth,
    score: Math.max(0, Math.round(rawScore)),
  };
}

function inRange(value: number, [min, max]: readonly [number, number]): boolean {
  return value >= min && value <= max;
}

function rangeDistance(value: number, [min, max]: readonly [number, number]): number {
  if (value < min) return min - value;
  if (value > max) return value - max;
  return 0;
}

function matchesDifficultyProfile(
  difficulty: NumsolisDifficulty,
  metrics: NumsolisDifficultyMetrics,
): boolean {
  const profile = DIFFICULTY_PROFILES[difficulty];
  return (
    inRange(metrics.score, profile.score) &&
    inRange(metrics.maxColumnHeight, profile.maxColumnHeight) &&
    inRange(metrics.buriedPairDepth, profile.buriedPairDepth) &&
    inRange(metrics.openMergeMoves, profile.openMergeMoves) &&
    metrics.decoyMoves >= profile.minDecoyMoves &&
    metrics.decoyRatio >= profile.minDecoyRatio
  );
}

function difficultyPenalty(
  difficulty: NumsolisDifficulty,
  metrics: NumsolisDifficultyMetrics,
): number {
  const profile = DIFFICULTY_PROFILES[difficulty];
  return (
    rangeDistance(metrics.score, profile.score) +
    rangeDistance(metrics.maxColumnHeight, profile.maxColumnHeight) * 8 +
    rangeDistance(metrics.buriedPairDepth, profile.buriedPairDepth) * 2 +
    rangeDistance(metrics.openMergeMoves, profile.openMergeMoves) * 3 +
    Math.max(0, profile.minDecoyMoves - metrics.decoyMoves) * 4 +
    Math.max(0, profile.minDecoyRatio - metrics.decoyRatio) * 100
  );
}

function replaySolution(state: NumsolisState, solution: readonly NumsolisMove[]): boolean {
  let replay = state;
  for (const move of solution) {
    const next = moveNumsolis(replay, move.from, move.to, move.start);
    if (!next) return false;
    replay = next;
  }
  return isNumsolisWon(replay);
}

function buildGenerated(
  difficulty: NumsolisDifficulty,
  extraSplits: number,
): NumsolisGenerated | null {
  const columns: NumsolisCard[][] = Array.from({ length: NUMSOLIS_COLUMNS }, () => []);
  let nextId = 1;
  NUMSOLIS_COLORS.forEach((color, index) => {
    columns[index].push({ id: nextId++, value: NUMSOLIS_TARGET, color });
  });

  const solution: NumsolisMove[] = [];

  // Seed all six columns while guaranteeing that the initial deal contains no 2048.
  const seedSplits: Array<[number, number]> = [
    [0, 2],
    [1, 3],
    [2, 4],
    [3, 5],
  ];
  for (const [from, to] of seedSplits) {
    const result = splitTop(columns, from, to, nextId);
    if (!result) return null;
    nextId = result.nextId;
    solution.unshift(result.inverse);
  }

  for (let step = 0; step < extraSplits; step++) {
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

  const state: NumsolisState = {
    columns,
    closedColumns: new Array(NUMSOLIS_COLUMNS).fill(false),
    moves: 0,
    seconds: 0,
    nextId,
    difficulty,
  };
  if (state.columns.some((column) => column.length === 0 || column.length > NUMSOLIS_STACK_LIMIT)) return null;
  if (state.columns.flat().some((card) => card.value > NUMSOLIS_MAX_DEALT_VALUE)) return null;
  if (!replaySolution(state, solution)) return null;

  return { state, solution };
}

/**
 * Apply reversible non-merge moves after reverse generation. These moves keep
 * every column open and can be undone in reverse order before following the
 * original certified solution, so they make the initial layout less obvious
 * without sacrificing the solvability guarantee.
 */
function scrambleGenerated(
  generated: NumsolisGenerated,
  scrambleMoves: number,
): NumsolisGenerated | null {
  if (scrambleMoves === 0) return generated;

  const state: NumsolisState = {
    ...generated.state,
    columns: cloneColumns(generated.state.columns),
    closedColumns: [...generated.state.closedColumns],
  };
  const solution = generated.solution.map((move) => ({ ...move }));

  for (let step = 0; step < scrambleMoves; step++) {
    const options: Array<{ from: number; to: number; start: number }> = [];

    for (let from = 0; from < NUMSOLIS_COLUMNS; from++) {
      const source = state.columns[from];
      for (let start = 1; start < source.length; start++) {
        const bottomMoving = source[start];
        const remainingTop = source[start - 1];
        if (remainingTop.value <= bottomMoving.value) continue;

        const movingLength = source.length - start;
        for (let to = 0; to < NUMSOLIS_COLUMNS; to++) {
          if (to === from) continue;
          const target = state.columns[to];
          const targetTop = target.at(-1);
          if (!targetTop || targetTop.value <= bottomMoving.value) continue;
          if (target.length + movingLength > NUMSOLIS_STACK_LIMIT) continue;
          options.push({ from, to, start });
        }
      }
    }

    const option = randomChoice(options);
    if (!option) return null;

    const inverseStart = state.columns[option.to].length;
    const moving = state.columns[option.from].splice(option.start);
    state.columns[option.to].push(...moving);
    solution.unshift({ from: option.to, to: option.from, start: inverseStart });
  }

  if (!replaySolution(state, solution)) return null;
  return { state, solution };
}

function preferCandidate(
  difficulty: NumsolisDifficulty,
  current: { generated: NumsolisGenerated; metrics: NumsolisDifficultyMetrics } | null,
  generated: NumsolisGenerated,
  metrics: NumsolisDifficultyMetrics,
): { generated: NumsolisGenerated; metrics: NumsolisDifficultyMetrics } {
  if (!current) return { generated, metrics };

  if (metrics.cardCount !== current.metrics.cardCount) {
    return metrics.cardCount > current.metrics.cardCount ? { generated, metrics } : current;
  }

  return difficultyPenalty(difficulty, metrics) < difficultyPenalty(difficulty, current.metrics)
    ? { generated, metrics }
    : current;
}

function recoverDenseGenerated(difficulty: NumsolisDifficulty): NumsolisGenerated | null {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const recoveryFloor = difficulty === "hard" ? 38 : difficulty === "medium" ? 30 : profile.extraSplits[0];

  for (let extraSplits = profile.extraSplits[0]; extraSplits >= recoveryFloor; extraSplits--) {
    const attempts = difficulty === "hard" ? 800 : 300;
    for (let attempt = 0; attempt < attempts; attempt++) {
      const generated = buildGenerated(difficulty, extraSplits);
      if (generated) return generated;
    }
  }

  return null;
}

/**
 * Builds puzzles backwards from one 2048 end state per color. Difficulty
 * profiles are preferred rather than allowed to crash generation: every
 * reverse-built candidate considered here already has a replay-verified path to
 * victory. If no candidate hits the exact profile, the densest closest
 * certified candidate is returned. A final recovery pass slightly relaxes only
 * card density before ever giving up.
 */
export function generateNumsolis(
  difficulty: NumsolisDifficulty = "medium",
): NumsolisGenerated {
  const profile = DIFFICULTY_PROFILES[difficulty];
  const maxAttempts = difficulty === "hard" ? 4000 : difficulty === "medium" ? 2000 : 1000;
  let best: { generated: NumsolisGenerated; metrics: NumsolisDifficultyMetrics } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const extraSplits = randomInteger(profile.extraSplits);
    const built = buildGenerated(difficulty, extraSplits);
    if (!built) continue;

    const builtMetrics = evaluateNumsolisDifficulty(built.state, built.solution);
    best = preferCandidate(difficulty, best, built, builtMetrics);
    if (matchesDifficultyProfile(difficulty, builtMetrics)) return built;

    const scrambleMoves = randomInteger(profile.scrambleMoves);
    const scrambled = scrambleGenerated(built, scrambleMoves);
    if (!scrambled) continue;

    const scrambledMetrics = evaluateNumsolisDifficulty(scrambled.state, scrambled.solution);
    best = preferCandidate(difficulty, best, scrambled, scrambledMetrics);
    if (matchesDifficultyProfile(difficulty, scrambledMetrics)) return scrambled;
  }

  if (best) return best.generated;

  const recovered = recoverDenseGenerated(difficulty);
  if (recovered) return recovered;

  throw new Error(`Unable to generate a solvable ${difficulty} Numsolis board`);
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
    if (!Array.isArray(parsed.closedColumns) || parsed.closedColumns.length !== NUMSOLIS_COLUMNS) return null;
    if (parsed.closedColumns.some((closed) => typeof closed !== "boolean")) return null;
    if (!Number.isInteger(parsed.moves) || parsed.moves < 0 || !Number.isInteger(parsed.seconds) || parsed.seconds < 0) return null;
    if (!Number.isInteger(parsed.nextId) || parsed.nextId < 1) return null;
    if (!NUMSOLIS_DIFFICULTIES.includes(parsed.difficulty)) return null;

    const ids = new Set<number>();
    const sums = new Map<NumsolisColor, number>(NUMSOLIS_COLORS.map((color) => [color, 0]));
    let maxId = 0;
    for (let columnIndex = 0; columnIndex < parsed.columns.length; columnIndex++) {
      const column = parsed.columns[columnIndex];
      if (!Array.isArray(column) || column.length > NUMSOLIS_STACK_LIMIT) return null;
      if (parsed.closedColumns[columnIndex] && column.length !== 0) return null;
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
      columns: cloneColumns(parsed.columns),
      closedColumns: [...parsed.closedColumns],
      moves: parsed.moves,
      seconds: parsed.seconds,
      nextId: parsed.nextId,
      difficulty: parsed.difficulty,
    };
  } catch {
    return null;
  }
}
