"use client";

import { create } from "zustand";
import {
  type NumsolisColorCount,
  type NumsolisMoveOutcome,
  type NumsolisState,
  isNumsolisComplete,
  moveNumsolis,
  newNumsolis,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  canUndo: boolean;
  revision: number;
  lastMergedCardId: number | null;
  history: NumsolisState[];
  init: (state: NumsolisState) => void;
  newGame: (colorCount?: NumsolisColorCount) => void;
  move: (from: number, to: number, fromIndex?: number) => NumsolisMoveOutcome;
  undo: () => boolean;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,
  canUndo: false,
  revision: 0,
  lastMergedCardId: null,
  history: [],

  init: (state) =>
    set({
      state,
      won: isNumsolisComplete(state),
      canUndo: false,
      revision: 0,
      lastMergedCardId: null,
      history: [],
    }),

  newGame: (colorCount = 2) =>
    set({
      state: newNumsolis(colorCount),
      won: false,
      canUndo: false,
      revision: 0,
      lastMergedCardId: null,
      history: [],
    }),

  move: (from, to, fromIndex) => {
    const { state, won, history, revision } = get();
    if (!state || won) return "none";
    const result = moveNumsolis(state, from, to, fromIndex);
    if (result.outcome !== "none") {
      const nextHistory = [...history, state].slice(-100);
      set({
        state: result.state,
        won: isNumsolisComplete(result.state),
        canUndo: true,
        revision: revision + 1,
        lastMergedCardId: result.mergedCardId,
        history: nextHistory,
      });
    }
    return result.outcome;
  },

  undo: () => {
    const { state, history, revision } = get();
    if (!state || history.length === 0) return false;
    const previous = history[history.length - 1];
    const restored = { ...previous, seconds: state.seconds };
    const nextHistory = history.slice(0, -1);
    set({
      state: restored,
      won: isNumsolisComplete(restored),
      canUndo: nextHistory.length > 0,
      revision: revision + 1,
      lastMergedCardId: null,
      history: nextHistory,
    });
    return true;
  },

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () =>
    set({
      state: null,
      won: false,
      canUndo: false,
      revision: 0,
      lastMergedCardId: null,
      history: [],
    }),
}));
