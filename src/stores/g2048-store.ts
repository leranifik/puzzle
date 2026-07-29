"use client";

import { create } from "zustand";
import {
  type G2048State,
  type Direction,
  type MoveOutcome,
  new2048,
  move2048,
  pruneDying,
} from "@/lib/games/g2048";

type G2048Store = {
  state: G2048State | null;
  /** Set once the player sees the 2048 overlay and chooses to keep going. */
  dismissedWin: boolean;
  init: (state: G2048State) => void;
  newGame: () => void;
  move: (direction: Direction) => MoveOutcome;
  prune: () => void;
  keepGoing: () => void;
  tick: () => void;
  reset: () => void;
};

export const use2048Store = create<G2048Store>((set, get) => ({
  state: null,
  dismissedWin: false,

  init: (state) => set({ state, dismissedWin: state.reached2048 }),

  newGame: () =>
    set((s) => ({ state: new2048(s.state?.best ?? 0), dismissedWin: false })),

  move: (direction) => {
    const { state } = get();
    if (!state || state.over) return "none";
    const result = move2048(state, direction);
    if (result.outcome !== "none") set({ state: result.state });
    return result.outcome;
  },

  prune: () => {
    const { state } = get();
    if (!state) return;
    const pruned = pruneDying(state);
    if (pruned !== state) set({ state: pruned });
  },

  keepGoing: () => set({ dismissedWin: true }),

  tick: () => {
    const { state } = get();
    if (!state || state.over) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, dismissedWin: false }),
}));
