"use client";

import { create } from "zustand";
import {
  type FifteenState,
  newFifteen,
  moveTile,
  isSolved,
  fifteenProgress,
} from "@/lib/games/fifteen";

type FifteenStore = {
  state: FifteenState | null;
  won: boolean;
  lastMovedTile: number | null;
  init: (state: FifteenState) => void;
  newGame: (size: number) => void;
  move: (index: number) => boolean;
  tick: () => void;
  reset: () => void;
};

export const useFifteenStore = create<FifteenStore>((set, get) => ({
  state: null,
  won: false,
  lastMovedTile: null,

  init: (state) => set({ state, won: isSolved(state.board), lastMovedTile: null }),

  newGame: (size) => set({ state: newFifteen(size), won: false, lastMovedTile: null }),

  move: (index) => {
    const { state, won } = get();
    if (!state || won) return false;
    const tile = state.board[index];
    const next = moveTile(state, index);
    if (!next) return false;
    set({ state: next, won: isSolved(next.board), lastMovedTile: tile });
    return true;
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, lastMovedTile: null }),
}));

export const selectFifteenProgress = (state: FifteenState | null) =>
  state ? fifteenProgress(state) : 0;
