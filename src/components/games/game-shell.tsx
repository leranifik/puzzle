"use client";

import type { ReactNode } from "react";
import { ArrowLeft, Check, CloudUpload } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import type { SaveStatus } from "@/hooks/use-autosave";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { LinkDeviceDialog } from "@/components/link-device-dialog";
import { HomeLink } from "@/components/home-link";

export function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SaveIndicator({ status, dict }: { status: SaveStatus; dict: Dictionary }) {
  return (
    <span
      className={`label-mono inline-flex items-center gap-1.5 text-muted-foreground transition-opacity duration-500 ${
        status === "idle" ? "opacity-0" : "opacity-100"
      }`}
      aria-live="polite"
    >
      {status === "saving" ? (
        <>
          <CloudUpload className="size-3.5 animate-pulse text-gold" />
          {dict.game.saving}
        </>
      ) : (
        <>
          <Check className="size-3.5 text-gold" />
          {dict.game.saved}
        </>
      )}
    </span>
  );
}

export function GameShell({
  locale,
  dict,
  title,
  children,
  toolbar,
}: {
  locale: Locale;
  dict: Dictionary;
  title: string;
  children: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b border-surface/70 bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
          <HomeLink
            locale={locale}
            className="label-mono inline-flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-gold-soft"
          >
            <ArrowLeft className="size-4" />
            <span className="hidden sm:inline">{dict.game.backHome}</span>
          </HomeLink>
          <h1 className="font-display text-base font-medium text-foreground">{title}</h1>
          <div className="flex items-center gap-1.5">
            <LinkDeviceDialog locale={locale} dict={dict} compact />
            <LocaleSwitcher current={locale} />
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 pt-6">
        {toolbar}
        {children}
      </main>
    </div>
  );
}
