import { describe, it, expect } from "vitest";
import {
  newNumsolis,
  canMove,
  moveCard,
  serializeNumsolis,
  deserializeNumsolis,
  type NumsolisState,
  type Card,
} from "@/lib/games/numsolis";

function stateOf(columns: Card[][], extra: Partial<NumsolisState> = {}): NumsolisState {
  return {
    columns,
    nextId: 100,
    score: 0,
    moves: 0,
    seconds: 0,
    over: false,
    won: false,
    best: 0,
    ...extra,
  };
}

describe("numsolis engine", () => {
  describe("newNumsolis", () => {
    it("creates 6 columns with solvable cards", () => {
      const state = newNumsolis();
      expect(state.columns).toHaveLength(6);
      const totalCards = state.columns.reduce((acc, col) => acc + col.length, 0);
      expect(totalCards).toBeGreaterThan(0);
    });
  });

  describe("canMove & moveCard rules", () => {
    it("allows moving card to empty column", () => {
      const state = stateOf([
        [{ id: 1, value: 2, color: 0 }],
        [],
      ]);
      expect(canMove(state, 0, 1)).toBe(true);
      const res = moveCard(state, 0, 1);
      expect(res.outcome).toBe("moved");
      expect(res.state.columns[0]).toHaveLength(0);
      expect(res.state.columns[1]).toHaveLength(1);
    });

    it("merges cards with same value AND same color", () => {
      const state = stateOf([
        [{ id: 1, value: 4, color: 1 }],
        [{ id: 2, value: 4, color: 1 }],
      ]);
      expect(canMove(state, 0, 1)).toBe(true);
      const res = moveCard(state, 0, 1);
      expect(res.outcome).toBe("merged");
      expect(res.state.columns[1]).toHaveLength(1);
      expect(res.state.columns[1][0].value).toBe(8);
    });

    it("does not merge cards with same value but different color", () => {
      const state = stateOf([
        [{ id: 1, value: 4, color: 0 }],
        [{ id: 2, value: 4, color: 1 }],
      ]);
      expect(canMove(state, 0, 1)).toBe(false);
    });

    it("allows moving card onto higher value card regardless of color", () => {
      const state = stateOf([
        [{ id: 1, value: 2, color: 0 }],
        [{ id: 2, value: 8, color: 1 }],
      ]);
      expect(canMove(state, 0, 1)).toBe(true);
      const res = moveCard(state, 0, 1);
      expect(res.state.columns[1]).toHaveLength(2);
    });

    it("prevents moving card onto lower value card", () => {
      const state = stateOf([
        [{ id: 1, value: 8, color: 0 }],
        [{ id: 2, value: 2, color: 1 }],
      ]);
      expect(canMove(state, 0, 1)).toBe(false);
    });

    it("prevents stack exceeding 9 cards", () => {
      const bigCol: Card[] = Array.from({ length: 9 }, (_, i) => ({
        id: i + 1,
        value: 1024,
        color: 0,
      }));
      const state = stateOf([
        [{ id: 10, value: 2, color: 1 }],
        bigCol,
      ]);
      expect(canMove(state, 0, 1)).toBe(false);
    });
  });

  describe("serialization", () => {
    it("round-trips state correctly", () => {
      const state = newNumsolis();
      const raw = serializeNumsolis(state);
      const restored = deserializeNumsolis(raw);
      expect(restored).not.toBeNull();
      expect(restored?.columns).toHaveLength(6);
    });

    it("rejects invalid json", () => {
      expect(deserializeNumsolis("invalid")).toBeNull();
    });
  });
});
