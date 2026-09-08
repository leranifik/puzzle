"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { isLocale, type Locale } from "@/i18n/config";
import { sessionKey } from "@/hooks/use-session";
import {
  getInitDataRaw,
  getTelegramWebApp,
  markInTelegram,
} from "@/lib/telegram-client";

/**
 * Telegram Mini App bootstrap, split into two independent parts:
 *
 * 1. AUTH — runs from useEffect as soon as the page mounts. It only needs
 *    initData, which is read from the URL hash (#tgWebAppData=...), so it
 *    does NOT depend on the SDK script having loaded. This is critical on
 *    web.telegram.org where the app lives in a cookie-blocked iframe and
 *    where relying on Script onReady proved fragile.
 *
 * 2. UI SETUP (expand, colors, swipe behaviour) — needs the real SDK object;
 *    a short poll waits for telegram-web-app.js and applies it when ready.
 *
 * Everything is wrapped against SecurityError: storage access can throw in
 * a third-party iframe.
 */
export function TelegramInit({ locale }: { locale: Locale }) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const authRan = useRef(false);
  const uiRan = useRef(false);

  // ---------- part 1: auth + locale (no SDK required) ----------
  useEffect(() => {
    if (authRan.current) return;
    const initData = getInitDataRaw();
    if (!initData) return; // not inside Telegram
    authRan.current = true;
    markInTelegram();

    // locale from the initData user payload (only if not chosen manually)
    try {
      const userJson = new URLSearchParams(initData).get("user");
      const tgLang = userJson
        ? (JSON.parse(userJson).language_code as string | undefined)?.split("-")[0]
        : undefined;
      let hasChosenLocale = false;
      try {
        hasChosenLocale = document.cookie.includes("ph_locale=");
      } catch { /* blocked storage */ }
      if (!hasChosenLocale && tgLang && isLocale(tgLang) && tgLang !== locale) {
        try {
          document.cookie = `ph_locale=${tgLang};path=/;max-age=${60 * 60 * 24 * 365}`;
        } catch { /* blocked storage */ }
        router.replace(pathname.replace(`/${locale}`, `/${tgLang}`));
      }
    } catch { /* malformed user payload — skip locale switch */ }

    // sign in: binds/creates the Telegram profile and (where possible)
    // sets the session cookie; in cookie-blocked iframes the tma header
    // on every apiFetch call keeps the session alive instead.
    void fetch("/api/auth/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `tma ${initData}`,
      },
      body: JSON.stringify({ initData }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) qc.invalidateQueries({ queryKey: sessionKey });
      })
      .catch(() => {
        // offline / bot token not configured — keep playing as guest
      });
  }, [locale, pathname, router, qc]);

  // ---------- part 2: SDK UI setup (poll until the script arrives) ----------
  useEffect(() => {
    if (typeof window === "undefined") return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      const tg = getTelegramWebApp();
      if (tg && !uiRan.current) {
        uiRan.current = true;
        markInTelegram();
        try {
          tg.ready();
          tg.expand();
          tg.setHeaderColor?.("#15171c");
          tg.setBackgroundColor?.("#15171c");
          // Swipe-to-close conflicts with swipe controls in 2048.
          tg.disableVerticalSwipes?.();
        } catch { /* older Telegram clients */ }
        try {
          // Also colors Android's system navigation bar (Bot API 7.10+).
          tg.setBottomBarColor?.("#15171c");
        } catch { /* bottom bar colors are unavailable in older clients */ }
      }
      if (uiRan.current || attempts > 40) clearInterval(timer); // ~10s max
    }, 250);
    return () => clearInterval(timer);
  }, []);

  return (
    <Script
      src="https://telegram.org/js/telegram-web-app.js"
      strategy="afterInteractive"
      onError={() => {
        // SDK unreachable — auth still works via the URL-hash initData
      }}
    />
  );
}
