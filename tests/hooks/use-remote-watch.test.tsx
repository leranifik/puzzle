// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useRemoteWatch } from "@/hooks/use-remote-watch";

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client }, children);
  }
  return Wrapper;
}

const fetchMock = vi.fn();

function mockRemoteSave(updatedAt: string | null) {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        save: updatedAt
          ? { game: "fifteen", state: "{}", progress: 0.5, updatedAt }
          : null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );
}

async function settle() {
  // let the query fetch + react state settle (real timers)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("useRemoteWatch", () => {
  it("returns the remote save when it is newer than syncedAt", async () => {
    mockRemoteSave("2026-07-26T12:00:00.000Z");
    const { result } = renderHook(
      () =>
        useRemoteWatch({
          game: "fifteen",
          enabled: true,
          syncedAt: "2026-07-26T11:00:00.000Z",
        }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(result.current?.updatedAt).toBe("2026-07-26T12:00:00.000Z");
  });

  it("stays silent when the remote save is not newer", async () => {
    mockRemoteSave("2026-07-26T10:00:00.000Z");
    const { result } = renderHook(
      () =>
        useRemoteWatch({
          game: "fifteen",
          enabled: true,
          syncedAt: "2026-07-26T11:00:00.000Z",
        }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(result.current).toBeNull();
  });

  it("stays silent before the first sync (syncedAt is null)", async () => {
    mockRemoteSave("2026-07-26T12:00:00.000Z");
    const { result } = renderHook(
      () => useRemoteWatch({ game: "fifteen", enabled: true, syncedAt: null }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(result.current).toBeNull();
  });

  it("does not fetch at all when disabled", async () => {
    mockRemoteSave("2026-07-26T12:00:00.000Z");
    const { result } = renderHook(
      () =>
        useRemoteWatch({
          game: "fifteen",
          enabled: false,
          syncedAt: "2026-07-26T11:00:00.000Z",
        }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(result.current).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns null when there is no save on the server", async () => {
    mockRemoteSave(null);
    const { result } = renderHook(
      () =>
        useRemoteWatch({
          game: "fifteen",
          enabled: true,
          syncedAt: "2026-07-26T11:00:00.000Z",
        }),
      { wrapper: makeWrapper() },
    );
    await settle();
    expect(result.current).toBeNull();
  });
});
