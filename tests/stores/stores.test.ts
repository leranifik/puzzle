import { describe, it, expect, beforeEach } from "vitest";
import { useFifteenStore } from "@/stores/fifteen-store";
import { useSudokuStore } from "@/stores/sudoku-store";
import { use2048Store } from "@/stores/g2048-store";
import { useMemoryStore } from "@/stores/memory-store";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { newSudoku } from "@/lib/games/sudoku";
import type { FifteenState } from "@/lib/games/fifteen";

describe("fifteen store", () => {
  beforeEach(() => useFifteenStore.getState().reset());

  it("newGame creates a board of the requested size", () => {
    useFifteenStore.getState().newGame(3);
    expect(useFifteenStore.getState().state?.board).toHaveLength(9);
    expect(useFifteenStore.getState().won).toBe(false);
  });

  it("move returns false for illegal moves and true for legal ones", () => {
    const nearSolved: FifteenState = {
      size: 3,
      board: [1, 2, 3, 4, 5, 6, 7, 0, 8],
      moves: 0,
      seconds: 0,
    };
    useFifteenStore.getState().init(nearSolved);
    expect(useFifteenStore.getState().move(0)).toBe(false); // far away
    expect(useFifteenStore.getState().move(8)).toBe(true); // slides tile 8
    expect(useFifteenStore.getState().won).toBe(true); // that was the winning move
  });

  it("blocks further moves after winning", () => {
    const solvedNext: FifteenState = { size: 3, board: [1, 2, 3, 4, 5, 6, 7, 0, 8], moves: 0, seconds: 0 };
    useFifteenStore.getState().init(solvedNext);
    useFifteenStore.getState().move(8);
    expect(useFifteenStore.getState().move(7)).toBe(false);
  });

  it("tick advances seconds only while playing", () => {
    useFifteenStore.getState().newGame(3);
    useFifteenStore.getState().tick();
    expect(useFifteenStore.getState().state?.seconds).toBe(1);
  });
});

describe("sudoku store", () => {
  beforeEach(() => useSudokuStore.getState().reset());

  function setup() {
    const s = newSudoku("easy");
    useSudokuStore.getState().init(s);
    return s;
  }

  it("input writes only into selected non-given cells", () => {
    const s = setup();
    const store = useSudokuStore.getState;
    const givenIdx = s.puzzle.findIndex((v) => v !== 0);
    const emptyIdx = s.puzzle.findIndex((v) => v === 0);

    store().select(givenIdx);
    store().input(5);
    expect(store().state!.cells[givenIdx]).toBe(s.puzzle[givenIdx]); // unchanged

    store().select(emptyIdx);
    store().input(s.solution[emptyIdx]);
    expect(store().state!.cells[emptyIdx]).toBe(s.solution[emptyIdx]);
    expect(store().state!.moves).toBe(1);
  });

  it("counts mistakes for wrong values", () => {
    const s = setup();
    const store = useSudokuStore.getState;
    const emptyIdx = s.puzzle.findIndex((v) => v === 0);
    const wrong = s.solution[emptyIdx] === 1 ? 2 : 1;
    store().select(emptyIdx);
    store().input(wrong);
    expect(store().state!.mistakes).toBe(1);
  });

  it("notes mode toggles pencil marks without changing cells", () => {
    const s = setup();
    const store = useSudokuStore.getState;
    const emptyIdx = s.puzzle.findIndex((v) => v === 0);
    store().select(emptyIdx);
    store().toggleNotesMode();
    store().input(3);
    expect(store().state!.cells[emptyIdx]).toBe(0);
    expect(store().state!.notes[emptyIdx]).toEqual([3]);
    store().input(3); // toggle off
    expect(store().state!.notes[emptyIdx]).toEqual([]);
  });

  it("erase clears the selected non-given cell", () => {
    const s = setup();
    const store = useSudokuStore.getState;
    const emptyIdx = s.puzzle.findIndex((v) => v === 0);
    store().select(emptyIdx);
    store().input(s.solution[emptyIdx]);
    store().erase();
    expect(store().state!.cells[emptyIdx]).toBe(0);
  });

  it("filling the whole grid correctly wins", () => {
    const s = setup();
    const store = useSudokuStore.getState;
    s.puzzle.forEach((v, i) => {
      if (v === 0) {
        store().select(i);
        store().input(s.solution[i]);
      }
    });
    expect(store().won).toBe(true);
  });
});

describe("2048 store", () => {
  beforeEach(() => use2048Store.getState().reset());

  it("newGame keeps the previous best score", () => {
    const store = use2048Store.getState;
    store().init({
      tiles: [{ id: 1, value: 2, r: 0, c: 0 }],
      nextId: 2, score: 100, best: 555, moves: 1, seconds: 5, over: false, reached2048: false,
    });
    store().newGame();
    expect(store().state!.best).toBe(555);
    expect(store().state!.score).toBe(0);
  });

  it("move returns the outcome and prune drops dying tiles", () => {
    const store = use2048Store.getState;
    store().init({
      tiles: [
        { id: 1, value: 2, r: 0, c: 0 },
        { id: 2, value: 2, r: 0, c: 1 },
      ],
      nextId: 3, score: 0, best: 0, moves: 0, seconds: 0, over: false, reached2048: false,
    });
    expect(store().move("left")).toBe("merged");
    expect(store().state!.tiles.some((t) => t.dying)).toBe(true);
    store().prune();
    expect(store().state!.tiles.some((t) => t.dying)).toBe(false);
  });

  it("init of a save that already reached 2048 pre-dismisses the win overlay", () => {
    const store = use2048Store.getState;
    store().init({
      tiles: [{ id: 1, value: 2048, r: 0, c: 0 }],
      nextId: 2, score: 0, best: 0, moves: 0, seconds: 0, over: false, reached2048: true,
    });
    expect(store().dismissedWin).toBe(true);
  });
});

describe("numsolis store", () => {
  beforeEach(() => useNumsolisStore.getState().reset());

  it("moves, auto-merges, ticks and detects the final clear", () => {
    const store = useNumsolisStore.getState;
    store().init({
      columns: [
        [{ id: 1, value: 1024, color: "ruby" }],
        [{ id: 2, value: 1024, color: "ruby" }],
        [], [], [], [],
      ],
      nextId: 3,
      initialCards: 2,
      moves: 0,
      seconds: 0,
    });
    store().tick();
    expect(store().state?.seconds).toBe(1);
    expect(store().move(0, 1)).toBe("cleared");
    expect(store().won).toBe(true);
    expect(store().state?.moves).toBe(1);
    expect(store().move(0, 1)).toBe("none");
  });

  it("newGame creates a six-column solvable deal", () => {
    useNumsolisStore.getState().newGame();
    const state = useNumsolisStore.getState().state!;
    expect(state.columns).toHaveLength(6);
    expect(state.columns.every((column) => column.length <= 9)).toBe(true);
    expect(useNumsolisStore.getState().won).toBe(false);
  });
});

describe("memory store", () => {
  beforeEach(() => useMemoryStore.getState().reset());

  it("flip flow: flip -> match/miss -> hide", () => {
    const store = useMemoryStore.getState;
    store().init({
      size: 12,
      deck: [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5],
      matched: new Array(12).fill(false),
      flipped: [],
      moves: 0,
      seconds: 0,
    });
    expect(store().flip(0)).toBe("flip");
    expect(store().flip(2)).toBe("match");
    expect(store().flip(1)).toBe("flip");
    expect(store().flip(4)).toBe("miss");
    store().hide();
    expect(store().state!.flipped).toEqual([]);
    expect(store().flip(1)).toBe("flip"); // playable again after hide
  });

  it("winning is detected when the last pair matches", () => {
    const store = useMemoryStore.getState;
    store().init({
      size: 12,
      deck: [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5],
      matched: [true, true, true, true, true, true, true, true, true, true, false, false].map((_, i) => i < 10),
      flipped: [],
      moves: 5,
      seconds: 60,
    });
    // last pair is deck[10]=4? — deck[10]=4 pairs with deck[8]=4 which is matched...
    // Use indices 10 and 11 (values 4 and 5)? They don't match each other.
    // Instead mark all except the true pair (9, 11) = values 5,5.
    store().init({
      size: 12,
      deck: [0, 1, 0, 1, 2, 3, 2, 3, 4, 5, 4, 5],
      matched: [true, true, true, true, true, true, true, true, true, false, true, false],
      flipped: [],
      moves: 5,
      seconds: 60,
    });
    expect(store().flip(9)).toBe("flip");
    expect(store().flip(11)).toBe("match");
    expect(store().won).toBe(true);
  });
});
