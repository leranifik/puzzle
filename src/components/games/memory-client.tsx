"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  deserializeMemory,
  serializeMemory,
  memoryProgress,
  type MemorySize,
} from "@/lib/games/memory";
import { useMemoryStore } from "@/stores/memory-store";
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

const SYMBOLS = ["◆", "●", "▲", "■", "★", "✚", "◐", "♥", "♠", "☾"];

export function MemoryClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, init, newGame, flip, hide, tick } = useMemoryStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("memory");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const resultPosted = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveQuery = useQuery({
    queryKey: ["save", "memory"],
    queryFn: () => api.loadSave("memory"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rawSave = saveQuery.data?.save?.state ?? null;
  const restorable = (() => {
    const restored = rawSave ? deserializeMemory(rawSave) : null;
    return restored && memoryProgress(restored) < 1 ? restored : null;
  })();

  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  // Live watch: someone saved this game from another device.
  const remote = useRemoteWatch({
    game: "memory",
    enabled: !!state && !won && !askContinue,
    syncedAt,
  });
  const remoteRestored = remote ? deserializeMemory(remote.state) : null;
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
    const s = useMemoryStore.getState().state;
    if (s) queueSave(serializeMemory(s), memoryProgress(s));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useMemoryStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeMemory(raw) : null;
    if (!restored || memoryProgress(restored) >= 1) store.newGame(16);
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // Autosave on move count changes (a move = a completed pair attempt).
  useEffect(() => {
    const s = useMemoryStore.getState().state;
    if (!s || s.moves === 0) return;
    queueSave(serializeMemory(s), memoryProgress(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.moves]);

  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "memory",
      moves: state.moves,
      seconds: state.seconds,
      meta: { size: state.size },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);

  const handleFlip = (index: number) => {
    const outcome = flip(index);
    if (outcome === "flip") haptics.tap();
    else if (outcome === "match") haptics.impact();
    else if (outcome === "miss") {
      haptics.error();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => hide(), 900);
    }
  };

  const startNew = (size: MemorySize) => {
    resultPosted.current = false;
    if (hideTimer.current) clearTimeout(hideTimer.current);
    clearSave();
    newGame(size);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame(16);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const size = state?.size ?? 16;
  const cols = size === 12 ? 3 : 4;
  const pairsFound = state ? state.matched.filter(Boolean).length / 2 : 0;

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
          <p className="label-mono text-muted-foreground">{dict.game.pairs}</p>
          <p className="font-display text-xl font-medium tabular-nums text-gold">
            {pairsFound}/{size / 2}
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
        <Select value={String(size)} onValueChange={(v) => startNew(Number(v) as MemorySize)}>
          <SelectTrigger
            size="sm"
            className="rounded-full border-surface bg-card text-gold-soft"
            aria-label={dict.game.size}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-surface bg-card">
            <SelectItem value="12">3 × 4</SelectItem>
            <SelectItem value="16">4 × 4</SelectItem>
            <SelectItem value="20">4 × 5</SelectItem>
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
    <GameShell locale={locale} dict={dict} title={dict.games.memory.name} toolbar={toolbar}>
      <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={() => startNew(16)} />
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
              className="hairline grid w-full gap-1.5 rounded-lg bg-card p-2 shadow-xl shadow-black/40 sm:gap-2 sm:p-3"
              style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
              role="grid"
              aria-label={dict.games.memory.name}
            >
              {state.deck.map((symbol, index) => {
                const faceUp = state.matched[index] || state.flipped.includes(index);
                return (
                  <button
                    key={index}
                    role="gridcell"
                    onClick={() => handleFlip(index)}
                    disabled={state.matched[index]}
                    className="aspect-square [perspective:600px]"
                    aria-label={faceUp ? SYMBOLS[symbol] : "?"}
                  >
                    <motion.div
                      className="relative size-full [transform-style:preserve-3d]"
                      animate={{ rotateY: faceUp ? 180 : 0 }}
                      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    >
                      {/* back */}
                      <div className="absolute inset-0 grid place-items-center rounded-md bg-muted [backface-visibility:hidden]">
                        <span className="font-display text-lg text-surface">?</span>
                      </div>
                      {/* face */}
                      <div
                        className={`absolute inset-0 grid place-items-center rounded-md [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                          state.matched[index]
                            ? "bg-gold/20 text-gold"
                            : "bg-surface text-gold-soft"
                        }`}
                      >
                        <span className="text-2xl sm:text-3xl">{SYMBOLS[symbol]}</span>
                      </div>
                    </motion.div>
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winMemory}
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
