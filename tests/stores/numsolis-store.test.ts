import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNumsolisState, type NumsolisState } from "@/lib/games/numsolis";
import { generateNumsolis } from "@/lib/games/numsolis-generation-client";
import { useNumsolisStore } from "@/stores/numsolis-store";

vi.mock("@/lib/games/numsolis-generation-client", () => ({ generateNumsolis: vi.fn() }));

const store = useNumsolisStore.getState;
const deal = (id = "test-deal") => createNumsolisState(
  [[{ id: 1, value: 512, suit: 0 }], [{ id: 2, value: 512, suit: 0 }],
    [{ id: 3, value: 1024, suit: 0 }], [], [], []], "easy", 7, id,
);
function deferred() {
  let resolve!: (state: NumsolisState) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<NumsolisState>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  store().reset();
  vi.mocked(generateNumsolis).mockReset();
});

describe("Numsolis store", () => {
  const cascadeDeal = () => createNumsolisState([
    [{ id: 1, value: 16, suit: 0 }, { id: 2, value: 8, suit: 0 }],
    [{ id: 3, value: 8, suit: 0 }, { id: 4, value: 16, suit: 0 }],
    [], [], [], [],
  ], "easy", 8);

  it("applies a complete cascade immediately, with no animation lock", () => {
    store().init(cascadeDeal());
    expect(store().move({ from: 1, index: 0, to: 0 })).toBe(true);
    expect(store().state!.columns[0].map((card) => card.value)).toEqual([16, 32]);
    expect(store().animationFrames).toEqual([]);
    expect(store().undo()).toBe(true);
    expect(store().state!.columns).toEqual(cascadeDeal().columns);
  });

  it("remote load clears frames without a local save revision", () => {
    store().init(cascadeDeal());
    store().move({ from: 1, index: 0, to: 0 });
    const revision = store().revision;
    store().init(deal());
    expect(store().animationFrames).toEqual([]);
    expect(store().revision).toBe(revision);
  });

  it("saves local moves and undo, but never remote init or ticks", () => {
    const revision = store().revision;
    store().init(deal());
    expect(store().revision).toBe(revision);
    store().tick();
    expect(store().state!.seconds).toBe(0);
    expect(store().move({ from: 0, index: 0, to: 0 })).toBe(false);
    expect(store().revision).toBe(revision);
    expect(store().move({ from: 0, index: 0, to: 1 })).toBe(true);
    expect(store().revision).toBe(revision + 1);
    store().tick();
    expect(store().state!.seconds).toBe(1);
    expect(store().revision).toBe(revision + 1);
    expect(store().undo()).toBe(true);
    expect(store().state!.columns).toEqual(deal().columns);
    expect(store().revision).toBe(revision + 2);
    expect(store().undo()).toBe(false);
  });

  it("detects victory, blocks play/timer, and allows undo", () => {
    store().init(deal());
    store().move({ from: 0, index: 0, to: 1 });
    store().move({ from: 1, index: 0, to: 2 });
    expect(store().won).toBe(true);
    expect(store().lost).toBe(false);
    expect(store().move({ from: 2, index: 0, to: 0 })).toBe(false);
    store().tick();
    expect(store().state!.seconds).toBe(0);
    expect(store().undo()).toBe(true);
    expect(store().won).toBe(false);
  });

  it("replays the initial deal with a new ID and reset counters", () => {
    store().init(deal());
    store().move({ from: 0, index: 0, to: 1 });
    store().tick();
    const revision = store().revision;
    store().restart();
    expect(store().state).toMatchObject({ columns: deal().columns, moves: 0, seconds: 0, history: [] });
    expect(store().state!.id).not.toBe("test-deal");
    expect(store().revision).toBe(revision + 1);
  });

  it("derives defeat on load and never ticks a blocked board", () => {
    const blocked = createNumsolisState([
      [{ id: 1, value: 1024, suit: 0 }, { id: 2, value: 1024, suit: 0 }],
      [{ id: 3, value: 1024, suit: 1 }, { id: 4, value: 1024, suit: 1 }],
      [], [], [], [],
    ], "hard", 1);
    blocked.moves = 4;
    store().init(blocked);
    expect(store().lost).toBe(true);
    expect(store().won).toBe(false);
    store().tick();
    expect(store().state!.seconds).toBe(0);
  });

  it("latest new game wins even when an earlier request finishes later", async () => {
    const first = deferred();
    const second = deferred();
    vi.mocked(generateNumsolis).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const revision = store().revision;
    const a = store().newGame("easy", 1);
    const b = store().newGame("medium", 2);
    expect(store().generating).toBe(true);
    second.resolve({ ...deal(), seed: 2 });
    await b;
    const id = store().state!.id;
    first.resolve({ ...deal(), seed: 1 });
    await a;
    expect(store().state!.seed).toBe(2);
    expect(store().state!.id).toBe(id);
    expect(id).not.toBe(deal().id);
    expect(store().revision).toBe(revision + 1);
    expect(store().generating).toBe(false);
  });

  it.each(["init", "reset", "restart"] as const)("%s cancels pending generation", async (action) => {
    store().init(deal());
    const pending = deferred();
    vi.mocked(generateNumsolis).mockReturnValueOnce(pending.promise);
    const request = store().newGame("easy", 2);
    if (action === "init") store().init(deal("remote"));
    else store()[action]();
    const state = store().state;
    pending.resolve(deal("stale"));
    await request;
    expect(store().state).toBe(state);
    expect(store().generating).toBe(false);
  });

  it("preserves the old game on failure and allows retry", async () => {
    const original = deal();
    store().init(original);
    const revision = store().revision;
    vi.mocked(generateNumsolis).mockRejectedValueOnce(new Error("worker failed"));
    await store().newGame("hard", 2);
    expect(store().state).toBe(original);
    expect(store().generationError).toBe(true);
    expect(store().revision).toBe(revision);
    vi.mocked(generateNumsolis).mockResolvedValueOnce(deal());
    await store().newGame("easy", 3);
    expect(store().generationError).toBe(false);
    expect(store().revision).toBe(revision + 1);
  });

  it("ignores an obsolete failure and freezes the previous board during generation", async () => {
    store().init(deal());
    store().move({ from: 0, index: 0, to: 1 });
    const original = store().state;
    const pending = deferred();
    vi.mocked(generateNumsolis).mockReturnValueOnce(pending.promise);
    const request = store().newGame("easy", 2);
    expect(store().move({ from: 1, index: 0, to: 2 })).toBe(false);
    expect(store().undo()).toBe(false);
    store().tick();
    expect(store().state).toBe(original);
    store().init(deal("remote"));
    pending.reject(new Error("late failure"));
    await request;
    expect(store().generationError).toBe(false);
    expect(store().state!.id).toBe("remote");
  });
});
