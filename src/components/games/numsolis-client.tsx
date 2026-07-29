"use client";

import { useEffect, useState, useRef } from "react";
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
  const { state, won, init, newGame, move, tick, reset } = useNumsolisStore();
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
    if (!restored || progressNumsolis(restored) >= 1) store.newGame(4);
  }, [saveQuery.isSuccess, saveQuery.data]);

  // 1-second game clock.
  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // Autosave on moves
  useEffect(() => {
    const s = useNumsolisStore.getState().state;
    if (!s || s.won || s.moves === 0) return;
    queueSave(serializeNumsolis(s), progressNumsolis(s));
  }, [state?.moves]);

  // On win
  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "numsolis",
      moves: state.moves,
      seconds: state.seconds,
      meta: { size: state.size },
    });
  }, [won]);

  const startNew = (size = 4) => {
    resultPosted.current = false;
    clearSave();
    newGame(size);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame(4);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const size = state?.size ?? 4;
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
          onClick={() => startNew(size)}
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
        onNew={() => startNew(4)}
      />
      <SyncDialog
        open={showSync}
        dict={dict}
        progress={remote?.progress ?? 0}
        onLoad={loadRemote}
        onKeep={keepMine}
      />

      <div className="relative mx-auto w-full max-w-md">
        {!state ? (
          <Skeleton className="aspect-square w-full rounded-lg bg-card" />
        ) : (
          <>
            <div
              className="hairline relative grid aspect-square w-full gap-1.5 rounded-lg bg-card p-2 shadow-xl shadow-black/40 outline-none focus-visible:ring-2 focus-visible:ring-gold/40 sm:gap-2 sm:p-3"
              style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
              role="grid"
              aria-label={dict.games.numsolis.name}
            >
              {state.board.map((tile, index) => (
                <motion.button
                  key={`${index}-${tile}`}
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 34 }}
                  onClick={() => {
                    if (move(index)) haptics.tap();
                  }}
                  disabled={state.over || state.won || tile === 0}
                  role="gridcell"
                  aria-label={`Tile ${tile}`}
                  className={`grid place-items-center rounded-md font-display font-medium select-none transition-colors active:scale-[0.97]
                    ${tile === 0 ? "bg-transparent shadow-none" : "shadow-sm"}
                    ${tile === 1 ? "bg-muted text-gold-soft" : tile === 2 ? "bg-card text-gold" : tile === 3 ? "bg-surface text-gold-soft" : tile === 4 ? "bg-ink text-gold" : "bg-ink-soft text-gold-soft"}
                    ${tile === 0 ? "" : "hover:bg-surface hover:text-gold-soft"}
                  `}
                >
                  {tile !== 0 ? tile : null}
                </motion.button>
              ))}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winNumsolis}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew(size)}
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
                  <Button className="mt-4 rounded-full bg-gold-soft text-ink hover:bg-gold" onClick={() => startNew(size)}>
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
