"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  deserialize2048,
  serialize2048,
  progress2048,
  boardOf,
  type Direction,
} from "@/lib/games/g2048";
import { use2048Store } from "@/stores/g2048-store";
import { useAutosave } from "@/hooks/use-autosave";
import { useRemoteWatch } from "@/hooks/use-remote-watch";
import { haptics } from "@/lib/telegram-client";
import { GameShell, SaveIndicator, formatTime } from "@/components/games/game-shell";
import { ContinueDialog } from "@/components/games/continue-dialog";
import { SyncDialog } from "@/components/games/sync-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const TILE_STYLES: Record<number, string> = {
  2: "bg-muted text-muted-foreground",
  4: "bg-muted text-gold-soft",
  8: "bg-surface text-gold-soft",
  16: "bg-surface text-gold",
  32: "bg-gold/25 text-gold-soft",
  64: "bg-gold/40 text-gold-soft",
  128: "bg-gold/55 text-primary-foreground",
  256: "bg-gold/70 text-primary-foreground",
  512: "bg-gold/85 text-primary-foreground",
  1024: "bg-gold text-primary-foreground",
  2048: "bg-gold-soft text-primary-foreground shadow-[0_0_24px_rgba(255,232,184,0.45)]",
};

function tileClass(value: number): string {
  return TILE_STYLES[value] ?? "bg-gold-soft text-primary-foreground";
}

/**
 * Board geometry: tiles are absolutely positioned by (r, c) in percentages,
 * so framer-motion animates genuine sliding between cells.
 * GAP is the gutter as a fraction of the board width.
 */
const GAP_FRAC = 0.02;
const CELL_FRAC = (1 - GAP_FRAC * 5) / 4;
const pos = (i: number) => `${(GAP_FRAC + i * (CELL_FRAC + GAP_FRAC)) * 100}%`;
const cellSize = `${CELL_FRAC * 100}%`;

export function G2048Client({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, dismissedWin, init, newGame, move, prune, keepGoing, tick } = use2048Store();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("g2048");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const resultPosted = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const pruneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  const saveQuery = useQuery({
    queryKey: ["save", "g2048"],
    queryFn: () => api.loadSave("g2048"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rawSave = saveQuery.data?.save?.state ?? null;
  const restorable = (() => {
    const restored = rawSave ? deserialize2048(rawSave) : null;
    return restored && !restored.over ? restored : null;
  })();

  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  // Live watch: someone saved this game from another device.
  const remote = useRemoteWatch({
    game: "g2048",
    enabled: !!state && !state.over && !askContinue,
    syncedAt,
  });
  const remoteRestored = remote ? deserialize2048(remote.state) : null;
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
    const s = use2048Store.getState().state;
    if (s) queueSave(serialize2048(s), progress2048(s));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = use2048Store.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserialize2048(raw) : null;
    if (!restored || restored.over) store.newGame();
  }, [saveQuery.isSuccess, saveQuery.data]);

  // Game clock.
  useEffect(() => {
    if (!state || state.over) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, tick]);

  // Autosave on moves only.
  useEffect(() => {
    const s = use2048Store.getState().state;
    if (!s || s.moves === 0) return;
    queueSave(serialize2048(s), progress2048(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.moves]);

  // Record the win once the 2048 tile appears (this is the "result" for the
  // admin stats even if the player keeps going afterwards).
  useEffect(() => {
    if (!state?.reached2048 || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    void api.postResult({
      game: "g2048",
      moves: state.moves,
      seconds: state.seconds,
      meta: {
        score: state.score,
        best: state.best,
        maxTile: Math.max(...boardOf(state.tiles), 0),
        reached2048: true,
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.reached2048]);

  // When the board locks up: clear the save; record the result unless the
  // win was already recorded above (one result per game).
  useEffect(() => {
    if (!state?.over) return;
    haptics.error();
    clearSave();
    if (!resultPosted.current) {
      resultPosted.current = true;
      void api.postResult({
        game: "g2048",
        moves: state.moves,
        seconds: state.seconds,
        meta: {
          score: state.score,
          best: state.best,
          maxTile: Math.max(...boardOf(state.tiles), 0),
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.over]);

  useEffect(() => () => {
    if (pruneTimer.current) clearTimeout(pruneTimer.current);
  }, []);

  const doMove = (direction: Direction) => {
    const outcome = move(direction);
    if (outcome === "none") return;
    if (outcome === "merged") haptics.impact();
    else haptics.tap();
    // Remove absorbed tiles after their slide animation finishes.
    if (pruneTimer.current) clearTimeout(pruneTimer.current);
    pruneTimer.current = setTimeout(() => prune(), 220);
  };

  // Keyboard controls are scoped to the focused board (clicking outside the
  // board returns arrow keys to normal page scrolling).
  const KEY_DIRS: Record<string, Direction> = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  };
  const onBoardKeyDown = (e: React.KeyboardEvent) => {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault();
    doMove(dir);
  };

  // Autofocus the board once the game is ready, so arrows work immediately.
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

  const onPointerDown = (e: React.PointerEvent) => {
    touchStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!touchStart.current) return;
    const dx = e.clientX - touchStart.current.x;
    const dy = e.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0 ? "right" : "left"
        : dy > 0 ? "down" : "up",
    );
  };

  const showWin = !!state?.reached2048 && !dismissedWin;

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
    <GameShell locale={locale} dict={dict} title={dict.games.g2048.name} toolbar={toolbar}>
      <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={startNew} />
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
              ref={boardRef}
              tabIndex={0}
              onKeyDown={onBoardKeyDown}
              className="hairline relative aspect-square w-full cursor-grab touch-none select-none rounded-lg bg-card shadow-xl shadow-black/40 outline-none focus-visible:ring-2 focus-visible:ring-gold/40 active:cursor-grabbing"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              role="application"
              aria-label="2048"
            >
              {/* static cell placeholders */}
              {Array.from({ length: 16 }, (_, i) => (
                <div
                  key={i}
                  className="absolute rounded-md bg-muted/40"
                  style={{
                    top: pos(Math.floor(i / 4)),
                    left: pos(i % 4),
                    width: cellSize,
                    height: cellSize,
                  }}
                />
              ))}

              {/* tiles: keyed by stable id, animated by (r, c) */}
              <AnimatePresence>
                {[...state.tiles]
                  .sort((a, b) => a.id - b.id)
                  .map((tile) => (
                    <motion.div
                      key={tile.id}
                      initial={{ scale: tile.merged ? 1 : 0, top: pos(tile.r), left: pos(tile.c) }}
                      animate={{
                        scale: tile.merged ? [1, 1.18, 1] : 1,
                        top: pos(tile.r),
                        left: pos(tile.c),
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.08 } }}
                      transition={{
                        top: { type: "tween", duration: 0.16, ease: [0.3, 0.8, 0.4, 1] },
                        left: { type: "tween", duration: 0.16, ease: [0.3, 0.8, 0.4, 1] },
                        scale: tile.merged
                          ? { duration: 0.22, times: [0, 0.6, 1], delay: 0.1 }
                          : { type: "spring", stiffness: 480, damping: 30, delay: 0.06 },
                      }}
                      className={`absolute grid place-items-center rounded-md font-display font-medium ${
                        tile.value >= 1024
                          ? "text-lg sm:text-xl"
                          : tile.value >= 128
                            ? "text-xl sm:text-2xl"
                            : "text-2xl sm:text-3xl"
                      } ${tileClass(tile.value)} ${tile.dying ? "z-0" : "z-10"}`}
                      style={{ width: cellSize, height: cellSize }}
                    >
                      {tile.value}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>

            {/* Win / game-over overlays — OUTSIDE the board element: the board
                captures pointers for swipes and would swallow button clicks. */}
            <AnimatePresence>
              {(showWin || state.over) && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/85 backdrop-blur-sm"
                >
                  <div className="hairline mx-4 flex flex-col items-center rounded-lg bg-card px-8 py-8 text-center shadow-2xl shadow-black/50">
                    <h2 className="font-display text-2xl font-medium text-foreground">
                      {state.over ? dict.game.gameOver : dict.game.youWon}
                    </h2>
                    <p className="font-body mt-1.5 text-sm text-muted-foreground">
                      {state.over ? dict.game.gameOverText : dict.game.win2048}
                    </p>
                    <p className="label-mono mt-4 text-gold-soft">
                      {dict.game.scoreLabel}: {state.score} · {formatTime(state.seconds)}
                    </p>
                    <div className="mt-6 flex gap-2">
                      {!state.over && (
                        <Button
                          variant="outline"
                          onClick={keepGoing}
                          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface"
                        >
                          {dict.game.keepGoing}
                        </Button>
                      )}
                      <Button onClick={startNew} className="rounded-full bg-gold px-6 text-primary-foreground hover:bg-gold/90">
                        {dict.game.playAgain}
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <p className="label-mono mt-4 text-center text-muted-foreground">
              {dict.game.swipeHint}
            </p>
          </>
        )}
      </div>
    </GameShell>
  );
}
