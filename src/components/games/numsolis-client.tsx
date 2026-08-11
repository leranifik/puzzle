"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  NUMSOLIS_STACK_LIMIT,
  canMoveNumsolis,
  deserializeNumsolis,
  numsolisProgress,
  serializeNumsolis,
  type NumsolisColor,
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

const cardClass: Record<NumsolisColor, string> = {
  amber: "bg-primary text-primary-foreground",
  ivory: "bg-secondary text-secondary-foreground",
  slate: "bg-muted text-gold-soft",
  umber: "bg-surface text-gold-soft",
};

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, selectedColumn, select, move, newGame, init, tick } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const resultPosted = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

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
    const current = useNumsolisStore.getState().state;
    if (current) queueSave(serializeNumsolis(current), numsolisProgress(current));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useNumsolisStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeNumsolis(raw) : null;
    if (!restored || numsolisProgress(restored) >= 1) store.newGame();
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  useEffect(() => {
    const current = useNumsolisStore.getState().state;
    if (!current || useNumsolisStore.getState().won || current.moves === 0) return;
    queueSave(serializeNumsolis(current), numsolisProgress(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.moves]);

  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({ game: "numsolis", moves: state.moves, seconds: state.seconds, meta: {} });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(() => {
    if (state && !askContinue) boardRef.current?.focus({ preventScroll: true });
  }, [state, askContinue]);

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

  const chooseColumn = (column: number) => {
    if (!state || won) return;
    if (selectedColumn === null) {
      if (state.columns[column].length > 0) {
        select(column);
        haptics.tap();
      }
      return;
    }
    if (selectedColumn === column) {
      select(null);
      return;
    }
    if (move(selectedColumn, column)) haptics.tap();
    else select(column < state.columns.length && state.columns[column].length ? column : null);
  };

  const onBoardKeyDown = (event: React.KeyboardEvent) => {
    if (!state || won || selectedColumn === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      select(null);
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const target = selectedColumn + delta;
    if (target >= 0 && target < state.columns.length && canMoveNumsolis(state, selectedColumn, target)) {
      if (move(selectedColumn, target)) haptics.tap();
    }
  };

  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.moves}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">{state?.moves ?? 0}</p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.time}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">{formatTime(state?.seconds ?? 0)}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SaveIndicator status={status} dict={dict} />
        <Button variant="outline" size="sm" onClick={startNew} className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft">
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.newGame}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <GameShell locale={locale} dict={dict} title={dict.games.numsolis.name} toolbar={toolbar}>
      <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={startNew} />
      <SyncDialog open={showSync} dict={dict} progress={remote?.progress ?? 0} onLoad={loadRemote} onKeep={keepMine} />

      <div className="relative mx-auto w-full max-w-3xl">
        <p className="mb-3 text-center font-body text-sm text-muted-foreground">{dict.game.numsolisHint}</p>
        {!state ? (
          <Skeleton className="h-[32rem] w-full rounded-lg bg-card" />
        ) : (
          <>
            <div
              ref={boardRef}
              tabIndex={0}
              onKeyDown={onBoardKeyDown}
              role="grid"
              aria-label={dict.games.numsolis.name}
              className="hairline grid min-h-[32rem] w-full grid-cols-6 items-start gap-1.5 overflow-hidden rounded-lg bg-card p-2 outline-none focus-visible:ring-2 focus-visible:ring-gold/40 sm:gap-2 sm:p-3"
            >
              {state.columns.map((column, columnIndex) => (
                <div key={columnIndex} role="gridcell" className="relative flex min-w-0 flex-col items-stretch gap-1.5">
                  <div className="flex min-h-[29rem] flex-col items-stretch gap-1.5">
                    {column.map((card, cardIndex) => {
                      const isTop = cardIndex === column.length - 1;
                      const selected = isTop && selectedColumn === columnIndex;
                      const classes = `relative flex h-12 w-full items-center justify-center rounded-md border border-foreground/10 font-display text-sm font-semibold tabular-nums shadow-sm sm:h-14 sm:text-lg ${cardClass[card.color]} ${selected ? "ring-2 ring-gold ring-offset-2 ring-offset-card" : ""}`;
                      return isTop ? (
                        <motion.button
                          key={card.id}
                          layout
                          type="button"
                          onClick={() => chooseColumn(columnIndex)}
                          aria-pressed={selected}
                          aria-label={`${card.value} · ${dict.game.numsolisCard}`}
                          className={classes}
                          transition={{ type: "spring", stiffness: 440, damping: 34 }}
                        >
                          {card.value}
                        </motion.button>
                      ) : (
                        <motion.div key={card.id} layout className={classes} aria-hidden>
                          {card.value}
                        </motion.div>
                      );
                    })}
                    {column.length === 0 && (
                      <button
                        type="button"
                        onClick={() => chooseColumn(columnIndex)}
                        aria-label={dict.game.numsolisEmptyColumn}
                        className="h-14 rounded-md border border-dashed border-surface bg-background/30"
                      />
                    )}
                  </div>
                  <div className="mt-auto border-t border-gold/50 pt-1 text-center label-mono text-muted-foreground" aria-label={dict.game.numsolisStackLimit}>
                    {column.length}/{NUMSOLIS_STACK_LIMIT}
                  </div>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay dict={dict} text={dict.game.winNumsolis} moves={state.moves} seconds={state.seconds} onPlayAgain={startNew} />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}
