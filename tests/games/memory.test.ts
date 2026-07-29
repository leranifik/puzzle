import { describe, it, expect } from "vitest";
import {
  newMemory,
  flipCard,
  hideMisses,
  isMemoryComplete,
  memoryProgress,
  serializeMemory,
  deserializeMemory,
  type MemoryState,
} from "@/lib/games/memory";

/** Deterministic tiny state helper. */
function stateOf(deck: number[], extra: Partial<MemoryState> = {}): MemoryState {
  return {
    size: deck.length as MemoryState["size"],
    deck,
    matched: new Array(deck.length).fill(false),
    flipped: [],
    moves: 0,
    seconds: 0,
    ...extra,
  };
}

describe("memory engine", () => {
  describe("newMemory", () => {
    it.each([12, 16, 20] as const)("deals %i cards with each symbol exactly twice", (size) => {
      const s = newMemory(size);
      expect(s.deck).toHaveLength(size);
      const counts = new Map<number, number>();
      for (const v of s.deck) counts.set(v, (counts.get(v) ?? 0) + 1);
      for (const c of counts.values()) expect(c).toBe(2);
    });
  });

  describe("flipCard", () => {
    const deck = [0, 1, 0, 1]; // pairs at (0,2) and (1,3)

    it("first flip reveals a card without counting a move", () => {
      const { state, outcome } = flipCard(stateOf(deck), 0);
      expect(outcome).toBe("flip");
      expect(state.flipped).toEqual([0]);
      expect(state.moves).toBe(0);
    });

    it("matching second flip locks the pair and counts a move", () => {
      const s = flipCard(stateOf(deck), 0).state;
      const r = flipCard(s, 2);
      expect(r.outcome).toBe("match");
      expect(r.state.matched[0]).toBe(true);
      expect(r.state.matched[2]).toBe(true);
      expect(r.state.flipped).toEqual([]);
      expect(r.state.moves).toBe(1);
    });

    it("miss keeps both cards face-up until hideMisses", () => {
      const s = flipCard(stateOf(deck), 0).state;
      const r = flipCard(s, 1);
      expect(r.outcome).toBe("miss");
      expect(r.state.flipped).toEqual([0, 1]);
      expect(hideMisses(r.state).flipped).toEqual([]);
    });

    it("ignores clicks on matched, already-flipped, or third cards", () => {
      let s = stateOf(deck, { matched: [true, false, true, false] });
      expect(flipCard(s, 0).outcome).toBe("ignored");

      s = stateOf(deck, { flipped: [1] });
      expect(flipCard(s, 1).outcome).toBe("ignored");

      s = stateOf(deck, { flipped: [0, 1] }); // two misses pending
      expect(flipCard(s, 3).outcome).toBe("ignored");
    });
  });

  describe("completion & progress", () => {
    it("tracks progress and completion", () => {
      const deck = [0, 1, 0, 1];
      let s = stateOf(deck);
      expect(memoryProgress(s)).toBe(0);
      expect(isMemoryComplete(s)).toBe(false);

      s = flipCard(flipCard(s, 0).state, 2).state;
      expect(memoryProgress(s)).toBe(0.5);

      s = flipCard(flipCard(s, 1).state, 3).state;
      expect(memoryProgress(s)).toBe(1);
      expect(isMemoryComplete(s)).toBe(true);
    });
  });

  describe("serialize / deserialize", () => {
    it("never persists transient flips", () => {
      const s = stateOf([0, 1, 0, 1], { flipped: [0, 1] });
      // size 4 is not a valid MemorySize; use a real deck for the round-trip
      const real = newMemory(12);
      const withFlips = { ...real, flipped: [0, 1] };
      const restored = deserializeMemory(serializeMemory(withFlips))!;
      expect(restored.flipped).toEqual([]);
      expect(restored.deck).toEqual(real.deck);
      expect(s.flipped).toEqual([0, 1]); // sanity: original untouched
    });

    it("rejects invalid deck sizes and junk", () => {
      expect(deserializeMemory("junk")).toBeNull();
      expect(deserializeMemory(JSON.stringify({ deck: [0, 1, 0, 1] }))).toBeNull(); // size 4
    });

    it("rebuilds matched array when corrupted", () => {
      const real = newMemory(12);
      const raw = JSON.stringify({ ...real, matched: [true] });
      const restored = deserializeMemory(raw)!;
      expect(restored.matched).toHaveLength(12);
      expect(restored.matched.every((m) => m === false)).toBe(true);
    });
  });
});
