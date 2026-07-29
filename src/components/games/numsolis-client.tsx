"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  deserializeNumsolis,
  serializeNumsolis,
  numsolisProgress,
  canMove,
  totalCards,
  type Difficulty,
  type Card,
} from "@/lib/games/numsolis";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { useAutosave } from "@/hooks/use-autosave";
import { useRemoteWatch } from "@/hooks/use-remote-watch";
import { haptics } from "@/lib/telegram-client";
import { GameShell, SaveIndicator, formatTime } from "@/components/games/game-shell";
import { WinOverlay } from "@/components/games/win-overlay";
import { ContinueDialog } from "@/components/games/continue-dialog";
import { SyncDialog } from "@/components/games/sync-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const DEFAULT_DIFFICULTY: Difficulty = "easy";

// Four distinct card suits. Each entry drives the card face + accent.
const CARD_COLORS: { bg: string; ring: string; text: string }[] = [
  { bg: "bg-rose-500/15", ring: "ring-rose-400/60", text: "text-rose-200" },
  { bg: "bg-sky-500/15", ring: "ring-sky-400/60", text: "text-sky-200" },
  { bg: "bg-emerald-500/15", ring: "ring-emerald-400/60", text: "text-emerald-200" },
  { bg: "bg-amber-500/15", ring: "ring-amber-400/60", text: "text-amber-200" },
];

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, selected, tap, init, newGame, tick } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const resultPosted = useRef(false);

  const saveQuery = useQuery({
    queryKey: ["save", "numsolis"],
    queryFn: () => api.loadSave("numsolis"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rawSave = saveQuery.data?.save?.state ?? null;
  const restorable = (() => {
    const restored = rawSave ? deserializeNumsolis(rawSave) : null;
    return restored && numsolisProgress(restored) < 1 ? restored : null;
  })();

  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  const remote = useRemoteWatch({
    game: "numsolis",
    enabled: !!state && !won && !askContinue,
    syncedAt,
  });
  const remoteRestored = remote ? deserializeNumsolis(remote.state) : null;
  const showSync = !!remote && !!remoteRestored;

  const loadRemote = () => {
    if (!remote || !remoteRestored) return;
    init(remoteRestored);
    markSynced(remote.updatedAt);
    haptics.tap();
  };

  const keepMine = () => {
    if (!remote) return;
    markSynced(remote.updatedAt);
    const s = useNumsolisStore.getState().state;
    if (s) queueSave(serializeNumsolis(s), numsolisProgress(s));
  };

  // Start fresh when there is no restorable cloud save.
  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useNumsolisStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeNumsolis(raw) : null;
    if (!restored || numsolisProgress(restored) >= 1) store.newGame(DEFAULT_DIFFICULTY);
  }, [saveQuery.isSuccess, saveQuery.data]);

  // 1-second game clock.
  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // Autosave on meaningful changes (moves), never on timer ticks.
  useEffect(() => {
    const s = useNumsolisStore.getState().state;
    if (!s || useNumsolisStore.getState().won) return;
    if (s.moves === 0) return;
    queueSave(serializeNumsolis(s), numsolisProgress(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.moves]);

  // On win: clear the save, record the result once.
  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "numsolis",
      moves: state.moves,
      seconds: state.seconds,
      meta: { difficulty },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  const startNew = (diff: Difficulty) => {
    resultPosted.current = false;
    setDifficulty(diff);
    clearSave();
    newGame(diff);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame(DEFAULT_DIFFICULTY);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const handleTap = (column: number) => {
    const outcome = tap(column);
    if (outcome === "move") haptics.impact();
    else if (outcome === "select") haptics.tap();
    else if (outcome === "deselect") haptics.tap();
  };

  const remaining = state ? totalCards(state) : 0;

  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.moves}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">
            {state?.moves ?? 0}
          </p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.cardsLeft}</p>
          <p className="font-display text-xl font-medium tabular-nums text-gold">{remaining}</p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.time}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">
            {formatTime(state?.seconds ?? 0)}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SaveIndicator status={status} dict={dict} />
        <Select value={difficulty} onValueChange={(v) => startNew(v as Difficulty)}>
          <SelectTrigger
            size="sm"
            className="rounded-full border-surface bg-card text-gold-soft"
            aria-label={dict.game.difficulty}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-surface bg-card">
            <SelectItem value="easy">{dict.game.difficulties.easy}</SelectItem>
            <SelectItem value="medium">{dict.game.difficulties.medium}</SelectItem>
            <SelectItem value="hard">{dict.game.difficulties.hard}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startNew(difficulty)}
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.newGame}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <GameShell locale={locale} dict={dict} title={dict.games.numsolis.name} toolbar={toolbar}>
      <ContinueDialog
        open={askContinue}
        dict={dict}
        onContinue={continueSaved}
        onNew={() => startNew(DEFAULT_DIFFICULTY)}
      />
      <SyncDialog
        open={showSync}
        dict={dict}
        progress={remote?.progress ?? 0}
        onLoad={loadRemote}
        onKeep={keepMine}
      />

      <p className="mb-3 text-center text-xs leading-relaxed text-muted-foreground">
        {dict.game.numsolisHint}
      </p>

      <div className="relative mx-auto w-full max-w-2xl">
        {!state ? (
          <Skeleton className="aspect-[6/7] w-full rounded-lg bg-card" />
        ) : (
          <>
            <div
              className="hairline relative grid grid-cols-6 gap-1.5 rounded-lg bg-card p-2 shadow-xl shadow-black/40 sm:gap-2.5 sm:p-4"
              role="application"
              aria-label={dict.games.numsolis.name}
            >
              {state.columns.map((column, colIndex) => {
                const isSelected = selected === colIndex;
                const isDropTarget =
                  selected !== null &&
                  selected !== colIndex &&
                  canMove(state, selected, colIndex);
                return (
                  <button
                    key={colIndex}
                    type="button"
                    onClick={() => handleTap(colIndex)}
                    aria-label={`Stack ${colIndex + 1}, ${column.length} cards`}
                    aria-pressed={isSelected}
                    data-column={colIndex}
                    data-count={column.length}
                    className={`group relative flex min-h-[18rem] flex-col items-stretch gap-1 rounded-md p-1 outline-none transition-colors sm:min-h-[22rem] sm:gap-1.5 sm:p-1.5
                      ${isSelected ? "bg-gold/10 ring-2 ring-gold/50" : "hover:bg-surface/40"}
                      ${isDropTarget ? "ring-2 ring-emerald-400/50" : ""}`}
                  >
                    <div className="flex flex-1 flex-col items-stretch gap-1 sm:gap-1.5">
                      <AnimatePresence initial={false}>
                        {column.map((card, cardIndex) => {
                          const isFree = cardIndex === column.length - 1;
                          const lifted = isSelected && isFree;
                          return (
                            <NumsolisCard
                              key={card.id}
                              card={card}
                              free={isFree}
                              lifted={lifted}
                            />
                          );
                        })}
                      </AnimatePresence>
                    </div>
                    {/* Bottom line: the nine-card stack limit indicator. */}
                    <div
                      className={`mt-0.5 h-1 rounded-full transition-colors ${
                        column.length >= 9 ? "bg-destructive/80" : "bg-surface"
                      }`}
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winNumsolis}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew(difficulty)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}

function NumsolisCard({
  card,
  free,
  lifted,
}: {
  card: Card;
  free: boolean;
  lifted: boolean;
}) {
  const color = CARD_COLORS[card.c] ?? CARD_COLORS[0];
  return (
    <motion.div
      layout
      layoutId={`card-${card.id}`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: lifted ? 1.04 : 1, y: lifted ? -2 : 0 }}
      exit={{ opacity: 0, scale: 0.6 }}
      transition={{ type: "spring", stiffness: 520, damping: 34 }}
      data-card-value={card.v}
      data-card-color={card.c}
      className={`grid h-8 place-items-center rounded-md font-display font-semibold tabular-nums ring-1 ring-inset select-none sm:h-10
        ${color.bg} ${color.text} ${color.ring}
        ${card.v >= 128 ? "text-sm sm:text-base" : "text-base sm:text-lg"}
        ${free ? "shadow-md shadow-black/30" : "opacity-95"}`}
    >
      {card.v}
    </motion.div>
  );
}
