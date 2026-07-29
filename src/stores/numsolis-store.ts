"use client";

import { create } from "zustand";
import {
  type NumsolisState,
  type MoveOutcome,
  newNumsolis,
  moveCard,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  init: (state: NumsolisState) => void;
  newGame: () => void;
  move: (srcCol: number, destCol: number) => MoveOutcome;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,

  init: (state) => set({ state }),

  newGame: () =>
    set((s) => ({ state: newNumsolis(s.state?.best ?? 0) })),

  move: (srcCol, destCol) => {
    const { state } = get();
    if (!state || state.over || state.won) return "none";
    const result = moveCard(state, srcCol, destCol);
    if (result.outcome !== "none") set({ state: result.state });
    return result.outcome;
  },

  tick: () => {
    const { state } = get();
    if (!state || state.over || state.won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null }),
}));
