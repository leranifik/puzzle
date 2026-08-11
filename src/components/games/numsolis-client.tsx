"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Undo2 } from "lucide-react";
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
  type NumsolisDifficulty,
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

const cardClass: Record<NumsolisColor, string> = {
  amber: "bg-primary text-primary-foreground",
  ivory: "bg-secondary text-secondary-foreground",
  slate: "bg-muted text-gold-soft",
  umber: "bg-surface text-gold-soft",
};

const CARD_STEP = 46;
const DRAG_THRESHOLD = 7;

type DragState = {
  from: number;
  start: number;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
};

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const {
    state,
    won,
    selectedColumn,
    selectedStart,
    history,
    revision,
    select,
    move,
    undo,
    newGame,
    init,
    tick,
  } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
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
    if (!restored || numsolisProgress(restored) >= 1) store.newGame("medium");
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  useEffect(() => {
    if (revision === 0) return;
    const current = useNumsolisStore.getState().state;
    if (!current || useNumsolisStore.getState().won) return;
    queueSave(serializeNumsolis(current), numsolisProgress(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision]);

  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "numsolis",
      moves: state.moves,
      seconds: state.seconds,
      meta: { difficulty: state.difficulty },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(() => {
    if (state && !askContinue) boardRef.current?.focus({ preventScroll: true });
  }, [state, askContinue]);

  const startNew = (difficulty: NumsolisDifficulty = state?.difficulty ?? "medium") => {
    resultPosted.current = false;
    clearSave();
    newGame(difficulty);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame("medium");
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const commitMove = (from: number, to: number, start: number) => {
    if (!state || !canMoveNumsolis(state, from, to, start)) return false;
    if (!move(from, to, start)) return false;
    haptics.tap();
    return true;
  };

  const chooseCard = (column: number, start: number) => {
    if (!state || won) return;
    if (selectedColumn === null || selectedStart === null) {
      select(column, start);
      haptics.tap();
      return;
    }
    if (selectedColumn === column) {
      select(column, start);
      return;
    }
    if (!commitMove(selectedColumn, column, selectedStart)) select(column, start);
  };

  const chooseEmptyColumn = (column: number) => {
    if (!state || won || selectedColumn === null || selectedStart === null) return;
    commitMove(selectedColumn, column, selectedStart);
  };

  const onPointerDown = (event: React.PointerEvent, from: number, start: number) => {
    if (!state || won) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDrag({
      from,
      start,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: 0,
      y: 0,
    });
  };

  const onBoardPointerMove = (event: React.PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag((current) =>
      current
        ? { ...current, x: event.clientX - current.originX, y: event.clientY - current.originY }
        : null,
    );
  };

  const columnAtPoint = (clientX: number, clientY: number): number => {
    const board = boardRef.current;
    if (!board) return -1;
    const columns = board.querySelectorAll<HTMLElement>("[data-numsolis-column]");
    for (const column of columns) {
      const rect = column.getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return Number(column.dataset.numsolisColumn);
      }
    }
    return -1;
  };

  const onBoardPointerUp = (event: React.PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId || !state) return;
    const distance = Math.hypot(drag.x, drag.y);
    const to = columnAtPoint(event.clientX, event.clientY);

    if (distance < DRAG_THRESHOLD) {
      chooseCard(drag.from, drag.start);
    } else if (Number.isInteger(to) && to >= 0 && to < state.columns.length && to !== drag.from) {
      commitMove(drag.from, to, drag.start);
    }
    setDrag(null);
  };

  const onBoardPointerCancel = () => setDrag(null);

  const onBoardKeyDown = (event: React.KeyboardEvent) => {
    if (!state || won || selectedColumn === null || selectedStart === null) return;
    if (event.key === "Escape") {
      event.preventDefault();
      select(null);
      return;
    }
    if (!event.key.startsWith("Arrow")) return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    const target = selectedColumn + delta;
    if (target >= 0 && target < state.columns.length) commitMove(selectedColumn, target, selectedStart);
  };

  const handleUndo = () => {
    resultPosted.current = false;
    if (undo()) haptics.tap();
  };

  const difficulty = state?.difficulty ?? "medium";
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <SaveIndicator status={status} dict={dict} />
        <Select value={difficulty} onValueChange={(value) => startNew(value as NumsolisDifficulty)}>
          <SelectTrigger size="sm" className="rounded-full border-surface bg-card text-gold-soft" aria-label={dict.game.difficulty}>
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
          onClick={handleUndo}
          disabled={history.length === 0 || won}
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
          aria-label={dict.game.undo}
        >
          <Undo2 className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.undo}</span>
        </Button>
        <Button variant="outline" size="sm" onClick={() => startNew()} className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft">
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.newGame}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <GameShell locale={locale} dict={dict} title={dict.games.numsolis.name} toolbar={toolbar}>
      <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={() => startNew()} />
      <SyncDialog open={showSync} dict={dict} progress={remote?.progress ?? 0} onLoad={loadRemote} onKeep={keepMine} />

      <div className="relative mx-auto w-full max-w-3xl">
        <p className="mb-3 text-center font-body text-sm text-muted-foreground">{dict.game.numsolisHint}</p>
        {!state ? (
          <Skeleton className="h-[34rem] w-full rounded-lg bg-card" />
        ) : (
          <>
            <div
              ref={boardRef}
              tabIndex={0}
              onKeyDown={onBoardKeyDown}
              onPointerMove={onBoardPointerMove}
              onPointerUp={onBoardPointerUp}
              onPointerCancel={onBoardPointerCancel}
              role="grid"
              aria-label={dict.games.numsolis.name}
              className="hairline relative grid min-h-[34rem] w-full touch-none grid-cols-6 items-start gap-1.5 overflow-hidden rounded-lg bg-card p-2 outline-none focus-visible:ring-2 focus-visible:ring-gold/40 sm:gap-2 sm:p-3"
            >
              {state.columns.map((column, columnIndex) => {
                const selectedFrom = selectedColumn === columnIndex ? selectedStart : null;
                return (
                  <div
                    key={columnIndex}
                    data-numsolis-column={columnIndex}
                    role="gridcell"
                    className="relative min-h-[31rem] min-w-0 rounded-md bg-background/15"
                  >
                    {column.map((card, cardIndex) => {
                      const isSelected = selectedFrom !== null && selectedFrom !== undefined && cardIndex >= selectedFrom;
                      const isDragged = drag?.from === columnIndex && cardIndex >= drag.start;
                      const z = isDragged ? 100 + cardIndex : cardIndex + 1;
                      return (
                        <motion.button
                          key={card.id}
                          layout="position"
                          type="button"
                          onPointerDown={(event) => onPointerDown(event, columnIndex, cardIndex)}
                          aria-pressed={isSelected}
                          aria-label={`${card.value} · ${dict.game.numsolisCard}`}
                          className={`absolute left-0 flex h-16 w-full items-start justify-center rounded-md border border-foreground/10 pt-2 font-display text-sm font-semibold tabular-nums shadow-md select-none sm:text-lg ${cardClass[card.color]} ${isSelected ? "ring-2 ring-gold ring-inset" : ""}`}
                          style={{
                            top: cardIndex * CARD_STEP,
                            zIndex: z,
                            x: isDragged ? drag.x : 0,
                            y: isDragged ? drag.y : 0,
                          }}
                          animate={{ scale: isDragged ? 1.035 : 1, rotate: isDragged ? 0.5 : 0 }}
                          transition={{ type: "spring", stiffness: 430, damping: 32 }}
                        >
                          {card.value}
                        </motion.button>
                      );
                    })}

                    {column.length === 0 && (
                      <button
                        type="button"
                        data-numsolis-column={columnIndex}
                        onClick={() => chooseEmptyColumn(columnIndex)}
                        aria-label={dict.game.numsolisEmptyColumn}
                        className="absolute inset-x-0 top-0 h-16 rounded-md border border-dashed border-surface bg-background/20"
                      />
                    )}

                    <div
                      className="absolute inset-x-1 bottom-2 border-t border-gold/50 pt-1 text-center label-mono text-muted-foreground"
                      aria-label={dict.game.numsolisStackLimit}
                    >
                      {column.length}/{NUMSOLIS_STACK_LIMIT}
                    </div>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {won && (
                <WinOverlay dict={dict} text={dict.game.winNumsolis} moves={state.moves} seconds={state.seconds} onPlayAgain={() => startNew()} />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}
