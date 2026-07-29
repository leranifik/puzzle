"use client";

import { create } from "zustand";
import {
  type NumsolisState,
  type Difficulty,
  newNumsolis,
  applyMove,
  canMove,
  isWon,
  numsolisProgress,
} from "@/lib/games/numsolis";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  /** Column currently picked up (its free card is being moved), or null. */
  selected: number | null;
  init: (state: NumsolisState) => void;
  newGame: (difficulty: Difficulty) => void;
  /** Tap a column: selects its free card, moves the held card, or deselects. */
  tap: (column: number) => "select" | "move" | "deselect" | "none";
  /** Direct move (for drag-and-drop). Returns whether it applied. */
  move: (from: number, to: number) => boolean;
  select: (column: number | null) => void;
  tick: () => void;
  reset: () => void;
};

export const useNumsolisStore = create<NumsolisStore>((set, get) => ({
  state: null,
  won: false,
  selected: null,

  init: (state) => set({ state, won: isWon(state), selected: null }),

  newGame: (difficulty) =>
    set({ state: newNumsolis(difficulty), won: false, selected: null }),

  tap: (column) => {
    const { state, won, selected } = get();
    if (!state || won) return "none";

    if (selected === null) {
      if (state.columns[column].length === 0) return "none";
      set({ selected: column });
      return "select";
    }

    if (selected === column) {
      set({ selected: null });
      return "deselect";
    }

    if (canMove(state, selected, column)) {
      const next = applyMove(state, selected, column);
      if (next) {
        set({ state: next, won: isWon(next), selected: null });
        return "move";
      }
    }

    // Illegal target: retarget selection to the tapped non-empty column.
    if (state.columns[column].length > 0) {
      set({ selected: column });
      return "select";
    }
    set({ selected: null });
    return "deselect";
  },

  move: (from, to) => {
    const { state, won } = get();
    if (!state || won) return false;
    const next = applyMove(state, from, to);
    if (!next) return false;
    set({ state: next, won: isWon(next), selected: null });
    return true;
  },

  select: (column) => set({ selected: column }),

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, selected: null }),
}));

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? numsolisProgress(state) : 0;
