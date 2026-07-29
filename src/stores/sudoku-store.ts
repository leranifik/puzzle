"use client";

import { create } from "zustand";
import {
  type SudokuState,
  type SudokuDifficulty,
  newSudoku,
  isGiven,
  isComplete,
  conflicts,
} from "@/lib/games/sudoku";

type SudokuStore = {
  state: SudokuState | null;
  won: boolean;
  selected: number | null;
  notesMode: boolean;
  conflictCells: number[];
  init: (state: SudokuState) => void;
  newGame: (difficulty: SudokuDifficulty) => void;
  select: (index: number | null) => void;
  input: (value: number) => void;
  erase: () => void;
  toggleNotesMode: () => void;
  tick: () => void;
  reset: () => void;
};

export const useSudokuStore = create<SudokuStore>((set, get) => ({
  state: null,
  won: false,
  selected: null,
  notesMode: false,
  conflictCells: [],

  init: (state) => set({ state, won: isComplete(state), selected: null, conflictCells: [] }),

  newGame: (difficulty) =>
    set({ state: newSudoku(difficulty), won: false, selected: null, conflictCells: [], notesMode: false }),

  select: (index) => set({ selected: index, conflictCells: [] }),

  input: (value) => {
    const { state, selected, won, notesMode } = get();
    if (!state || won || selected === null || isGiven(state, selected)) return;

    if (notesMode) {
      const notes = state.notes.map((n, i) => {
        if (i !== selected) return n;
        return n.includes(value) ? n.filter((v) => v !== value) : [...n, value].sort();
      });
      set({ state: { ...state, notes } });
      return;
    }

    const clash = conflicts(state.cells, selected, value);
    const cells = [...state.cells];
    cells[selected] = value;

    const isMistake = value !== state.solution[selected];
    const next: SudokuState = {
      ...state,
      cells,
      moves: state.moves + 1,
      mistakes: state.mistakes + (isMistake ? 1 : 0),
      notes: state.notes.map((n, i) => (i === selected ? [] : n)),
    };
    set({
      state: next,
      won: isComplete(next),
      conflictCells: clash,
    });
  },

  erase: () => {
    const { state, selected, won } = get();
    if (!state || won || selected === null || isGiven(state, selected)) return;
    const cells = [...state.cells];
    cells[selected] = 0;
    set({
      state: { ...state, cells, notes: state.notes.map((n, i) => (i === selected ? [] : n)) },
      conflictCells: [],
    });
  },

  toggleNotesMode: () => set((s) => ({ notesMode: !s.notesMode })),

  tick: () => {
    const { state, won } = get();
    if (!state || won) return;
    set({ state: { ...state, seconds: state.seconds + 1 } });
  },

  reset: () => set({ state: null, won: false, selected: null, conflictCells: [], notesMode: false }),
}));
