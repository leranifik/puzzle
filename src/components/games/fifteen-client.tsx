"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  deserializeFifteen,
  serializeFifteen,
  fifteenProgress,
  solvedBoard,
} from "@/lib/games/fifteen";
import { useFifteenStore } from "@/stores/fifteen-store";
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

export function FifteenClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, move, newGame, init, tick } = useFifteenStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("fifteen");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const resultPosted = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const saveQuery = useQuery({
    queryKey: ["save", "fifteen"],
    queryFn: () => api.loadSave("fifteen"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rawSave = saveQuery.data?.save?.state ?? null;
  const restorable = (() => {
    const restored = rawSave ? deserializeFifteen(rawSave) : null;
    return restored && fifteenProgress(restored) < 1 ? restored : null;
  })();

  // Ask to continue when a cloud save exists; otherwise start fresh.
  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  // Live watch: someone saved this game from another device.
  const remote = useRemoteWatch({
    game: "fifteen",
    enabled: !!state && !won && !askContinue,
    syncedAt,
  });
  const remoteRestored = remote ? deserializeFifteen(remote.state) : null;
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
    const s = useFifteenStore.getState().state;
    if (s) queueSave(serializeFifteen(s), fifteenProgress(s)); // local becomes the truth
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useFifteenStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeFifteen(raw) : null;
    if (!restored || fifteenProgress(restored) >= 1) store.newGame(4);
  }, [saveQuery.isSuccess, saveQuery.data]);

  // 1-second game clock.
  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // Autosave only on meaningful changes (moves), not on every timer tick.
  // The queued payload still carries the latest seconds value.
  useEffect(() => {
    const s = useFifteenStore.getState().state;
    if (!s || useFifteenStore.getState().won) return;
    if (s.moves === 0) return;
    queueSave(serializeFifteen(s), fifteenProgress(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.moves, state?.size]);

  // On win: clear the save, record the result once.
  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "fifteen",
      moves: state.moves,
      seconds: state.seconds,
      meta: { size: state.size },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  const startNew = (size: number) => {
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
  const goal = solvedBoard(size);

  // Arrow keys slide the tile adjacent to the hole in the pressed direction
  // (e.g. ArrowUp slides the tile below the hole upwards). Scoped to the
  // focused board so the rest of the page keeps scrolling normally.
  const onBoardKeyDown = (e: React.KeyboardEvent) => {
    if (!state || won) return;
    const empty = state.board.indexOf(0);
    const row = Math.floor(empty / state.size);
    const col = empty % state.size;
    let index = -1;
    if (e.key === "ArrowUp" && row < state.size - 1) index = empty + state.size;
    else if (e.key === "ArrowDown" && row > 0) index = empty - state.size;
    else if (e.key === "ArrowLeft" && col < state.size - 1) index = empty + 1;
    else if (e.key === "ArrowRight" && col > 0) index = empty - 1;
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    if (index >= 0 && move(index)) haptics.tap();
  };

  // Autofocus the board once the game is ready, so arrows work immediately.
  useEffect(() => {
    if (state && !askContinue) boardRef.current?.focus({ preventScroll: true });
  }, [state, askContinue]);

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
        <Select value={String(size)} onValueChange={(v) => startNew(Number(v))}>
          <SelectTrigger
            size="sm"
            className="rounded-full border-surface bg-card text-gold-soft"
            aria-label={dict.game.size}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-surface bg-card">
            <SelectItem value="3">3 × 3</SelectItem>
            <SelectItem value="4">4 × 4</SelectItem>
            <SelectItem value="5">5 × 5</SelectItem>
          </SelectContent>
        </Select>
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
    <GameShell locale={locale} dict={dict} title={dict.games.fifteen.name} toolbar={toolbar}>
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
              ref={boardRef}
              tabIndex={0}
              onKeyDown={onBoardKeyDown}
              style={{ gridTemplateColumns: `repeat(${size}, 1fr)` }}
              role="grid"
              aria-label={dict.games.fifteen.name}
            >
              {state.board.map((tile, index) =>
                tile === 0 ? (
                  <div key="empty" role="gridcell" aria-hidden />
                ) : (
                  <motion.button
                    key={tile}
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 34 }}
                    onClick={() => {
                      if (move(index)) haptics.tap();
                    }}
                    role="gridcell"
                    className={`grid place-items-center rounded-md font-display font-medium select-none
                      ${size === 5 ? "text-lg sm:text-xl" : "text-xl sm:text-2xl"}
                      ${
                        tile === goal[index]
                          ? "bg-surface text-gold"
                          : "bg-muted text-gold-soft"
                      }
                      transition-colors hover:bg-surface active:scale-[0.97]`}
                  >
                    {tile}
                  </motion.button>
                ),
              )}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winFifteen}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew(size)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}
