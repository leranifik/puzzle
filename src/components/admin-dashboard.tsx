"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw, Users, Gamepad2, Activity, KeyRound } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { GAMES } from "@/lib/games/registry";
import { formatTime } from "@/components/games/game-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

type Stats = {
  generatedAt: string;
  players: {
    total: number; identified: number; telegram: number; guests: number;
    newToday: number; dau: number; wau: number; mau: number;
  };
  games: {
    totalFinished: number;
    activeSaves: number;
    perGame: { game: string; finished: number; players: number; avgSeconds: number; avgMoves: number }[];
  };
  daily: { day: string; signups: number; visits: number; finished: number }[];
  events30d: { type: string; count: number }[];
  recent: { game: string; moves: number; seconds: number; playerName: string; identified: boolean; at: string }[];
};

const KEY_STORAGE = "ph_admin_key";

function gameName(id: string, dict: Dictionary): string {
  return GAMES.find((g) => g.id === id)?.name(dict) ?? id;
}

function StatCard({ label, value, accent = false }: { label: string; value: string | number; accent?: boolean }) {
  return (
    <div className="hairline rounded-lg bg-card p-4">
      <p className="label-mono text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display text-2xl font-medium tabular-nums ${accent ? "text-gold" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

/** Tiny dependency-free bar chart for the daily activity series. */
function BarChart({
  daily,
  dict,
}: {
  daily: Stats["daily"];
  dict: Dictionary;
}) {
  const max = Math.max(...daily.map((d) => Math.max(d.visits, d.finished, d.signups)), 1);
  return (
    <div>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {daily.map((d) => (
          <div key={d.day} className="group relative flex flex-1 items-end gap-px">
            <div
              className="flex-1 rounded-t-sm bg-gold/70"
              style={{ height: `${(d.visits / max) * 112 + 2}px` }}
              title={`${d.day}: ${d.visits} ${dict.admin.visits}`}
            />
            <div
              className="flex-1 rounded-t-sm bg-gold-soft/50"
              style={{ height: `${(d.finished / max) * 112 + 2}px` }}
              title={`${d.day}: ${d.finished} ${dict.admin.finished}`}
            />
            <div
              className="flex-1 rounded-t-sm bg-muted-foreground/50"
              style={{ height: `${(d.signups / max) * 112 + 2}px` }}
              title={`${d.day}: ${d.signups} ${dict.admin.signups}`}
            />
            <span className="label-mono pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap text-[9px] text-gold-soft group-hover:block">
              {d.day.slice(5)}
            </span>
          </div>
        ))}
      </div>
      <div className="label-mono mt-3 flex flex-wrap gap-4 text-[10px] text-muted-foreground">
        <span><span className="mr-1.5 inline-block size-2 rounded-sm bg-gold/70" />{dict.admin.visits}</span>
        <span><span className="mr-1.5 inline-block size-2 rounded-sm bg-gold-soft/50" />{dict.admin.finished}</span>
        <span><span className="mr-1.5 inline-block size-2 rounded-sm bg-muted-foreground/50" />{dict.admin.signups}</span>
      </div>
    </div>
  );
}

export function AdminDashboard({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const t = dict.admin;
  const [key, setKey] = useState<string>(() =>
    typeof window === "undefined" ? "" : sessionStorage.getItem(KEY_STORAGE) ?? "",
  );
  const [draft, setDraft] = useState("");

  const query = useQuery<Stats>({
    queryKey: ["admin-stats", key],
    enabled: key.length > 0,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      const res = await fetch("/api/admin/stats", { headers: { "X-Admin-Key": key } });
      if (!res.ok) throw new Error(String(res.status));
      return res.json();
    },
  });

  const unauthorized = query.error?.message === "401";

  /* ------------------------------ key gate ------------------------------ */
  if (!key || unauthorized) {
    return (
      <main className="grid min-h-dvh place-items-center px-4">
        <form
          className="hairline flex w-full max-w-xs flex-col gap-3 rounded-lg bg-card p-6"
          onSubmit={(e) => {
            e.preventDefault();
            sessionStorage.setItem(KEY_STORAGE, draft);
            setKey(draft);
          }}
        >
          <div className="flex items-center gap-2 text-gold">
            <KeyRound className="size-4" />
            <span className="font-display text-lg font-medium text-foreground">{t.title}</span>
          </div>
          <Input
            type="password"
            placeholder={t.enterKey}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            autoFocus
          />
          {unauthorized && key && <p className="text-xs text-destructive">{t.wrongKey}</p>}
          <Button type="submit" className="rounded-full bg-gold text-primary-foreground hover:bg-gold/90">
            {t.unlock}
          </Button>
        </form>
      </main>
    );
  }

  const s = query.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16 pt-8 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-medium tracking-tight text-foreground sm:text-3xl">
          Puzzle<span className="text-gold">Hub</span> · {t.title}
        </h1>
        <Button
          variant="outline"
          size="sm"
          onClick={() => query.refetch()}
          disabled={query.isFetching}
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface"
        >
          <RefreshCw className={`size-3.5 ${query.isFetching ? "animate-spin" : ""}`} />
          {t.refresh}
        </Button>
      </div>

      {!s ? (
        <div className="mt-8 grid gap-3 sm:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg bg-card" />
          ))}
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          {/* -------- players -------- */}
          <div className="mt-8 flex items-center gap-2 text-gold">
            <Users className="size-4" />
            <h2 className="label-mono">{t.players}</h2>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={t.totalPlayers} value={s.players.total} accent />
            <StatCard label={t.dau} value={s.players.dau} accent />
            <StatCard label={t.wau} value={s.players.wau} />
            <StatCard label={t.mau} value={s.players.mau} />
            <StatCard label={t.newToday} value={s.players.newToday} />
            <StatCard label={t.guests} value={s.players.guests} />
            <StatCard label={t.identified} value={s.players.identified} />
            <StatCard label={t.viaTelegram} value={s.players.telegram} />
          </div>

          {/* -------- daily chart -------- */}
          <div className="mt-10 flex items-center gap-2 text-gold">
            <Activity className="size-4" />
            <h2 className="label-mono">{t.activity}</h2>
          </div>
          <div className="hairline mt-3 rounded-lg bg-card p-5">
            <BarChart daily={s.daily} dict={dict} />
          </div>

          {/* -------- games -------- */}
          <div className="mt-10 flex items-center gap-2 text-gold">
            <Gamepad2 className="size-4" />
            <h2 className="label-mono">{t.gamesTitle}</h2>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[2fr_1fr]">
            <div className="hairline overflow-x-auto rounded-lg bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="label-mono border-b border-surface text-left text-muted-foreground">
                    <th className="px-4 py-3">{t.game}</th>
                    <th className="px-4 py-3 text-right">{t.finishedCol}</th>
                    <th className="px-4 py-3 text-right">{t.playersCol}</th>
                    <th className="px-4 py-3 text-right">{t.avgTime}</th>
                    <th className="px-4 py-3 text-right">{t.avgMoves}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.games.perGame.length === 0 && (
                    <tr><td colSpan={5} className="font-body px-4 py-6 text-center text-muted-foreground">{t.noData}</td></tr>
                  )}
                  {s.games.perGame.map((g) => (
                    <tr key={g.game} className="border-b border-surface/50 last:border-0">
                      <td className="px-4 py-3 font-display text-foreground">{gameName(g.game, dict)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-gold">{g.finished}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{g.players}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatTime(g.avgSeconds)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{g.avgMoves}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-3">
              <StatCard label={t.finished} value={s.games.totalFinished} accent />
              <StatCard label={t.activeSaves} value={s.games.activeSaves} />
            </div>
          </div>

          {/* -------- events + recent -------- */}
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="label-mono text-gold">{t.events}</h2>
              <div className="hairline mt-3 rounded-lg bg-card p-4">
                {s.events30d.length === 0 && (
                  <p className="font-body text-sm text-muted-foreground">{t.noData}</p>
                )}
                {s.events30d.map((e) => (
                  <div key={e.type} className="flex items-center justify-between border-b border-surface/50 py-2 last:border-0">
                    <span className="label-mono text-muted-foreground">{e.type}</span>
                    <span className="font-display tabular-nums text-gold-soft">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2 className="label-mono text-gold">{t.recent}</h2>
              <div className="hairline mt-3 rounded-lg bg-card p-4">
                {s.recent.length === 0 && (
                  <p className="font-body text-sm text-muted-foreground">{t.noData}</p>
                )}
                {s.recent.map((r, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 border-b border-surface/50 py-2 last:border-0">
                    <span className="truncate font-body text-sm text-foreground">
                      {r.identified ? r.playerName : t.guest}
                      <span className="text-muted-foreground"> · {gameName(r.game, dict)}</span>
                    </span>
                    <span className="label-mono shrink-0 text-[10px] text-muted-foreground">
                      {r.moves} · {formatTime(r.seconds)} ·{" "}
                      {new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(r.at))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className="label-mono mt-8 text-[10px] text-muted-foreground">
            {new Date(s.generatedAt).toLocaleString(locale)}
          </p>
        </motion.div>
      )}
    </main>
  );
}
