"use client";

import { create } from "zustand";
import {
  type NumsolisState,
  newNumsolis,
  moveNumsolis,
  progressNumsolis,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  init: (state: NumsolisState) => void;
  newGame: (size?: number) => void;
  move: (index: number) => boolean;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,

  init: (state) => set({ state, won: state.won }),

  newGame: (size = 4) => set({ state: newNumsolis(size), won: false }),

  move: (index) => {
    const s = get().state;
    if (!s || s.won || s.over) return false;
    const next = moveNumsolis(s, index);
    if (!next) return false;
    set({ state: next, won: next.won });
    return true;
  },

  tick: () => {
    const s = get().state;
    if (!s || s.won || s.over) return;
    set({ state: { ...s, seconds: s.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false }),
}));

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? progressNumsolis(state) : 0;
