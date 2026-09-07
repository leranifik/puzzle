"use client";

import { create } from "zustand";
import {
  type NumsolisDifficulty,
  type NumsolisMove,
  type NumsolisState,
  type NumsolisColumns,
  applyMove,
  isNumsolisWon,
  isNumsolisLost,
  undoNumsolis,
  restartNumsolis,
  numsolisProgress,
} from "@/lib/games/numsolis";
import { generateNumsolis } from "@/lib/games/numsolis-generation-client";

type NumsolisStore = {
  state: NumsolisState | null;
  won: boolean;
  lost: boolean;
  generating: boolean;
  generationError: boolean;
  animationFrames: NumsolisColumns[];
  animationIndex: number;
  /** Autosave observes local actions, never timer ticks or remote initialization. */
  revision: number;
  init: (state: NumsolisState) => void;
  newGame: (difficulty: NumsolisDifficulty, seed?: number) => Promise<void>;
  move: (move: NumsolisMove) => boolean;
  undo: () => boolean;
  restart: () => void;
  tick: () => void;
  advanceAnimation: () => void;
  finishAnimation: () => void;
  reset: () => void;
};

const status = (state: NumsolisState) => ({
  won: isNumsolisWon(state),
  lost: isNumsolisLost(state),
});

export const useNumsolisStore = create<NumsolisStore>((set, get) => {
  let generation = 0;
  return {
    state: null,
    won: false,
    lost: false,
    generating: false,
    generationError: false,
    animationFrames: [],
    animationIndex: 0,
    revision: 0,

    init: (state) => {
      generation++;
      set({ state, ...status(state), generating: false, generationError: false, animationFrames: [], animationIndex: 0 });
    },

    newGame: async (difficulty, seed) => {
      const request = ++generation;
      set({ generating: true, generationError: false, animationFrames: [], animationIndex: 0 });
      try {
        const nextSeed = seed ?? crypto.getRandomValues(new Uint32Array(1))[0];
        const generated = await generateNumsolis(difficulty, nextSeed);
        if (request !== generation) return;
        const state = { ...generated, id: crypto.randomUUID() };
        set((current) => ({
          state, ...status(state), generating: false, generationError: false,
          revision: current.revision + 1,
        }));
      } catch {
        if (request === generation) set({ generating: false, generationError: true });
      }
    },

    move: (move) => {
      const { state, won, lost, generating, revision } = get();
      if (!state || won || lost || generating) return false;
      const next = applyMove(state, move);
      if (!next) return false;
      set({
        state: next, ...status(next), revision: revision + 1,
        animationFrames: [], animationIndex: 0,
      });
      return true;
    },

    undo: () => {
      const { state, generating, revision } = get();
      if (!state || generating) return false;
      const next = undoNumsolis(state);
      if (!next) return false;
      set({ state: next, ...status(next), revision: revision + 1, animationFrames: [], animationIndex: 0 });
      return true;
    },

    restart: () => {
      const { state, revision } = get();
      if (!state) return;
      generation++;
      const next = restartNumsolis(state, crypto.randomUUID());
      set({
        state: next, ...status(next), generating: false, generationError: false,
        revision: revision + 1, animationFrames: [], animationIndex: 0,
      });
    },

    tick: () => {
      const { state, won, lost, generating } = get();
      if (!state || state.moves === 0 || won || lost || generating || state.seconds >= Number.MAX_SAFE_INTEGER) return;
      set({ state: { ...state, seconds: state.seconds + 1 } });
    },

    advanceAnimation: () => {
      const { animationFrames, animationIndex } = get();
      if (!animationFrames.length) return;
      if (animationIndex + 1 >= animationFrames.length) {
        set({ animationFrames: [], animationIndex: 0 });
      } else {
        set({ animationIndex: animationIndex + 1 });
      }
    },

    finishAnimation: () => set({ animationFrames: [], animationIndex: 0 }),

    reset: () => {
      generation++;
      set({ state: null, won: false, lost: false, generating: false, generationError: false, animationFrames: [], animationIndex: 0 });
    },
  };
});

export const selectNumsolisProgress = (state: NumsolisState | null) =>
  state ? numsolisProgress(state) : 0;
