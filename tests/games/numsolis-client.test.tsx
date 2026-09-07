// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NumsolisClient } from "@/components/games/numsolis-client";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { applyMove, createNumsolisState, serializeNumsolis, type NumsolisState } from "@/lib/games/numsolis";
import { en } from "@/i18n/dictionaries/en";

const mocks = vi.hoisted(() => ({
  queueSave: vi.fn(), clearSave: vi.fn(), cancelPending: vi.fn(), markSynced: vi.fn(), postResult: vi.fn(),
  isFetching: false, isFetchedAfterMount: true,
  save: null as null | { state: string; updatedAt: string },
  remote: null as null | { state: string; updatedAt: string; progress: number },
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ isSuccess: true, isError: false, isFetching: mocks.isFetching, isFetchedAfterMount: mocks.isFetchedAfterMount, data: { save: mocks.save }, refetch: vi.fn() }) }));
vi.mock("@/hooks/use-autosave", () => ({ useAutosave: () => ({ ...mocks, status: "idle", syncedAt: "2026-09-01T00:00:00Z" }) }));
vi.mock("@/hooks/use-remote-watch", () => ({ useRemoteWatch: () => mocks.remote }));
vi.mock("@/lib/api", () => ({ api: { postResult: mocks.postResult } }));
vi.mock("@/lib/telegram-client", () => ({ haptics: { tap: vi.fn(), success: vi.fn() } }));
vi.mock("@/components/home-link", () => ({ HomeLink: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/components/link-device-dialog", () => ({ LinkDeviceDialog: () => null }));
vi.mock("@/components/games/game-shell", () => ({ GameShell: ({ children, toolbar }: { children: React.ReactNode; toolbar: React.ReactNode }) => <main>{toolbar}{children}</main>, SaveIndicator: () => null, formatTime: (seconds: number) => String(seconds) }));
vi.mock("@/components/games/numsolis-board", () => ({ NumsolisBoard: ({ state, disabled }: { state: NumsolisState; disabled: boolean }) => <div data-testid="visible-board" aria-disabled={disabled}>{state.columns[1].map((card) => card.value).join(",")}</div> }));
vi.mock("@/components/games/continue-dialog", () => ({ ContinueDialog: ({ open, onContinue }: { open: boolean; onContinue: () => void }) => open ? <button onClick={onContinue}>Continue saved</button> : null }));
vi.mock("@/components/games/sync-dialog", () => ({ SyncDialog: ({ open, onLoad }: { open: boolean; onLoad: () => void }) => open ? <button onClick={onLoad}>Load remote</button> : null }));
vi.mock("@/components/games/win-overlay", () => ({ WinOverlay: () => <div>Won</div> }));
// Only the synchronization boundary is under test here. Real store behavior and
// generation are covered by their own tests; no worker runs in this DOM suite.
vi.mock("@/stores/numsolis-store", async () => {
  const { create } = await import("zustand");
  return { useNumsolisStore: create((set) => ({
    state: null, won: false, lost: false, generating: false, generationError: false, revision: 0, animationFrames: [], animationIndex: 0, advanceAnimation: vi.fn(), finishAnimation: vi.fn(),
    init: (state: unknown) => set({ state }), newGame: vi.fn(), move: vi.fn(), undo: vi.fn(), restart: vi.fn(), tick: vi.fn(), reset: vi.fn(() => set({ state: null, generating: false, generationError: false, won: false, lost: false, animationFrames: [], animationIndex: 0 })),
  })) };
});

function fixture() {
  return createNumsolisState([
    [{ id: 1, value: 1024, suit: 0 }], [{ id: 2, value: 512, suit: 0 }], [{ id: 3, value: 256, suit: 0 }], [{ id: 4, value: 128, suit: 0 }], [{ id: 5, value: 64, suit: 0 }], [{ id: 6, value: 64, suit: 0 }],
  ], "easy", 7);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.save = null;
  mocks.remote = null;
  mocks.isFetching = false;
  mocks.isFetchedAfterMount = true;
  mocks.postResult.mockResolvedValue({ ok: true });
  vi.mocked(useNumsolisStore.getState().newGame).mockReset();
  useNumsolisStore.setState({ state: fixture(), won: false, lost: false, generating: false, generationError: false, revision: 0, animationFrames: [], animationIndex: 0 });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("Numsolis synchronization", () => {
  it("resets local state on unmount and asks about the fresh cloud game on return", () => {
    const first = render(<NumsolisClient locale="en" dict={en} />);
    first.unmount();
    expect(useNumsolisStore.getState().reset).toHaveBeenCalledOnce();
    expect(useNumsolisStore.getState().state).toBeNull();
    const remote = { ...fixture(), moves: 1, seconds: 19 };
    mocks.save = { state: serializeNumsolis(remote), updatedAt: "2026-09-06T18:00:00Z" };
    render(<NumsolisClient locale="en" dict={en} />);
    fireEvent.click(screen.getByText("Continue saved"));
    expect(useNumsolisStore.getState().state?.seconds).toBe(19);
    expect(mocks.markSynced).toHaveBeenCalledWith(mocks.save.updatedAt);
    expect(mocks.queueSave).not.toHaveBeenCalled();
    expect(useNumsolisStore.getState().newGame).not.toHaveBeenCalled();
  });

  it("does not generate from cached null while the mount refetch is in flight", () => {
    useNumsolisStore.setState({ state: null });
    mocks.isFetching = true;
    mocks.isFetchedAfterMount = false;
    const { rerender } = render(<NumsolisClient locale="en" dict={en} />);
    expect(useNumsolisStore.getState().newGame).not.toHaveBeenCalled();
    expect((screen.getByLabelText(en.game.newGame) as HTMLButtonElement).disabled).toBe(true);
    mocks.save = { state: serializeNumsolis(fixture()), updatedAt: "2026-09-06T18:00:00Z" };
    mocks.isFetchedAfterMount = true;
    rerender(<NumsolisClient locale="en" dict={en} />);
    expect(screen.queryByText("Continue saved")).toBeNull();
    mocks.isFetching = false;
    rerender(<NumsolisClient locale="en" dict={en} />);
    expect(screen.getByText("Continue saved")).toBeTruthy();
    expect(useNumsolisStore.getState().newGame).not.toHaveBeenCalled();
  });

  it("does not offer a cached save before this mount has fetched", () => {
    useNumsolisStore.setState({ state: null });
    mocks.save = { state: serializeNumsolis(fixture()), updatedAt: "2026-09-06T18:00:00Z" };
    mocks.isFetchedAfterMount = false;
    const { rerender } = render(<NumsolisClient locale="en" dict={en} />);
    expect(screen.queryByText("Continue saved")).toBeNull();
    mocks.isFetchedAfterMount = true;
    mocks.save = null;
    rerender(<NumsolisClient locale="en" dict={en} />);
    expect(useNumsolisStore.getState().newGame).toHaveBeenCalledExactlyOnceWith("easy");
  });

  it("restarts fresh generation after the StrictMode cleanup invalidates the first request", () => {
    useNumsolisStore.setState({ state: null });
    vi.mocked(useNumsolisStore.getState().newGame).mockImplementation(async () => { useNumsolisStore.setState({ generating: true }); });
    render(<StrictMode><NumsolisClient locale="en" dict={en} /></StrictMode>);
    expect(useNumsolisStore.getState().reset).toHaveBeenCalledOnce();
    expect(useNumsolisStore.getState().newGame).toHaveBeenCalledTimes(2);
    expect(useNumsolisStore.getState().generating).toBe(true);
  });

  it("saves local transactions, not initial rendering, remote init or timer ticks", () => {
    render(<NumsolisClient locale="en" dict={en} />);
    expect(mocks.queueSave).not.toHaveBeenCalled();
    act(() => useNumsolisStore.setState({ state: { ...fixture(), moves: 1 }, revision: 1 }));
    expect(mocks.queueSave).toHaveBeenCalledTimes(1);
    act(() => useNumsolisStore.setState({ state: { ...fixture(), moves: 1, seconds: 5 } }));
    act(() => useNumsolisStore.getState().init(fixture()));
    expect(mocks.queueSave).toHaveBeenCalledTimes(1);
  });

  it("accepting a cloud save cancels stale pending writes without echoing a PUT", () => {
    useNumsolisStore.setState({ state: null });
    mocks.save = { state: serializeNumsolis(fixture()), updatedAt: "2026-09-06T12:00:00Z" };
    render(<NumsolisClient locale="en" dict={en} />);
    fireEvent.click(screen.getByText("Continue saved"));
    expect(mocks.cancelPending).toHaveBeenCalledOnce();
    expect(mocks.markSynced).toHaveBeenCalledWith(mocks.save.updatedAt);
    expect(mocks.queueSave).not.toHaveBeenCalled();
  });

  it("loading a live conflict cancels pending writes and does not record a remote victory", () => {
    const completed = { ...fixture(), columns: [[{ id: 1, value: 2048, suit: 0 as const }], [], [], [], [], []], moves: 2 };
    mocks.remote = { state: serializeNumsolis(completed), updatedAt: "2026-09-06T12:00:00Z", progress: 1 };
    render(<NumsolisClient locale="en" dict={en} />);
    fireEvent.click(screen.getByText("Load remote"));
    expect(mocks.cancelPending).toHaveBeenCalledOnce();
    expect(mocks.queueSave).not.toHaveBeenCalled();
    expect(mocks.postResult).not.toHaveBeenCalled();
  });

  it("posts a completed local party once per ID, including a repeated winning transition", () => {
    render(<NumsolisClient locale="en" dict={en} />);
    const completed = { ...fixture(), columns: [[{ id: 1, value: 2048, suit: 0 as const }], [], [], [], [], []], moves: 2 };
    act(() => useNumsolisStore.setState({ state: completed, won: true, revision: 1 }));
    act(() => useNumsolisStore.setState({ state: completed, won: true, revision: 2 }));
    expect(mocks.postResult).toHaveBeenCalledOnce();
    expect(mocks.clearSave).toHaveBeenCalledOnce();
    expect(mocks.queueSave).not.toHaveBeenCalled();
  });

  it("pauses the clock in the rules dialog", () => {
    vi.useFakeTimers();
    render(<NumsolisClient locale="en" dict={en} />);
    act(() => vi.advanceTimersByTime(1000));
    expect(useNumsolisStore.getState().tick).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: en.numsolis.rules }));
    act(() => vi.advanceTimersByTime(3000));
    expect(useNumsolisStore.getState().tick).toHaveBeenCalledTimes(1);
  });

  it("does not count time while the page is hidden", () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    render(<NumsolisClient locale="en" dict={en} />);
    act(() => vi.advanceTimersByTime(5000));
    expect(useNumsolisStore.getState().tick).not.toHaveBeenCalled();
    visibility.mockReturnValue("visible");
    act(() => vi.advanceTimersByTime(1000));
    expect(useNumsolisStore.getState().tick).toHaveBeenCalledTimes(1);
  });

  it("shows and saves the final cascade immediately without an animation lock", () => {
    vi.useFakeTimers();
    const initial = createNumsolisState([
      [{ id: 1, value: 8, suit: 0 }, { id: 2, value: 16, suit: 0 }],
      [{ id: 3, value: 16, suit: 0 }, { id: 4, value: 8, suit: 0 }],
      [{ id: 5, value: 1024, suit: 0 }], [{ id: 6, value: 512, suit: 0 }], [{ id: 7, value: 256, suit: 0 }],
      [{ id: 8, value: 128, suit: 0 }, { id: 9, value: 64, suit: 0 }, { id: 10, value: 16, suit: 0 }],
    ], "easy", 12);
    useNumsolisStore.setState({ state: initial });
    render(<NumsolisClient locale="en" dict={en} />);
    const move = { from: 0, index: 0, to: 1 };
    const completed = applyMove(initial, move)!;
    act(() => useNumsolisStore.setState({ state: completed, revision: 1 }));
    expect(screen.getByTestId("visible-board").textContent).toBe("16,32");
    expect(screen.getByTestId("visible-board").getAttribute("aria-disabled")).toBe("false");
    expect(mocks.queueSave.mock.calls[0][0]).toBe(serializeNumsolis(completed));
    expect(useNumsolisStore.getState().advanceAnimation).not.toHaveBeenCalled();

  });
});
