import { describe, expect, it } from "vitest";
import {
  applyMove, applyNumsolisColumns, canMove, createNumsolisState, deserializeNumsolis,
  getLegalMoves, getNumsolisMoveFrames, isNumsolisLost, isNumsolisWon, numsolisProgress, restartNumsolis,
  serializeNumsolis, undoNumsolis, type NumsolisColumns,
} from "@/lib/games/numsolis";

function columns(values: number[][]): NumsolisColumns {
  let id = 0;
  return Array.from({ length: 6 }, (_, index) => (values[index] ?? []).map((value) => ({ id: id++, value: Math.abs(value), suit: value < 0 ? 1 : 0 })));
}
const state = (values: number[][]) => createNumsolisState(columns(values), "medium", 1);
const ranks = (board: NumsolisColumns) => board.map((column) => column.map((card) => card.value * (card.suit ? -1 : 1)));
const move = { from: 0, index: 0, to: 1 };
const valid = () => createNumsolisState(columns([[512], [512], [256], [256], [256], [256]]), "easy", 123);

describe("Numsolis rules", () => {
  it("creates an unchanged, independent deal without automatic merges", () => {
    const original = columns([[8, 8], [16]]);
    const game = createNumsolisState(original, "easy", 1);
    expect(game.columns).toEqual(original);
    expect(game.columns).not.toBe(original);
    expect(game.initialColumns).not.toBe(game.columns);
  });
  it("moves arbitrary mixed, unordered suffixes and preserves order", () => {
    const game = state([[1024, 8, -512, 2], [-16]]);
    const next = applyMove(game, { ...move, index: 1 })!;
    expect(ranks(next.columns).slice(0, 2)).toEqual([[1024], [-16, 8, -512, 2]]);
    expect(ranks(game.columns)[0]).toEqual([1024, 8, -512, 2]);
    expect(next.moves).toBe(1);
  });
  it("enforces boundary ranks and suits and rejects empty destinations", () => {
    expect(canMove(state([[8], [-16]]), move)).toBe(true);
    expect(canMove(state([[8], [-8]]), move)).toBe(false);
    expect(canMove(state([[16], [8]]), move)).toBe(false);
    expect(canMove(state([[8], []]), move)).toBe(false);
    expect(canMove(state([[8], [8]]), move)).toBe(true);
  });
  it.each([-1, 6, 0.5, NaN, Infinity])("rejects malformed indices %s", (bad) => {
    const game = state([[8], [8]]);
    expect(canMove(game, { ...move, from: bad })).toBe(false);
    expect(canMove(game, { ...move, to: bad })).toBe(false);
    expect(canMove(game, { ...move, index: bad })).toBe(false);
  });
  it("rejects self moves and out-of-range suffixes", () => {
    const game = state([[8], [8]]);
    expect(applyMove(game, { ...move, to: 0 })).toBeNull();
    expect(applyMove(game, { ...move, index: 1 })).toBeNull();
  });
  it("credits only the immediate merge against the nine-card cap", () => {
    const filler = [-2, -4, -2, -4, -2, -4, -2];
    expect(applyMove(state([[8], [...filler, 16, 8]]), move)?.columns[1]).toHaveLength(8);
    expect(applyMove(state([[8, 32], [...filler, 8]]), move)?.columns[1]).toHaveLength(9);
    const forbidden = state([[8, 16], [...filler, 16, 8]]);
    const before = serializeNumsolis(forbidden);
    expect(applyMove(forbidden, move)).toBeNull();
    expect(serializeNumsolis(forbidden)).toBe(before);
    expect(applyMove(state([[4, 32], [...filler, 8]]), move)).toBeNull();
  });
  it("chooses lower neighbour before upper and undoes the entire cascade", () => {
    const game = { ...state([[8, 16], [16, 8]]), seconds: 42 };
    const next = applyMove(game, move)!;
    expect(ranks(next.columns).slice(0, 2)).toEqual([[], [16, 32]]);
    expect(next.history).toHaveLength(1);
    expect(undoNumsolis(next)).toEqual(game);
  });
  it("continues upwards and reevaluates direction after every merge", () => {
    expect(ranks(applyMove(state([[8], [32, 16, 8]]), move)!.columns)[1]).toEqual([64]);
    expect(ranks(applyMove(state([[8, -16], [16, 8]]), move)!.columns)[1]).toEqual([32, -16]);
    expect(ranks(applyMove(state([[8, 16, 64], [32, 8]]), move)!.columns)[1]).toEqual([128]);
  });
  it("emits independent lower-priority cascade frames ending at the atomic result", () => {
    const source = columns([[8, 16], [16, 8]]);
    const before = structuredClone(source);
    const frames = getNumsolisMoveFrames(source, move);
    expect(frames.map((frame) => ranks(frame)[1])).toEqual([[16, 16, 16], [16, 32]]);
    expect(frames.at(-1)).toEqual(applyNumsolisColumns(source, move));
    frames[0][1][0].value = 1024;
    expect(source).toEqual(before);
    expect(ranks(frames[1])[1]).toEqual([16, 32]);
  });
  it("never emits overflow frames and emits nothing for invalid moves", () => {
    const source = columns([[8], [-2, -4, -2, -4, -2, -4, -2, 16, 8]]);
    const frames = getNumsolisMoveFrames(source, move);
    expect(frames).toHaveLength(2);
    expect(frames.every((frame) => frame.every((column) => column.length <= 9))).toBe(true);
    expect(getNumsolisMoveFrames(columns([[8], []]), move)).toEqual([]);
    const ordinary = columns([[4], [16]]);
    expect(getNumsolisMoveFrames(ordinary, move)).toEqual([applyNumsolisColumns(ordinary, move)]);
  });
  it("does not normalize unrelated adjacent cards on ordinary transfers", () => {
    expect(ranks(applyMove(state([[4, 8, 8], [16]]), move)!.columns)[1]).toEqual([16, 4, 8, 8]);
  });
  it("retains 2048 and waits for both suit goals", () => {
    const game = state([[1024], [1024], [-1024], [-1024]]);
    const first = applyMove(game, move)!;
    expect(first.columns[1][0].value).toBe(2048);
    expect(isNumsolisWon(first)).toBe(false);
    const won = applyMove(first, { from: 2, index: 0, to: 3 })!;
    expect(isNumsolisWon(won)).toBe(true);
    expect(isNumsolisLost(won)).toBe(false);
    expect(numsolisProgress(won)).toBe(1);
    expect(getLegalMoves(won)).toEqual([]);
    expect(won.columns.flat().map((card) => card.value)).toEqual([2048, 2048]);
  });
  it("declares loss only when no legal move remains", () => {
    expect(isNumsolisLost(state([[8], [-8]]))).toBe(true);
    expect(isNumsolisLost(state([[4], [-8]]))).toBe(false);
    const onlyGroup = state([[4, 1024], [8]]);
    expect(getLegalMoves(onlyGroup)).toContainEqual(move);
    expect(isNumsolisLost(onlyGroup)).toBe(false);
  });
  it("restarts the same deal and keeps elapsed time when undoing", () => {
    const game = valid();
    const next = { ...applyMove(game, move)!, seconds: 100 };
    expect(undoNumsolis(next)?.seconds).toBe(100);
    expect(restartNumsolis(next, "replay")).toEqual({ ...game, id: "replay" });
    expect(undoNumsolis(game)).toBeNull();
  });
});

describe("Numsolis saves and invariants", () => {
  it("round trips initial and played positions", () => {
    const game = valid();
    expect(deserializeNumsolis(serializeNumsolis(game))).toEqual(game);
    const next = applyMove(game, move)!;
    expect(deserializeNumsolis(serializeNumsolis(next))).toEqual(next);
    expect(numsolisProgress(next)).toBeGreaterThan(0);
  });
  it("round trips retained goals before and after the last suit is completed", () => {
    let game = state([[1024], [1024], [-512], [-512], [-512], [-512]]);
    game = applyMove(game, move)!;
    expect(isNumsolisWon(game)).toBe(false);
    expect(deserializeNumsolis(serializeNumsolis(game))).toEqual(game);
    game = applyMove(game, { from: 2, index: 0, to: 3 })!;
    game = applyMove(game, { from: 4, index: 0, to: 5 })!;
    game = applyMove(game, { from: 3, index: 0, to: 5 })!;
    expect(isNumsolisWon(game)).toBe(true);
    expect(deserializeNumsolis(serializeNumsolis(game))).toEqual(game);
  });
  it("rejects invalid structures, versions, totals, identities and history", () => {
    const game = valid();
    for (const patch of [
      { version: 2 }, { rulesVersion: 2 }, { generatorVersion: 2 }, { seed: -1 },
      { difficulty: "extreme" }, { moves: -1 }, { seconds: 0.5 }, { extra: true },
      { columns: columns([[2048]]) }, { initialColumns: columns([[2048]]) },
      { columns: columns([[512], [512], [256], [256], [256], [128]]) },
      { history: [{ columns: game.columns, moves: 0 }] },
      { columns: game.columns.map((column) => column.map((card) => ({ ...card, id: 0 }))) },
      { initialColumns: game.initialColumns.map((column) => column.map((card) => ({ ...card, id: 0 }))) },
      { columns: game.columns.map((column) => column.map((card) => ({ ...card, id: -1 }))) },
      { columns: game.columns.map((column) => column.map((card) => ({ ...card, id: card.id + 100 }))) },
      { columns: game.columns.map((column) => column.map((card) => ({ ...card, suit: 1 }))) },
      { columns: game.columns.map((column) => column.map((card) => ({ ...card, value: 3 }))) },
    ]) expect(deserializeNumsolis(JSON.stringify({ ...game, ...patch }))).toBeNull();
    for (const raw of ["", "null", "[]", "{", "x".repeat(50_001)]) expect(deserializeNumsolis(raw)).toBeNull();
  });
  it("rejects inconsistent snapshots and counters without changing the payload", () => {
    const initial = valid();
    const played = applyMove(initial, move)!;
    for (const patch of [
      { moves: 0 },
      { moves: 3 },
      { history: [{ columns: columns([[2048]]), moves: 0 }] },
      { history: Array.from({ length: 13 }, () => played.history[0]) },
      { history: [{ ...played.history[0], moves: 1 }] },
    ]) {
      const raw = JSON.stringify({ ...played, ...patch });
      expect(deserializeNumsolis(raw)).toBeNull();
    }
  });
  it("preserves mass, identifiers, bounds, immutability and saves through seeded random play", () => {
    let random = 123456;
    const nextRandom = () => (random = (Math.imul(random, 1664525) + 1013904223) >>> 0);
    for (let run = 0; run < 100; run++) {
      let game = run % 2 === 0 ? valid() : state([
        [512, 256, 256], [512], [256, 128, 64, 32, 16, 8, 4, 2, 2],
        [-512, -256, -256], [-512], [-256, -128, -64, -32, -16, -8, -4, -2, -2],
      ]);
      for (let step = 0; step < 100; step++) {
        const options = getLegalMoves(game);
        if (!options.length) break;
        const choice = options[nextRandom() % options.length];
        const before = serializeNumsolis(game);
        const next = applyMove(game, choice)!;
        expect(serializeNumsolis(game)).toBe(before);
        expect(applyNumsolisColumns(game.columns, choice)).toEqual(next.columns);
        const cards = next.columns.flat();
        for (const suit of [0, 1]) {
          expect(cards.filter((card) => card.suit === suit).reduce((sum, card) => sum + card.value, 0))
            .toBe(suit === 1 && game.difficulty === "easy" ? 0 : 2048);
        }
        expect(new Set(cards.map((card) => card.id)).size).toBe(cards.length);
        expect(next.columns.every((column) => column.length <= 9)).toBe(true);
        expect(serializeNumsolis(next).length).toBeLessThan(50_000);
        expect(deserializeNumsolis(serializeNumsolis(next))).toEqual(next);
        expect(undoNumsolis(next)?.columns).toEqual(game.columns);
        game = next;
      }
    }
  });
  it("bounds history even when legal moves cycle without merging", () => {
    let game = createNumsolisState(columns([[512, 2], [512], [512], [256], [128], [64, 32, 16, 8, 4, 2]]), "easy", 1);
    for (let i = 0; i < 50; i++) {
      game = applyMove(game, { from: i % 2, index: 1, to: 1 - i % 2 })!;
    }
    expect(game.history).toHaveLength(12);
    expect(deserializeNumsolis(serializeNumsolis(game))).toEqual(game);
  });
  it("rejects arbitrary malformed JSON values without throwing", () => {
    let value: unknown = null;
    for (let i = 0; i < 200; i++) {
      value = i % 3 === 0 ? { columns: value, moves: i } : [value, i];
      const raw = JSON.stringify(value);
      expect(() => deserializeNumsolis(raw)).not.toThrow();
      expect(deserializeNumsolis(raw)).toBeNull();
    }
  });
});
