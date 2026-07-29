import { describe, it, expect } from "vitest";
import {
  encodeSession,
  decodeSession,
  hashPassword,
  verifyPassword,
} from "@/lib/session";

describe("session tokens", () => {
  it("encodes and decodes a player id", () => {
    const token = encodeSession("player-123");
    expect(decodeSession(token)).toBe("player-123");
  });

  it("survives ids containing dots", () => {
    const token = encodeSession("a.b.c");
    expect(decodeSession(token)).toBe("a.b.c");
  });

  it("rejects tampered ids and signatures", () => {
    const token = encodeSession("player-123");
    const [id, sig] = [token.slice(0, token.lastIndexOf(".")), token.slice(token.lastIndexOf(".") + 1)];
    expect(decodeSession(`other-player.${sig}`)).toBeNull();
    expect(decodeSession(`${id}.AAAA${sig.slice(4)}`)).toBeNull();
  });

  it("rejects malformed tokens", () => {
    expect(decodeSession(undefined)).toBeNull();
    expect(decodeSession("")).toBeNull();
    expect(decodeSession("no-dot-here")).toBeNull();
  });
});

describe("password hashing", () => {
  it("verifies the correct password and rejects a wrong one", () => {
    const stored = hashPassword("s3cret-пароль");
    expect(verifyPassword("s3cret-пароль", stored)).toBe(true);
    expect(verifyPassword("wrong", stored)).toBe(false);
  });

  it("uses a unique salt per hash", () => {
    expect(hashPassword("same")).not.toBe(hashPassword("same"));
  });

  it("handles corrupted stored values gracefully", () => {
    expect(verifyPassword("x", "not-a-valid-format")).toBe(false);
    expect(verifyPassword("x", ":")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});
