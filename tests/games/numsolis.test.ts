import { describe, it, expect } from "vitest";
import {
  newNumsolis,
  moveNumsolis,
  canMove,
  serializeNumsolis,
  deserializeNumsolis,
  progressNumsolis,
} from "@/lib/games/numsolis";

describe("numsolis engine", () => {
  it("creates a new 4x4 game", () => {
    const s = newNumsolis(4);
    expect(s.size).toBe(4);
    expect(s.board.length).toBe(16);
    expect(s.score).toBe(0);
    expect(s.won).toBe(false);
    expect(s.over).toBe(false);
  });

  it("can make a valid move", () => {
    const s = newNumsolis(4);
    // Force a simple board for deterministic test
    s.board = new Array(16).fill(1);
    const next = moveNumsolis(s, 0);
    expect(next).not.toBeNull();
    expect(next!.moves).toBe(1);
    expect(next!.board.some((v) => v === 0)).toBe(true);
  });

  it("rejects click on empty cell", () => {
    const s = newNumsolis(4);
    s.board[0] = 0;
    expect(moveNumsolis(s, 0)).toBeNull();
  });

  it("detects no moves when board full and no pairs", () => {
    const s = newNumsolis(4);
    // Board full of different values with no adjacent pairs
    s.board = [
      1, 2, 3, 4,
      2, 3, 4, 1,
      3, 4, 1, 2,
      4, 1, 2, 3,
    ];
    expect(canMove(s)).toBe(false);
  });

  it("serializes and deserializes correctly", () => {
    const s = newNumsolis(4);
    const raw = serializeNumsolis(s);
    const restored = deserializeNumsolis(raw);
    expect(restored).not.toBeNull();
    expect(restored!.board).toEqual(s.board);
    expect(restored!.size).toBe(s.size);
  });

  it("progress increases with score", () => {
    const s = newNumsolis(4);
    s.score = 64;
    expect(progressNumsolis(s)).toBe(0.5);
  });
});
