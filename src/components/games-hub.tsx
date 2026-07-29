"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { GAMES } from "@/lib/games/registry";
import { useSession } from "@/hooks/use-session";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AuthDialog } from "@/components/auth-dialog";
import { LinkDeviceDialog } from "@/components/link-device-dialog";
import { HomeLink } from "@/components/home-link";

function timeAgoLabel(iso: string, locale: Locale): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.floor(hours / 24), "day");
}

/**
 * Compact list of all games — designed as the start screen for
 * Telegram Mini Apps: single column, thumb-sized rows, no hero fluff.
 */
export function GamesHub({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { data } = useSession();
  const saveFor = (game: string) => data?.saves.find((s) => s.game === game && s.progress < 1);

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-8">
      <header className="flex items-center justify-between gap-2 py-4">
        <HomeLink locale={locale} className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-gold font-display text-xs font-semibold text-primary-foreground">
            P
          </span>
          <span className="font-display text-base font-medium text-foreground">
            Puzzle<span className="text-gold">Hub</span>
          </span>
        </HomeLink>
        <div className="flex items-center gap-2">
          <LinkDeviceDialog locale={locale} dict={dict} compact />
          <LocaleSwitcher current={locale} />
          <AuthDialog dict={dict} />
        </div>
      </header>

      <h1 className="mt-2 font-display text-2xl font-medium tracking-tight text-foreground">
        {dict.hub.title}
      </h1>
      <p className="font-body mt-1 text-sm text-muted-foreground">{dict.hub.subtitle}</p>

      <div className="mt-5 flex flex-col gap-2.5">
        {GAMES.map((game, i) => {
          const save = saveFor(game.id);
          const Icon = game.icon;
          return (
            <motion.div
              key={game.id}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={`/${locale}/play/${game.id}`}
                className="group flex items-center gap-3.5 rounded-lg border border-surface bg-card p-3.5 transition-colors active:bg-surface/60 hover:border-gold/50"
              >
                <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-surface text-gold">
                  <Icon className="size-5" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-display text-base font-medium text-foreground">
                      {game.name(dict)}
                    </span>
                    {save && (
                      <span className="label-mono rounded-full bg-gold/15 px-2 py-0.5 text-[10px] text-gold">
                        {Math.round(save.progress * 100)}%
                      </span>
                    )}
                  </span>
                  <span className="font-body mt-0.5 block truncate text-xs text-muted-foreground">
                    {save
                      ? `${dict.hub.lastPlayed}: ${timeAgoLabel(save.updatedAt, locale)}`
                      : game.tagline(dict)}
                  </span>
                </span>

                {/* progress ring for unfinished games */}
                {save ? (
                  <span className="relative grid size-9 shrink-0 place-items-center">
                    <svg viewBox="0 0 36 36" className="size-9 -rotate-90">
                      <circle cx="18" cy="18" r="15" fill="none" strokeWidth="3" className="stroke-surface" />
                      <circle
                        cx="18" cy="18" r="15" fill="none" strokeWidth="3"
                        strokeLinecap="round"
                        className="stroke-gold"
                        strokeDasharray={`${save.progress * 94.2} 94.2`}
                      />
                    </svg>
                    <ChevronRight className="absolute size-4 text-gold" />
                  </span>
                ) : (
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                )}
              </Link>
            </motion.div>
          );
        })}
      </div>

      <p className="label-mono mt-auto pt-8 text-center text-muted-foreground">
        {dict.hero.syncedAs}{" "}
        <span className="text-gold-soft">
          {data?.player ? (data.player.isGuest ? dict.hero.guest : data.player.name) : "…"}
        </span>
      </p>
    </div>
  );
}
