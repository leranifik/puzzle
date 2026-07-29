import { describe, it, expect } from "vitest";
import {
  new2048,
  move2048,
  pruneDying,
  boardOf,
  canMove,
  progress2048,
  serialize2048,
  deserialize2048,
  type G2048State,
  type Tile,
} from "@/lib/games/g2048";

function stateOf(tiles: Tile[], extra: Partial<G2048State> = {}): G2048State {
  return {
    tiles,
    nextId: Math.max(0, ...tiles.map((t) => t.id)) + 1,
    score: 0,
    best: 0,
    moves: 0,
    seconds: 0,
    over: false,
    reached2048: false,
    ...extra,
  };
}

describe("2048 engine", () => {
  describe("new2048", () => {
    it("starts with two tiles of value 2 or 4", () => {
      const s = new2048();
      expect(s.tiles).toHaveLength(2);
      for (const t of s.tiles) expect([2, 4]).toContain(t.value);
      expect(s.over).toBe(false);
    });

    it("carries over the best score", () => {
      expect(new2048(512).best).toBe(512);
    });
  });

  describe("move2048 — sliding & merging", () => {
    it("merges equal neighbours once per move: [2,2,4,4] -> [4,8]", () => {
      const s = stateOf([
        { id: 1, value: 2, r: 0, c: 0 },
        { id: 2, value: 2, r: 0, c: 1 },
        { id: 3, value: 4, r: 0, c: 2 },
        { id: 4, value: 4, r: 0, c: 3 },
      ]);
      const { state: next, outcome } = move2048(s, "left");
      expect(outcome).toBe("merged");
      const live = next.tiles.filter((t) => !t.dying && [1, 3].includes(t.id));
      expect(live.map((t) => ({ v: t.value, c: t.c }))).toEqual([
        { v: 4, c: 0 },
        { v: 8, c: 1 },
      ]);
      expect(next.score).toBe(12); // 4 + 8
      expect(next.moves).toBe(1);
    });

    it("does not chain-merge: [4,2,2] -> [4,4], not [8]", () => {
      const s = stateOf([
        { id: 1, value: 4, r: 0, c: 0 },
        { id: 2, value: 2, r: 0, c: 1 },
        { id: 3, value: 2, r: 0, c: 2 },
      ]);
      const { state: next } = move2048(s, "left");
      const live = next.tiles.filter((t) => !t.dying && t.r === 0 && [1, 2].includes(t.id));
      expect(live.find((t) => t.id === 1)!.value).toBe(4);
      expect(live.find((t) => t.id === 2)!.value).toBe(4);
    });

    it("keeps stable tile ids so the UI can animate movement", () => {
      const s = stateOf([{ id: 7, value: 2, r: 0, c: 3 }]);
      const { state: next } = move2048(s, "left");
      const moved = next.tiles.find((t) => t.id === 7)!;
      expect(moved.c).toBe(0);
      expect(moved.r).toBe(0);
    });

    it("marks the absorbed tile as dying at the merge target", () => {
      const s = stateOf([
        { id: 1, value: 2, r: 0, c: 0 },
        { id: 2, value: 2, r: 0, c: 3 },
      ]);
      const { state: next } = move2048(s, "left");
      const dying = next.tiles.find((t) => t.dying)!;
      expect(dying.id).toBe(2);
      expect(dying.c).toBe(0); // slid to the survivor's cell
      expect(pruneDying(next).tiles.some((t) => t.dying)).toBe(false);
    });

    it("returns outcome 'none' and same state when nothing can move", () => {
      const s = stateOf([{ id: 1, value: 2, r: 0, c: 0 }]);
      const { state: next, outcome } = move2048(s, "left");
      expect(outcome).toBe("none");
      expect(next).toBe(s); // exact same reference
    });

    it("spawns exactly one new tile after a successful move", () => {
      const s = stateOf([{ id: 1, value: 2, r: 0, c: 3 }]);
      const { state: next } = move2048(s, "left");
      const live = next.tiles.filter((t) => !t.dying);
      expect(live).toHaveLength(2);
    });

    it.each(["up", "down", "left", "right"] as const)("slides toward %s edge", (dir) => {
      const s = stateOf([{ id: 1, value: 2, r: 1, c: 1 }]);
      const { state: next } = move2048(s, dir);
      const t = next.tiles.find((x) => x.id === 1)!;
      if (dir === "up") expect(t.r).toBe(0);
      if (dir === "down") expect(t.r).toBe(3);
      if (dir === "left") expect(t.c).toBe(0);
      if (dir === "right") expect(t.c).toBe(3);
    });

    it("flags reached2048 when the tile appears", () => {
      const s = stateOf([
        { id: 1, value: 1024, r: 0, c: 0 },
        { id: 2, value: 1024, r: 0, c: 1 },
      ]);
      const { state: next } = move2048(s, "left");
      expect(next.reached2048).toBe(true);
    });
  });

  describe("canMove / game over", () => {
    it("full board with no equal neighbours is dead", () => {
      // checkerboard of distinct powers
      const board = [
        2, 4, 2, 4,
        4, 2, 4, 2,
        2, 4, 2, 4,
        4, 2, 4, 2,
      ];
      expect(canMove(board)).toBe(false);
    });

    it("full board with one mergeable pair is alive", () => {
      const board = [
        2, 4, 2, 4,
        4, 2, 4, 2,
        2, 4, 2, 4,
        4, 2, 4, 4, // mergeable pair at the end
      ];
      expect(canMove(board)).toBe(true);
    });
  });

  describe("invariants over a random playthrough", () => {
    it("never places two live tiles on one cell; values stay powers of two", () => {
      let s = new2048();
      const dirs = ["up", "down", "left", "right"] as const;
      for (let i = 0; i < 500 && !s.over; i++) {
        const r = move2048(s, dirs[i % 4]);
        if (r.outcome !== "none") s = pruneDying(r.state);
        const live = s.tiles.filter((t) => !t.dying);
        const cells = new Set(live.map((t) => `${t.r}:${t.c}`));
        expect(cells.size).toBe(live.length);
        for (const t of live) {
          expect(t.value & (t.value - 1)).toBe(0);
          expect(t.value).toBeGreaterThanOrEqual(2);
        }
      }
    });
  });

  describe("progress2048", () => {
    it("scales logarithmically toward 2048", () => {
      expect(progress2048(stateOf([{ id: 1, value: 2, r: 0, c: 0 }]))).toBeCloseTo(1 / 11);
      expect(progress2048(stateOf([{ id: 1, value: 2048, r: 0, c: 0 }]))).toBe(1);
      expect(progress2048(stateOf([{ id: 1, value: 4096, r: 0, c: 0 }]))).toBe(1); // clamped
    });
  });

  describe("serialize / deserialize", () => {
    it("round-trips and drops dying tiles", () => {
      const s = stateOf([
        { id: 1, value: 4, r: 0, c: 0 },
        { id: 2, value: 2, r: 0, c: 0, dying: true },
      ]);
      const restored = deserialize2048(serialize2048(s))!;
      expect(restored.tiles).toHaveLength(1);
      expect(restored.tiles[0].id).toBe(1);
    });

    it("converts the legacy flat-board format", () => {
      const legacy = JSON.stringify({
        board: [2, 0, 0, 4, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 2],
        score: 12,
        best: 40,
        moves: 3,
        seconds: 9,
      });
      const s = deserialize2048(legacy)!;
      expect(s.tiles).toHaveLength(4);
      expect(boardOf(s.tiles).filter((v) => v !== 0).sort((a, b) => a - b)).toEqual([2, 2, 4, 8]);
      expect(s.score).toBe(12);
      expect(s.best).toBe(40);
    });

    it("rejects malformed payloads", () => {
      expect(deserialize2048("junk")).toBeNull();
      expect(deserialize2048('{"score":1}')).toBeNull();
    });
  });
});
