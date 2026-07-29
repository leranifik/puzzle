"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import type { Locale } from "@/i18n/config";
import { isInTelegram, subscribeInTelegram } from "@/lib/telegram-client";

const serverSnapshot = () => false;

/**
 * "Home" link that adapts to the container:
 * inside Telegram Mini Apps the natural start screen is the games hub
 * (/games), in a regular browser it is the landing page.
 *
 * Detection is sticky and event-driven: it re-renders when TelegramInit
 * confirms the Telegram container (the SDK may load after hydration).
 */
export function HomeLink({
  locale,
  className,
  children,
}: {
  locale: Locale;
  className?: string;
  children: ReactNode;
}) {
  const inTelegram = useSyncExternalStore(subscribeInTelegram, isInTelegram, serverSnapshot);

  return (
    <Link href={inTelegram ? `/${locale}/games` : `/${locale}`} className={className}>
      {children}
    </Link>
  );
}
