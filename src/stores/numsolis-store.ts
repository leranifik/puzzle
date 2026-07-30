"use client";

import { create } from "zustand";
import {
  type NumsolisMoveOutcome,
  type NumsolisState,
  isNumsolisComplete,
  moveNumsolis,
  newNumsolis,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  init: (state: NumsolisState) => void;
  newGame: () => void;
  move: (from: number, to: number) => NumsolisMoveOutcome;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,

  init: (state) => set({ state, won: isNumsolisComplete(state) }),

  newGame: () => set({ state: newNumsolis(), won: false }),

  move: (from, to) => {
    const { state, won } = get();
    if (!state || won) return "none";
    const result = moveNumsolis(state, from, to);
    if (result.outcome !== "none") {
      set({ state: result.state, won: isNumsolisComplete(result.state) });
    }
    return result.outcome;
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false }),
}));
