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
  progressNumsolis,
  type Card,
} from "@/lib/games/numsolis";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { useAutosave } from "@/hooks/use-autosave";
import { useRemoteWatch } from "@/hooks/use-remote-watch";
import { haptics } from "@/lib/telegram-client";
import { GameShell, SaveIndicator, formatTime } from "@/components/games/game-shell";
import { ContinueDialog } from "@/components/games/continue-dialog";
import { SyncDialog } from "@/components/games/sync-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// 4 distinct card colors styling (Solitaire / Numsol style)
const COLOR_CLASSES: Record<number, { bg: string; text: string; border: string }> = {
  0: { bg: "bg-red-500/15 dark:bg-red-500/20", text: "text-red-600 dark:text-red-400", border: "border-red-500/30" },
  1: { bg: "bg-blue-500/15 dark:bg-blue-500/20", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/30" },
  2: { bg: "bg-emerald-500/15 dark:bg-emerald-500/20", text: "text-emerald-600 dark:text-emerald-400", border: "border-emerald-500/30" },
  3: { bg: "bg-amber-500/15 dark:bg-amber-500/20", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/30" },
};

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, init, newGame, move, tick } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [selectedCol, setSelectedCol] = useState<number | null>(null);
  const [dialogDismissed, setDialogDismissed] = useState(false);
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
    return restored && !restored.over && !restored.won ? restored : null;
  })();

  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  const remote = useRemoteWatch({
    game: "numsolis",
    enabled: !!state && !state.over && !state.won && !askContinue,
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
    if (s) queueSave(serializeNumsolis(s), progressNumsolis(s));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useNumsolisStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeNumsolis(raw) : null;
    if (!restored || restored.over || restored.won) store.newGame();
  }, [saveQuery.isSuccess, saveQuery.data]);

  // Game clock
  useEffect(() => {
    if (!state || state.over || state.won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, tick]);

  // Autosave on moves
  useEffect(() => {
    const s = useNumsolisStore.getState().state;
    if (!s || s.moves === 0) return;
    queueSave(serializeNumsolis(s), progressNumsolis(s));
  }, [state?.moves]);

  // Record win
  useEffect(() => {
    if (!state?.won || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    void api.postResult({
      game: "numsolis",
      moves: state.moves,
      seconds: state.seconds,
      meta: {
        score: state.score,
        best: state.best,
        won: true,
      },
    });
  }, [state?.won]);

  // Record game over
  useEffect(() => {
    if (!state?.over || state.won) return;
    haptics.error();
    clearSave();
    if (!resultPosted.current) {
      resultPosted.current = true;
      void api.postResult({
        game: "numsolis",
        moves: state.moves,
        seconds: state.seconds,
        meta: {
          score: state.score,
          best: state.best,
          won: false,
        },
      });
    }
  }, [state?.over, state?.won]);

  const handleColumnClick = (colIndex: number) => {
    if (!state || state.over || state.won) return;

    if (selectedCol === null) {
      if (state.columns[colIndex].length > 0) {
        setSelectedCol(colIndex);
        haptics.tap();
      }
    } else {
      if (selectedCol === colIndex) {
        setSelectedCol(null);
        haptics.tap();
      } else {
        const outcome = move(selectedCol, colIndex);
        setSelectedCol(null);
        if (outcome !== "none") {
          if (outcome === "merged") haptics.impact();
          else haptics.tap();
        } else {
          // If invalid move, select this column instead if it has cards
          if (state.columns[colIndex].length > 0) {
            setSelectedCol(colIndex);
          }
          haptics.tap();
        }
      }
    }
  };

  const startNew = () => {
    resultPosted.current = false;
    clearSave();
    newGame();
    setSelectedCol(null);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame();
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setSelectedCol(null);
    setDialogDismissed(true);
  };

  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.scoreLabel}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">
            {state?.score ?? 0}
          </p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.bestLabel}</p>
          <p className="font-display text-xl font-medium tabular-nums text-gold">
            {state?.best ?? 0}
          </p>
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
        <Button
          variant="outline"
          size="sm"
          onClick={startNew}
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
      <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={startNew} />
      <SyncDialog
        open={showSync}
        dict={dict}
        progress={remote?.progress ?? 0}
        onLoad={loadRemote}
        onKeep={keepMine}
      />

      <div className="relative mx-auto w-full max-w-3xl">
        {!state ? (
          <Skeleton className="h-96 w-full rounded-lg bg-card" />
        ) : (
          <>
            {/* Single shared field with 6 columns, cards pinned to top */}
            <div className="hairline relative flex min-h-[460px] w-full select-none gap-2 rounded-lg bg-card p-3 sm:p-5 shadow-xl shadow-black/40">
              {state.columns.map((col, colIdx) => {
                const isSelected = selectedCol === colIdx;
                return (
                  <div
                    key={colIdx}
                    onClick={() => handleColumnClick(colIdx)}
                    className={`relative flex flex-1 flex-col items-center rounded-md p-1 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-gold/10 ring-2 ring-gold/60"
                        : "bg-muted/30 hover:bg-muted/50"
                    }`}
                    style={{ minHeight: "420px" }}
                  >
                    {/* Cards pinned to top with vertical cascade */}
                    <div className="relative w-full flex flex-col items-center">
                      <AnimatePresence>
                        {col.map((card, cardIdx) => {
                          const style = COLOR_CLASSES[card.color % 4];
                          return (
                            <motion.div
                              key={card.id}
                              initial={{ opacity: 0, scale: 0.8, y: -10 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.1 } }}
                              transition={{ duration: 0.15 }}
                              className={`absolute w-full rounded-md border p-2 text-center shadow-md font-display font-bold flex flex-col items-center justify-center ${
                                style.bg
                              } ${style.text} ${style.border} ${
                                cardIdx === col.length - 1 && isSelected ? "ring-2 ring-gold shadow-gold/20" : ""
                              }`}
                              style={{
                                top: `${cardIdx * 34}px`,
                                height: "64px",
                                zIndex: cardIdx,
                              }}
                            >
                              <span className="text-sm sm:text-base leading-none">{card.value}</span>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>

                    {/* Bottom line indicator for max 9 cards stack limit */}
                    <div
                      className="absolute left-1 right-1 border-b-2 border-dashed border-muted-foreground/30 pointer-events-none"
                      style={{ top: `${9 * 34 + 10}px` }}
                      title="Max stack limit: 9 cards"
                    />
                  </div>
                );
              })}
            </div>

            {/* Win / Over overlay */}
            <AnimatePresence>
              {(state.won || state.over) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/85 backdrop-blur-sm"
                >
                  <div className="hairline mx-4 flex flex-col items-center rounded-lg bg-card px-8 py-8 text-center shadow-2xl shadow-black/50">
                    <h2 className="font-display text-2xl font-medium text-foreground">
                      {state.won ? dict.game.youWon : dict.game.gameOver}
                    </h2>
                    <p className="font-body mt-1.5 text-sm text-muted-foreground">
                      {state.won ? dict.game.winNumsolis : dict.game.gameOverText}
                    </p>
                    <p className="label-mono mt-4 text-gold-soft">
                      {dict.game.scoreLabel}: {state.score} · {formatTime(state.seconds)}
                    </p>
                    <div className="mt-6">
                      <Button onClick={startNew} className="rounded-full bg-gold px-6 text-primary-foreground hover:bg-gold/90">
                        {dict.game.playAgain}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="label-mono mt-4 text-center text-muted-foreground">
              Tap a column to select top card, tap another to move or merge. Max 9 cards per stack.
            </p>
          </>
        )}
      </div>
    </GameShell>
  );
}
