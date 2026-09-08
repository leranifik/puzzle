"use client";

/** Minimal typings for the Telegram Mini Apps SDK surface we use. */
export type TelegramWebApp = {
  ready: () => void;
  expand: () => void;
  initData: string;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string; language_code?: string };
  };
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
  disableVerticalSwipes?: () => void;
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
    selectionChanged: () => void;
  };
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function getTelegramWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const tg = window.Telegram?.WebApp;
  // Telegram injects the object even outside Telegram, but initData is empty there.
  return tg && tg.initData ? tg : null;
}

/* ------------------------------ raw initData ------------------------------ */

let cachedInitData: string | null = null;

/**
 * Returns the raw initData string, independent of the SDK.
 *
 * Sources, in order:
 *  1. the SDK object (when telegram-web-app.js has loaded);
 *  2. the URL hash `#tgWebAppData=...` that every Telegram client puts into
 *     the Mini App URL — available IMMEDIATELY, before any script loads.
 *
 * The value is cached: the SDK (or navigation) may strip the hash later.
 * This is what makes auth work on web.telegram.org even when the iframe
 * blocks cookies and even if the SDK script fails to load entirely.
 */
export function getInitDataRaw(): string | null {
  if (typeof window === "undefined") return null;
  const tg = window.Telegram?.WebApp;
  if (tg?.initData) {
    cachedInitData = tg.initData;
    return cachedInitData;
  }
  if (cachedInitData) return cachedInitData;
  try {
    const match = /[#&]tgWebAppData=([^&]+)/.exec(window.location.hash);
    if (match) {
      cachedInitData = decodeURIComponent(match[1]);
      return cachedInitData;
    }
  } catch {
    // malformed hash — ignore
  }
  return null;
}

/* --------------------- "are we inside Telegram?" flag --------------------- */

const TG_ENV_EVENT = "ph-telegram-detected";
let detectedInTelegram = false;

/** Sticky detection: once we've seen a real Telegram container, remember it. */
export function isInTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (!detectedInTelegram) detectedInTelegram = getInitDataRaw() !== null;
  return detectedInTelegram;
}

/** Called by TelegramInit once the SDK is ready inside Telegram. */
export function markInTelegram(): void {
  if (detectedInTelegram) return;
  detectedInTelegram = true;
  window.dispatchEvent(new Event(TG_ENV_EVENT));
}

/** Subscribe to detection changes (for useSyncExternalStore). */
export function subscribeInTelegram(callback: () => void): () => void {
  window.addEventListener(TG_ENV_EVENT, callback);
  return () => window.removeEventListener(TG_ENV_EVENT, callback);
}

/* ------------------------------ haptics ------------------------------ */

function canVibrate(): boolean {
  return typeof navigator !== "undefined" && "vibrate" in navigator;
}

/**
 * Haptic feedback: Telegram's native API inside Telegram,
 * navigator.vibrate as a fallback in regular mobile browsers.
 */
export const haptics = {
  /** Small tick: a tile moved, a card flipped, a digit placed. */
  tap() {
    const tg = getTelegramWebApp();
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("light");
    else if (canVibrate()) navigator.vibrate(8);
  },
  /** Medium: merge in 2048, matched pair. */
  impact() {
    const tg = getTelegramWebApp();
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred("medium");
    else if (canVibrate()) navigator.vibrate(18);
  },
  /** Success: game solved. */
  success() {
    const tg = getTelegramWebApp();
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("success");
    else if (canVibrate()) navigator.vibrate([12, 60, 24]);
  },
  /** Error: wrong digit, illegal move, game over. */
  error() {
    const tg = getTelegramWebApp();
    if (tg?.HapticFeedback) tg.HapticFeedback.notificationOccurred("error");
    else if (canVibrate()) navigator.vibrate([30, 40, 30]);
  },
  /** Selection change: choosing a sudoku cell, switching options. */
  select() {
    const tg = getTelegramWebApp();
    if (tg?.HapticFeedback) tg.HapticFeedback.selectionChanged();
    // no vibrate fallback: selection events are too frequent
  },
};
