import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateNumsolis } from "@/lib/games/numsolis-generation-client";
import { createNumsolisState, serializeNumsolis } from "@/lib/games/numsolis";

let worker: {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: (event: { preventDefault: () => void }) => void;
  onmessageerror?: () => void;
};

beforeEach(() => {
  vi.useFakeTimers();
  worker = { postMessage: vi.fn(), terminate: vi.fn() };
  vi.stubGlobal("Worker", vi.fn(function () { return worker; }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const validState = () => createNumsolisState(
  [512, 512, 256, 256, 256, 256].map((value, id) => [{ id, value, suit: 0 }]),
  "easy", 123,
);

describe("Numsolis generation worker lifecycle", () => {
  it("accepts the requested state and releases its worker and deadline", async () => {
    const pending = generateNumsolis("easy", 123);
    expect(worker.postMessage).toHaveBeenCalledWith({ difficulty: "easy", seed: 123 });
    worker.onmessage!({ data: serializeNumsolis(validState()) });
    await expect(pending).resolves.toEqual(validState());
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([null, "malformed", serializeNumsolis({ ...validState(), seed: 124 })])(
    "rejects invalid or unrelated responses and releases its worker: %s", async (data) => {
      const pending = generateNumsolis("easy", 123);
      const rejected = expect(pending).rejects.toThrow("Invalid Numsolis worker response");
      worker.onmessage!({ data });
      await rejected;
      expect(worker.terminate).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("cleans up when dispatch itself throws", async () => {
    worker.postMessage.mockImplementation(() => { throw new Error("dispatch failed"); });
    await expect(generateNumsolis("easy", 123)).rejects.toThrow("dispatch failed");
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports a deadline as a timeout, without claiming the deal is unsolvable", async () => {
    const pending = generateNumsolis("easy", 123);
    const rejected = expect(pending).rejects.toThrow("Numsolis generation timed out");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up after worker errors", async () => {
    const pending = generateNumsolis("easy", 123);
    const rejected = expect(pending).rejects.toThrow("Numsolis generation failed");
    const preventDefault = vi.fn();
    worker.onerror!({ preventDefault });
    await rejected;
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cleans up after unreadable messages", async () => {
    const pending = generateNumsolis("easy", 123);
    const rejected = expect(pending).rejects.toThrow("Invalid Numsolis worker message");
    worker.onmessageerror!();
    await rejected;
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects unsupported worker construction without leaving a timer", async () => {
    vi.stubGlobal("Worker", vi.fn(function () { throw new Error("unsupported"); }));
    await expect(generateNumsolis("easy", 123)).rejects.toThrow("unsupported");
    expect(vi.getTimerCount()).toBe(0);
  });
});
