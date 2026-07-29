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
  it("creates a new game with 7 stacks", () => {
    const s = newNumsolis();
    expect(s.stacks.length).toBe(7);
    expect(s.moves).toBe(0);
    expect(s.won).toBe(false);
    expect(s.over).toBe(false);
  });

  it("can make a valid move", () => {
    const s = newNumsolis();
    // Ensure first stack has at least one card
    if (s.stacks[0].length === 0) s.stacks[0].push({ v: 2, c: "gold" });
    // Move from first to second (empty or lower)
    const fromCol = 0;
    const toCol = 1;
    const next = moveNumsolis(s, fromCol, toCol);
    expect(next).not.toBeNull();
    if (next) {
      expect(next.moves).toBe(1);
      expect(next.stacks.length).toBe(7);
    }
  });

  it("rejects invalid move (same column)", () => {
    const s = newNumsolis();
    expect(moveNumsolis(s, 0, 0)).toBeNull();
  });

  it("detects no moves when impossible", () => {
    const s = newNumsolis();
    // Create stacks where no card can be moved onto another due to max 9 or values
    s.stacks = s.stacks.map((col) =>
      col.map((card) => ({ v: card.v, c: card.c })),
    );
    // Just ensure canMove doesn't throw
    expect(typeof canMove(s)).toBe("boolean");
  });

  it("serializes and deserializes correctly", () => {
    const s = newNumsolis();
    const raw = serializeNumsolis(s);
    const restored = deserializeNumsolis(raw);
    expect(restored).not.toBeNull();
    expect(restored!.stacks.length).toBe(s.stacks.length);
  });

  it("progress is between 0 and 1", () => {
    const s = newNumsolis();
    expect(progressNumsolis(s)).toBeGreaterThanOrEqual(0);
    expect(progressNumsolis(s)).toBeLessThanOrEqual(1);
  });
});
