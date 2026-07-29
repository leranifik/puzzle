/**
 * Memory (find the pair) engine.
 * Deck is a list of card ids; each symbol appears exactly twice.
 */

export type MemorySize = 12 | 16 | 20;

export type MemoryState = {
  size: MemorySize;
  deck: number[]; // symbol index per card position
  matched: boolean[]; // permanently revealed
  flipped: number[]; // currently face-up (0..2 cards)
  moves: number;
  seconds: number;
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function newMemory(size: MemorySize = 16): MemoryState {
  const pairs = size / 2;
  const deck = shuffle(
    Array.from({ length: pairs }, (_, i) => [i, i]).flat(),
  );
  return {
    size,
    deck,
    matched: new Array(size).fill(false),
    flipped: [],
    moves: 0,
    seconds: 0,
  };
}

export type FlipResult = {
  state: MemoryState;
  outcome: "flip" | "match" | "miss" | "ignored";
};

export function flipCard(state: MemoryState, index: number): FlipResult {
  if (
    state.matched[index] ||
    state.flipped.includes(index) ||
    state.flipped.length >= 2
  ) {
    return { state, outcome: "ignored" };
  }

  const flipped = [...state.flipped, index];
  if (flipped.length < 2) {
    return { state: { ...state, flipped }, outcome: "flip" };
  }

  const [a, b] = flipped;
  const moves = state.moves + 1;
  if (state.deck[a] === state.deck[b]) {
    const matched = [...state.matched];
    matched[a] = true;
    matched[b] = true;
    return { state: { ...state, matched, flipped: [], moves }, outcome: "match" };
  }
  // Keep both cards face-up; the UI schedules `hideMisses` after a delay.
  return { state: { ...state, flipped, moves }, outcome: "miss" };
}

export function hideMisses(state: MemoryState): MemoryState {
  return { ...state, flipped: [] };
}

export function isMemoryComplete(state: MemoryState): boolean {
  return state.matched.every(Boolean);
}

export function memoryProgress(state: MemoryState): number {
  return state.matched.filter(Boolean).length / state.size;
}

export function serializeMemory(state: MemoryState): string {
  // Never persist transient flips.
  return JSON.stringify({ ...state, flipped: [] });
}

export function deserializeMemory(raw: string): MemoryState | null {
  try {
    const parsed = JSON.parse(raw) as MemoryState;
    if (!Array.isArray(parsed.deck) || ![12, 16, 20].includes(parsed.deck.length)) return null;
    const size = parsed.deck.length as MemorySize;
    return {
      size,
      deck: parsed.deck,
      matched:
        Array.isArray(parsed.matched) && parsed.matched.length === size
          ? parsed.matched
          : new Array(size).fill(false),
      flipped: [],
      moves: parsed.moves ?? 0,
      seconds: parsed.seconds ?? 0,
    };
  } catch {
    return null;
  }
}
