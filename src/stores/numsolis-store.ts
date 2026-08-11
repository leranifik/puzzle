"use client";

import { create } from "zustand";
import {
  type NumsolisState,
  isNumsolisWon,
  moveNumsolis,
  newNumsolis,
  numsolisProgress,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  selectedColumn: number | null;
  init: (state: NumsolisState) => void;
  newGame: () => void;
  select: (column: number | null) => void;
  move: (from: number, to: number) => boolean;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,
  selectedColumn: null,

  init: (state) => set({ state, won: isNumsolisWon(state), selectedColumn: null }),
  newGame: () => set({ state: newNumsolis(), won: false, selectedColumn: null }),
  select: (column) => set({ selectedColumn: column }),

  move: (from, to) => {
    const { state, won } = get();
    if (!state || won) return false;
    const next = moveNumsolis(state, from, to);
    if (!next) return false;
    set({ state: next, won: isNumsolisWon(next), selectedColumn: null });
    return true;
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, selectedColumn: null }),
}));

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? numsolisProgress(state) : 0;
