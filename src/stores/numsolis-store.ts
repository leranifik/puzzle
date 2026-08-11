"use client";

import { create } from "zustand";
import {
  type NumsolisDifficulty,
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
  selectedStart: number | null;
  history: NumsolisState[];
  revision: number;
  init: (state: NumsolisState) => void;
  newGame: (difficulty?: NumsolisDifficulty) => void;
  select: (column: number | null, start?: number | null) => void;
  move: (from: number, to: number, start?: number) => boolean;
  undo: () => boolean;
  tick: () => void;
  reset: () => void;
};

const snapshot = (state: NumsolisState): NumsolisState => ({
  ...state,
  columns: state.columns.map((column) => column.map((card) => ({ ...card }))),
});

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,
  selectedColumn: null,
  selectedStart: null,
  history: [],
  revision: 0,

  init: (state) => set({ state, won: isNumsolisWon(state), selectedColumn: null, selectedStart: null, history: [], revision: 0 }),
  newGame: (difficulty = "medium") => set({ state: newNumsolis(difficulty), won: false, selectedColumn: null, selectedStart: null, history: [], revision: 0 }),
  select: (column, start = null) => set({ selectedColumn: column, selectedStart: column === null ? null : start }),

  move: (from, to, start) => {
    const { state, won, history, revision } = get();
    if (!state || won) return false;
    const next = moveNumsolis(state, from, to, start);
    if (!next) return false;
    set({
      state: next,
      won: isNumsolisWon(next),
      selectedColumn: null,
      selectedStart: null,
      history: [...history, snapshot(state)].slice(-50),
      revision: revision + 1,
    });
    return true;
  },

  undo: () => {
    const { history, state, revision } = get();
    const previous = history.at(-1);
    if (!previous || !state) return false;
    const restored = { ...snapshot(previous), seconds: state.seconds };
    set({
      state: restored,
      won: isNumsolisWon(restored),
      selectedColumn: null,
      selectedStart: null,
      history: history.slice(0, -1),
      revision: revision + 1,
    });
    return true;
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, selectedColumn: null, selectedStart: null, history: [], revision: 0 }),
}));

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? numsolisProgress(state) : 0;
