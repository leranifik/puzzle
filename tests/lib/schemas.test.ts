import { describe, it, expect } from "vitest";
import {
  gameIdSchema,
  saveGameSchema,
  resultSchema,
  registerSchema,
  loginSchema,
} from "@/lib/schemas";

describe("zod schemas", () => {
  it("gameIdSchema accepts known games only", () => {
    for (const id of ["fifteen", "sudoku", "g2048", "memory", "numsolis"]) {
      expect(gameIdSchema.safeParse(id).success).toBe(true);
    }
    expect(gameIdSchema.safeParse("chess").success).toBe(false);
    expect(gameIdSchema.safeParse("").success).toBe(false);
  });

  it("saveGameSchema bounds state size and progress range", () => {
    expect(saveGameSchema.safeParse({ state: "{}", progress: 0.5 }).success).toBe(true);
    expect(saveGameSchema.safeParse({ state: "{}", progress: 1.5 }).success).toBe(false);
    expect(saveGameSchema.safeParse({ state: "{}", progress: -0.1 }).success).toBe(false);
    expect(saveGameSchema.safeParse({ state: "x", progress: 0 }).success).toBe(false); // too short
    expect(saveGameSchema.safeParse({ state: "x".repeat(50_001), progress: 0 }).success).toBe(false);
  });

  it("resultSchema requires non-negative integers and defaults meta", () => {
    const ok = resultSchema.parse({ game: "sudoku", moves: 10, seconds: 60 });
    expect(ok.meta).toEqual({});
    expect(resultSchema.safeParse({ game: "sudoku", moves: -1, seconds: 0 }).success).toBe(false);
    expect(resultSchema.safeParse({ game: "sudoku", moves: 1.5, seconds: 0 }).success).toBe(false);
  });

  it("registerSchema validates email and password length", () => {
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.co", password: "123456" }).success,
    ).toBe(true);
    expect(
      registerSchema.safeParse({ name: "A", email: "not-email", password: "123456" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.co", password: "12345" }).success,
    ).toBe(false);
    expect(
      registerSchema.safeParse({ name: "", email: "a@b.co", password: "123456" }).success,
    ).toBe(false);
  });

  it("loginSchema requires an email and non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.co", password: "" }).success).toBe(false);
  });
});
