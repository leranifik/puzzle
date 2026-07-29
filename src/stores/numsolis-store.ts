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
  selectedCol: number | null;
  init: (state: NumsolisState) => void;
  newGame: () => void;
  selectCol: (col: number) => void;
  moveToCol: (col: number) => boolean;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,
  selectedCol: null,

  init: (state) => set({ state, won: state.won, selectedCol: null }),

  newGame: () => set({ state: newNumsolis(), won: false, selectedCol: null }),

  selectCol: (col) => {
    const s = get().state;
    if (!s || s.won || s.over) return;
    const stacks = s.stacks;
    if (col < 0 || col >= stacks.length) return;
    // If clicking an empty column, deselect
    if (stacks[col].length === 0) {
      set({ selectedCol: null });
      return;
    }
    // Toggle selection
    set((prev) => ({ selectedCol: prev.selectedCol === col ? null : col }));
  },

  moveToCol: (col) => {
    const s = get().state;
    const selected = get().selectedCol;
    if (!s || s.won || s.over || selected === null || selected === col) return false;
    const next = moveNumsolis(s, selected, col);
    if (!next) return false;
    set({ state: next, won: next.won, selectedCol: null });
    return true;
  },

  tick: () => {
    const s = get().state;
    if (!s || s.won || s.over) return;
    set({ state: { ...s, seconds: s.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, selectedCol: null }),
}));

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? progressNumsolis(state) : 0;
