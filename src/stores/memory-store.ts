"use client";

import { create } from "zustand";
import {
  type MemoryState,
  type MemorySize,
  newMemory,
  flipCard,
  hideMisses,
  isMemoryComplete,
} from "@/lib/games/memory";

type MemoryStore = {
  state: MemoryState | null;
  won: boolean;
  init: (state: MemoryState) => void;
  newGame: (size: MemorySize) => void;
  flip: (index: number) => "flip" | "match" | "miss" | "ignored";
  hide: () => void;
  tick: () => void;
  reset: () => void;
};

export const useMemoryStore = create<MemoryStore>((set, get) => ({
  state: null,
  won: false,

  init: (state) => set({ state, won: isMemoryComplete(state) }),

  newGame: (size) => set({ state: newMemory(size), won: false }),

  flip: (index) => {
    const { state, won } = get();
    if (!state || won) return "ignored";
    const result = flipCard(state, index);
    if (result.outcome !== "ignored") {
      set({ state: result.state, won: isMemoryComplete(result.state) });
    }
    return result.outcome;
  },

  hide: () => {
    const { state } = get();
    if (!state) return;
    set({ state: hideMisses(state) });
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false }),
}));
