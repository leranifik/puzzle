import { describe, it, expect, beforeEach } from "vitest";
import { useFifteenStore } from "@/stores/fifteen-store";
import { useSudokuStore } from "@/stores/sudoku-store";
import { use2048Store } from "@/stores/g2048-store";
import { useMemoryStore } from "@/stores/memory-store";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { newSudoku } from "@/lib/games/sudoku";
import type { FifteenState } from "@/lib/games/fifteen";
import type { NumsolisState, Column } from "@/lib/games/numsolis";

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

describe("numsolis store", () => {
  beforeEach(() => useNumsolisStore.getState().reset());

  const nsState = (cols: Column[]): NumsolisState => {
    const columns = Array.from({ length: 6 }, (_, i) => cols[i] ?? []);
    const initialCount = columns.reduce((s, c) => s + c.length, 0);
    return { columns, nextId: 100, moves: 0, seconds: 0, initialCount };
  };

  it("newGame builds a solvable board with six columns", () => {
    useNumsolisStore.getState().newGame("easy");
    const s = useNumsolisStore.getState().state!;
    expect(s.columns).toHaveLength(6);
    expect(s.moves).toBe(0);
    expect(useNumsolisStore.getState().won).toBe(false);
  });

  it("tap selects, then moves the free card onto a higher stack", () => {
    const store = useNumsolisStore.getState;
    store().init(nsState([[{ id: 1, v: 4, c: 0 }], [{ id: 2, v: 8, c: 1 }]]));
    expect(store().tap(0)).toBe("select");
    expect(store().selected).toBe(0);
    expect(store().tap(1)).toBe("move");
    expect(store().selected).toBeNull();
    expect(store().state!.columns[0]).toHaveLength(0);
    expect(store().state!.columns[1]).toHaveLength(2);
  });

  it("tapping the selected column again deselects", () => {
    const store = useNumsolisStore.getState;
    store().init(nsState([[{ id: 1, v: 4, c: 0 }]]));
    expect(store().tap(0)).toBe("select");
    expect(store().tap(0)).toBe("deselect");
    expect(store().selected).toBeNull();
  });

  it("an illegal target retargets selection instead of moving", () => {
    const store = useNumsolisStore.getState;
    // 8 cannot go onto 4 (lower, different color) — selection jumps to col 1
    store().init(nsState([[{ id: 1, v: 8, c: 0 }], [{ id: 2, v: 4, c: 1 }]]));
    store().tap(0);
    expect(store().tap(1)).toBe("select");
    expect(store().selected).toBe(1);
  });

  it("merging equal same-color cards clears and can win", () => {
    const store = useNumsolisStore.getState;
    store().init(nsState([[{ id: 1, v: 1024, c: 2 }], [{ id: 2, v: 1024, c: 2 }]]));
    store().tap(0);
    expect(store().tap(1)).toBe("move");
    expect(store().won).toBe(true);
  });

  it("tick advances seconds only while playing", () => {
    useNumsolisStore.getState().newGame("easy");
    useNumsolisStore.getState().tick();
    expect(useNumsolisStore.getState().state!.seconds).toBe(1);
  });
});
