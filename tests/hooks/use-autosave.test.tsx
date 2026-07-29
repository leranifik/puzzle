// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useAutosave } from "@/hooks/use-autosave";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

const fetchMock = vi.fn();

/** Advance fake timers and flush promise microtasks so React state settles. */
async function flush(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ ok: true, updatedAt: "2026-07-26T10:00:00.000Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useAutosave", () => {
  it("debounces: many rapid queueSave calls produce one PUT with the last payload", async () => {
    const { result } = renderHook(() => useAutosave("fifteen"), { wrapper });

    act(() => {
      result.current.queueSave('{"move":1}', 0.1);
      result.current.queueSave('{"move":2}', 0.2);
      result.current.queueSave('{"move":3}', 0.3);
    });
    await flush(1100);

    const puts = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/saves/"));
    expect(puts).toHaveLength(1);
    expect(JSON.parse(puts[0][1].body as string)).toEqual({ state: '{"move":3}', progress: 0.3 });
  });

  it("records syncedAt from the server response and lands on 'saved'", async () => {
    const { result } = renderHook(() => useAutosave("fifteen"), { wrapper });
    act(() => result.current.queueSave("{}", 0));
    await flush(1100);
    await flush(10); // extra microtask flush for the mutation callbacks
    expect(result.current.syncedAt).toBe("2026-07-26T10:00:00.000Z");
    expect(result.current.status).toBe("saved");
  });

  it("does not flash 'saving' for fast requests", async () => {
    const { result } = renderHook(() => useAutosave("sudoku"), { wrapper });
    act(() => result.current.queueSave("{}", 0));
    await flush(1010); // mutation fires and resolves quickly
    await flush(10);
    // grace timer was cancelled before 600ms, so we never saw "saving"
    expect(result.current.status).toBe("saved");
  });

  it("shows 'saving' only when the request is slow", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve(
              new Response(JSON.stringify({ ok: true, updatedAt: "2026-07-26T10:00:01.000Z" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
        }),
    );
    const { result } = renderHook(() => useAutosave("g2048"), { wrapper });
    act(() => result.current.queueSave("{}", 0));

    await flush(1000); // fire mutation (fetch pending)
    await flush(700); // exceed the 600ms grace window
    expect(result.current.status).toBe("saving");

    await act(async () => {
      release();
      await vi.advanceTimersByTimeAsync(10);
    });
    await flush(10);
    expect(result.current.status).toBe("saved");
    expect(result.current.syncedAt).toBe("2026-07-26T10:00:01.000Z");
  });

  it("resets to idle when the save request fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 }),
    );
    const { result } = renderHook(() => useAutosave("memory"), { wrapper });
    act(() => result.current.queueSave("{}", 0));
    await flush(1100);
    await flush(10);
    expect(result.current.status).toBe("idle");
    expect(result.current.syncedAt).toBeNull();
  });

  it("markSynced overrides syncedAt (used when loading a cloud save)", () => {
    const { result } = renderHook(() => useAutosave("memory"), { wrapper });
    act(() => result.current.markSynced("2026-01-01T00:00:00.000Z"));
    expect(result.current.syncedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("clearSave resets state and issues a DELETE", async () => {
    const { result } = renderHook(() => useAutosave("fifteen"), { wrapper });
    act(() => result.current.markSynced("2026-01-01T00:00:00.000Z"));
    act(() => result.current.clearSave());
    expect(result.current.syncedAt).toBeNull();
    expect(result.current.status).toBe("idle");
    await flush(10);
    const dels = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(dels).toHaveLength(1);
  });

  it("cancels a queued save when clearSave is called before the debounce fires", async () => {
    const { result } = renderHook(() => useAutosave("sudoku"), { wrapper });
    act(() => result.current.queueSave('{"doomed":1}', 0.1));
    act(() => result.current.clearSave());
    await flush(1500);
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT");
    expect(puts).toHaveLength(0);
  });

  it("flushes the pending save with keepalive on unmount", () => {
    const { result, unmount } = renderHook(() => useAutosave("sudoku"), { wrapper });
    act(() => result.current.queueSave('{"unsaved":1}', 0.5));
    unmount(); // debounce timer has not fired yet

    const flushCall = fetchMock.mock.calls.find(
      ([url, init]) => String(url).includes("/api/saves/sudoku") && init?.keepalive === true,
    );
    expect(flushCall).toBeTruthy();
    expect(JSON.parse(flushCall![1].body as string)).toEqual({
      state: '{"unsaved":1}',
      progress: 0.5,
    });
  });
});
