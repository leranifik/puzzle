// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TelegramInit } from "@/components/telegram-init";
import type { TelegramWebApp } from "@/lib/telegram-client";

vi.mock("next/script", () => ({ default: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/ru/games",
}));
vi.mock("@/lib/telegram-client", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/telegram-client")>(),
  getInitDataRaw: () => null,
  markInTelegram: vi.fn(),
}));

afterEach(() => {
  cleanup();
  delete window.Telegram;
  vi.useRealTimers();
});

describe("Telegram UI colors", () => {
  it.each(["supported", "missing", "throws"] as const)(
    "sets up Android navigation colors safely when the bottom-bar API is %s",
    (support) => {
      vi.useFakeTimers();
      const setBottomBarColor = vi.fn(() => {
        if (support === "throws") throw new Error("unsupported");
      });
      const tg: TelegramWebApp = {
        initData: "test",
        ready: vi.fn(),
        expand: vi.fn(),
        setHeaderColor: vi.fn(),
        setBackgroundColor: vi.fn(),
        disableVerticalSwipes: vi.fn(),
        ...(support === "missing" ? {} : { setBottomBarColor }),
      };
      window.Telegram = { WebApp: tg };
      render(createElement(QueryClientProvider, { client: new QueryClient() },
        createElement(TelegramInit, { locale: "ru" }),
      ));

      act(() => vi.advanceTimersByTime(250));

      expect(tg.ready).toHaveBeenCalledOnce();
      expect(tg.setHeaderColor).toHaveBeenCalledWith("#15171c");
      expect(tg.setBackgroundColor).toHaveBeenCalledWith("#15171c");
      expect(tg.disableVerticalSwipes).toHaveBeenCalledOnce();
      if (support !== "missing") {
        expect(setBottomBarColor).toHaveBeenCalledWith("#15171c");
      }
      act(() => vi.advanceTimersByTime(1000));
      expect(tg.ready).toHaveBeenCalledOnce();
    },
  );
});
