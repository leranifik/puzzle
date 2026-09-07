import {
  applyNumsolisColumns,
  createNumsolisState,
  deserializeNumsolis,
  isNumsolisColumnsWon,
  serializeNumsolis,
  type NumsolisCard,
  type NumsolisColumns,
  type NumsolisDifficulty,
  type NumsolisMove,
  type NumsolisState,
} from "./numsolis";

export const NUMSOLIS_PROFILES = {
  easy: { minCards: 38, maxCards: 44, minHeight: 4, rearrangements: 3 },
  medium: { minCards: 46, maxCards: 52, minHeight: 6, rearrangements: 8 },
  hard: { minCards: 46, maxCards: 53, minHeight: 5, rearrangements: 14 },
} as const;

export type NumsolisDeal = {
  state: NumsolisState;
  solution: NumsolisMove[];
  source: "constructed" | "fallback";
};

// Versioned recipes for the reserve bank. Every recipe is replay-tested below
// the public generator and in the test corpus, including both hard suit biases.
export const NUMSOLIS_RESERVE_SEEDS: Record<NumsolisDifficulty, readonly number[]> = {
  easy: [0, 1, 2, 4, 5, 6, 7, 8],
  medium: [0, 1, 2, 3, 4, 5, 6, 7],
  hard: [1, 4, 5, 8, 11, 14, 19, 21],
};

function randomSource(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const same = (a: NumsolisCard | undefined, b: NumsolisCard) =>
  a?.value === b.value && a.suit === b.suit;
const countCards = (columns: NumsolisColumns) => columns.reduce((sum, c) => sum + c.length, 0);

export function matchesNumsolisProfile(columns: NumsolisColumns, difficulty: NumsolisDifficulty): boolean {
  const profile = NUMSOLIS_PROFILES[difficulty];
  const count = countCards(columns);
  if (columns.length !== 6 || count < profile.minCards || count > profile.maxCards ||
      columns.some((c) => c.length < profile.minHeight || c.length > 9 ||
        c.some((card, index) => card.value >= 2048 || (index > 0 && same(c[index - 1], card))))) return false;
  if (difficulty !== "easy") {
    const light = columns.flat().filter((card) => card.suit === 0).length;
    if (light < 16 || count - light < 16) return false;
  }
  if (difficulty === "hard") {
    const light = columns.filter((c) => c[0].suit === 0).length;
    if (columns.some((c) => c[0].value > 32) || Math.max(light, 6 - light) < 5) return false;
  }
  return true;
}

/** A certificate is accepted only after the ordinary engine reaches ALL goals. */
export function verifyNumsolisSolution(state: NumsolisState, solution: readonly NumsolisMove[]): boolean {
  if (solution.length > 256 || !deserializeNumsolis(serializeNumsolis(state))) return false;
  let columns = state.columns;
  for (const move of solution) {
    const next = applyNumsolisColumns(columns, move);
    if (!next) return false;
    columns = next;
  }
  return isNumsolisColumnsWon(columns, state.difficulty);
}

/**
 * Undo a possible future merge, never merge an initial deal automatically.
 * Split any card v into v/2 at the end of the receiving prefix and move its
 * other half plus the suffix to another column. Reversing this step is a legal
 * group move. Avoid adjacent pairs so reversing it cannot add an extra cascade.
 * Empty columns may open during construction only: the FORWARD witness closes
 * them and never places a card into an empty column.
 */
export function buildNumsolisCandidate(difficulty: NumsolisDifficulty, seed: number): NumsolisDeal | null {
  const random = randomSource(seed);
  const profile = NUMSOLIS_PROFILES[difficulty];
  const dominant: 0 | 1 = random() < 0.5 ? 0 : 1;
  const mediumLightRoots = difficulty === "medium" ? 2 + Math.floor(random() * 3) : 3;
  const wanted = profile.minCards + Math.floor(random() * (profile.maxCards - profile.minCards + 1));
  const rootLimits = Array.from({ length: 6 }, () => [2, 4, 8, 16, 32][Math.floor(random() * 5)]);
  let columns: NumsolisColumns = Array.from({ length: 6 }, () => []);
  columns[0] = [{ id: 0, value: 2048, suit: 0 }];
  if (difficulty !== "easy") columns[1] = [{ id: 1, value: 2048, suit: 1 }];
  if (difficulty === "hard" && random() < 0.33) {
    const other = (1 - dominant) as 0 | 1;
    columns[0] = [{ id: dominant, value: 2048, suit: dominant }, { id: other, value: 2048, suit: other }];
    columns[1] = [];
  }
  let nextId = 2;
  const solution: NumsolisMove[] = [];

  for (let step = 0; countCards(columns) < wanted && step < 54; step++) {
    const empty = columns.some((c) => c.length === 0);
    const suitCounts = [0, 0];
    for (const c of columns) for (const card of c) suitCounts[card.suit]++;
    const requiredSplits = difficulty === "easy" ? 0 : suitCounts.reduce((sum, n) => sum + Math.max(0, 16 - n), 0);
    const mustBalance = wanted - countCards(columns) <= requiredSplits;
    const roots = [0, 0];
    for (const c of columns) if (c.length) roots[c[0].suit]++;
    let best: { columns: NumsolisColumns; move: NumsolisMove; score: number } | null = null;
    for (let to = 0; to < 6; to++) {
      for (let index = 0; index < columns[to].length; index++) {
        const card = columns[to][index];
        if (card.value < 4) continue;
        if (mustBalance && suitCounts[card.suit] >= 16) continue;
        const half = { ...card, value: card.value / 2 };
        if (same(columns[to][index - 1], half) || same(columns[to][index + 1], half)) continue;
        const group = [{ ...half, id: nextId }, ...columns[to].slice(index + 1)];
        for (let from = 0; from < 6; from++) {
          if (from === to || columns[from].length + group.length > 9 || same(columns[from].at(-1), half)) continue;
          if (empty && columns[from].length) continue;
          if (empty && difficulty === "hard" && card.suit !== dominant) continue;
          if (empty && difficulty === "medium" && roots[card.suit] >= (card.suit === 0 ? mediumLightRoots : 6 - mediumLightRoots)) continue;
          let score = random() * 4;
          if (card.value === 2048) score += 120;
          if (difficulty === "hard") {
            if (index === 0 && card.value > rootLimits[to]) score += 100 + Math.log2(card.value);
            if (index === 1 && columns[to][0].value > rootLimits[to]) score += 50;
            if (columns[from].length && columns[from][0].value > rootLimits[from]) score -= group.length * 5;
          } else score += Math.log2(card.value) * 0.12;
          const oldSpread = columns[from].length ** 2 + columns[to].length ** 2;
          const newSpread = (columns[from].length + group.length) ** 2 + (index + 1) ** 2;
          score += (oldSpread - newSpread) * 0.045;
          if (best && score <= best.score) continue;
          const next = columns.map((c) => c.slice());
          next[to] = [...columns[to].slice(0, index), half];
          next[from].push(...group);
          best = { columns: next, move: { from, index: columns[from].length, to }, score };
        }
      }
    }
    if (!best) return null;
    columns = best.columns;
    solution.unshift(best.move);
    nextId++;
  }
  if (countCards(columns) !== wanted || !matchesNumsolisProfile(columns, difficulty)) return null;

  // Reverse a few ordinary (non-merging) moves as well, retaining the witness.
  // This mixes suffixes without changing suits, mass, roots or card counts.
  const seen = new Set([JSON.stringify(columns)]);
  for (let step = 0; step < profile.rearrangements; step++) {
    const choices: { columns: NumsolisColumns; move: NumsolisMove }[] = [];
    for (let to = 0; to < 6; to++) {
      for (let index = profile.minHeight; index < columns[to].length; index++) {
        const group = columns[to].slice(index);
        if (group[0].value >= columns[to][index - 1].value) continue;
        for (let from = 0; from < 6; from++) {
          if (from === to || columns[from].length + group.length > 9 || same(columns[from].at(-1), group[0])) continue;
          const next = columns.map((c) => c.slice());
          next[to] = next[to].slice(0, index);
          next[from].push(...group);
          if (!seen.has(JSON.stringify(next))) choices.push({ columns: next, move: { from, index: columns[from].length, to } });
        }
      }
    }
    if (!choices.length) break;
    const chosen = choices[Math.floor(random() * choices.length)];
    columns = chosen.columns;
    solution.unshift(chosen.move);
    seen.add(JSON.stringify(columns));
  }

  // Shuffle column positions and transform the certificate by the same map.
  const order = [0, 1, 2, 3, 4, 5];
  for (let i = 5; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const inverse = order.map((_, old) => order.indexOf(old));
  columns = order.map((old) => columns[old]);
  const mapped = solution.map((move) => ({ ...move, from: inverse[move.from], to: inverse[move.to] }));
  const state = createNumsolisState(columns, difficulty, seed);
  return matchesNumsolisProfile(columns, difficulty) && verifyNumsolisSolution(state, mapped)
    ? { state, solution: mapped, source: "constructed" } : null;
}

export function generateNumsolisDeal(
  difficulty: NumsolisDifficulty,
  seed: number,
  options: { maxAttempts?: number } = {},
): NumsolisDeal {
  if (!Object.hasOwn(NUMSOLIS_PROFILES, difficulty) || !Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("Invalid Numsolis generation parameters");
  }
  const attempts = options.maxAttempts ?? 12;
  if (!Number.isInteger(attempts) || attempts < 0 || attempts > 32) throw new RangeError("Invalid attempt limit");
  for (let i = 0; i < attempts; i++) {
    const candidate = buildNumsolisCandidate(difficulty, (seed + Math.imul(i, 0x9e3779b9)) >>> 0);
    if (candidate) return { ...candidate, state: { ...candidate.state, seed, id: `numsolis-${difficulty}-${seed}` } };
  }
  const bank = NUMSOLIS_RESERVE_SEEDS[difficulty];
  for (let i = 0; i < bank.length; i++) {
    const candidate = buildNumsolisCandidate(difficulty, bank[(seed + i) % bank.length]);
    if (candidate) return {
      ...candidate, source: "fallback", state: { ...candidate.state, seed, id: `numsolis-${difficulty}-${seed}` },
    };
  }
  // Fail closed: never substitute a balanced but unverified random board.
  throw new Error("No verified Numsolis reserve deal available");
}

export const newNumsolis = (difficulty: NumsolisDifficulty, seed: number): NumsolisState =>
  generateNumsolisDeal(difficulty, seed).state;
