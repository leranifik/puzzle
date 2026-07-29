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

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, selectedCol, init, newGame, selectCol, moveToCol, tick, reset } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
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
    return restored && progressNumsolis(restored) < 1 ? restored : null;
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
    if (s) queueSave(serializeNumsolis(s), progressNumsolis(s));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useNumsolisStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeNumsolis(raw) : null;
    if (!restored || progressNumsolis(restored) >= 1) store.newGame();
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  useEffect(() => {
    const s = useNumsolisStore.getState().state;
    if (!s || s.won || s.moves === 0) return;
    queueSave(serializeNumsolis(s), progressNumsolis(s));
  }, [state?.moves]);

  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "numsolis",
      moves: state.moves,
      seconds: state.seconds,
      meta: {},
    });
  }, [won]);

  const startNew = () => {
    resultPosted.current = false;
    clearSave();
    newGame();
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame();
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

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
          onClick={() => startNew()}
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.newGame}</span>
        </Button>
      </div>
    </div>
  );

  const handleColClick = (col: number) => {
    if (!state) return;
    if (selectedCol === null) {
      selectCol(col);
    } else {
      const moved = moveToCol(col);
      if (moved) haptics.tap();
    }
  };

  return (
    <GameShell locale={locale} dict={dict} title={dict.games.numsolis.name} toolbar={toolbar}>
      <ContinueDialog
        open={askContinue}
        dict={dict}
        onContinue={continueSaved}
        onNew={() => startNew()}
      />
      <SyncDialog
        open={showSync}
        dict={dict}
        progress={remote?.progress ?? 0}
        onLoad={loadRemote}
        onKeep={keepMine}
      />

      <div className="relative mx-auto w-full max-w-2xl">
        {!state ? (
          <div className="flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 w-16 rounded-lg bg-card" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex items-start gap-2 overflow-x-auto px-1 pb-2">
              {state.stacks.map((stack, colIndex) => (
                <button
                  key={colIndex}
                  onClick={() => handleColClick(colIndex)}
                  className={`group relative flex min-h-[200px] w-16 shrink-0 flex-col items-center rounded-lg border-2 p-1 transition-colors focus-visible:outline-2 focus-visible:outline-gold focus-visible:outline-offset-2 sm:w-20 sm:p-2 ${
                    selectedCol === colIndex
                      ? "border-gold bg-card shadow-lg shadow-gold/10"
                      : "border-surface bg-card/60 hover:border-gold/40"
                  }`}
                  aria-label={`Column ${colIndex + 1}`}
                >
                  <div className="flex w-full flex-1 flex-col items-center justify-start gap-0.5">
                    {stack.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      stack.map((card, cardIndex) => {
                        const isTop = cardIndex === stack.length - 1;
                        return (
                          <motion.div
                            key={`${colIndex}-${cardIndex}-${card.v}-${card.c}`}
                            layout
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`relative flex h-10 w-full items-center justify-center rounded-md border text-xs font-display font-bold shadow-sm transition-colors sm:h-12 sm:text-sm ${
                              selectedCol === colIndex && isTop
                                ? "border-gold ring-1 ring-gold/40 bg-gold text-ink"
                                : card.c === "gold"
                                  ? "border-gold/30 bg-gradient-to-br from-gold/20 to-gold/5 text-gold"
                                  : "border-ink/20 bg-gradient-to-br from-ink/20 to-ink/5 text-ink"
                            }`}
                            aria-label={`Card value ${card.v} color ${card.c}`}
                          >
                            <span>{card.v}</span>
                          </motion.div>
                        );
                      })
                    )}
                    {stack.length >= 9 && (
                      <span className="mt-0.5 text-[9px] text-red-400">max 9</span>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 text-center text-xs text-muted-foreground">
              {selectedCol === null
                ? dict.game.continueNo
                : "Select another column to move"}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winNumsolis}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew()}
                />
              )}
            </AnimatePresence>
            <AnimatePresence>
              {state.over && !state.won && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl bg-background/90 p-6 text-center shadow-2xl backdrop-blur-md"
                >
                  <h3 className="font-display text-xl font-medium text-foreground">{dict.game.gameOver}</h3>
                  <p className="text-muted-foreground">{dict.game.gameOverText}</p>
                  <Button className="mt-4 rounded-full bg-gold-soft text-ink hover:bg-gold" onClick={() => startNew()}>
                    {dict.game.playAgain}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}
