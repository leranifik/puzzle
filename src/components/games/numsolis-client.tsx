"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Combine,
  Layers3,
  LockKeyhole,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  NUMSOLIS_COLUMN_COUNT,
  canMoveNumsolis,
  deserializeNumsolis,
  numsolisCardCount,
  numsolisProgress,
  serializeNumsolis,
  type NumsolisCard,
  type NumsolisColor,
  type NumsolisColorCount,
  type NumsolisMoveOutcome,
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

const COLOR_STYLES: Record<NumsolisColor, { card: string; mark: string }> = {
  amber: {
    card: "border-gold bg-surface text-gold",
    mark: "bg-gold",
  },
  ivory: {
    card: "border-gold-soft bg-gold-soft text-primary-foreground",
    mark: "bg-primary-foreground",
  },
};

type SelectedPacket = {
  column: number;
  index: number;
};

type DragStart = SelectedPacket & {
  pointerId: number;
  x: number;
  y: number;
};

function CardFace({
  card,
  exposed,
  selected,
  packetBase,
  legalTarget,
  pulsing,
  label,
  onClick,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: NumsolisCard;
  exposed: boolean;
  selected: boolean;
  packetBase: boolean;
  legalTarget: boolean;
  pulsing: boolean;
  label: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const style = COLOR_STYLES[card.color];

  return (
    <motion.button
      layout
      layoutId={`numsolis-card-${card.id}`}
      type="button"
      role="gridcell"
      aria-label={label}
      aria-selected={selected}
      data-numsolis-card
      data-exposed={exposed || undefined}
      data-legal-target={legalTarget || undefined}
      className={`absolute inset-x-0 h-[var(--card-h)] touch-none overflow-hidden rounded-md border shadow-lg shadow-black/40 select-none ${style.card} ${
        packetBase
          ? "z-10 ring-2 ring-gold ring-offset-2 ring-offset-background"
          : selected
            ? "ring-1 ring-gold ring-offset-1 ring-offset-background"
            : ""
      } ${legalTarget ? "ring-2 ring-gold-soft ring-offset-1 ring-offset-background" : ""} cursor-grab active:cursor-grabbing`}
      initial={{ scale: 0.94 }}
      animate={
        pulsing
          ? { scale: [1, 1.2, 0.94, 1], y: [0, -5, 2, 0], rotate: [0, -1.5, 1.5, 0] }
          : { scale: 1, y: 0, rotate: 0 }
      }
      exit={{ scale: 0.78, y: -6 }}
      transition={
        pulsing
          ? { duration: 0.46, times: [0, 0.42, 0.72, 1], ease: [0.22, 1, 0.36, 1] }
          : { type: "spring", stiffness: 430, damping: 34 }
      }
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <span className={`absolute inset-x-0 top-0 z-10 h-1 ${style.mark}`} />
      <span className="absolute left-1.5 top-2 z-10 font-display text-[10px] font-semibold leading-none sm:left-2 sm:top-2.5 sm:text-xs">
        {card.value}
      </span>
      {exposed && (
        <span className="absolute inset-0 z-10 grid place-items-center pt-2 font-display text-base font-semibold tabular-nums sm:text-xl">
          {card.value}
        </span>
      )}
      <AnimatePresence>
        {pulsing && (
          <motion.span
            key="collapse-flash"
            className="pointer-events-none absolute inset-0 z-0 bg-gold-soft"
            initial={{ opacity: 0.9, scale: 0.35 }}
            animate={{ opacity: 0, scale: 1.45 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            aria-hidden
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const {
    state,
    won,
    canUndo,
    revision,
    init,
    newGame,
    move,
    undo,
    tick,
  } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [selected, setSelected] = useState<SelectedPacket | null>(null);
  const [dragPoint, setDragPoint] = useState<{ x: number; y: number } | null>(null);
  const [pulseId, setPulseId] = useState<number | null>(null);
  const resultPosted = useRef(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<DragStart | null>(null);
  const dragging = useRef(false);
  const suppressClick = useRef(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setSelected(null);
    setPulseId(null);
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
    if (!restored || numsolisProgress(restored) >= 1) store.newGame(2);
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // `revision` changes only after a move or undo, never on timer ticks.
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
      meta: { cards: state.initialCards, colors: state.colorCount },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(
    () => () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    },
    [],
  );

  const startNew = (colorCount: NumsolisColorCount) => {
    resultPosted.current = false;
    setSelected(null);
    setDragPoint(null);
    setPulseId(null);
    clearSave();
    newGame(colorCount);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame(2);
    setSelected(null);
    setPulseId(null);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const performMove = (
    from: number,
    to: number,
    fromIndex: number,
  ): NumsolisMoveOutcome => {
    const outcome = move(from, to, fromIndex);
    if (outcome === "none") return outcome;

    setSelected(null);
    if (outcome === "moved") {
      haptics.tap();
    } else {
      haptics.impact();
      const mergedId = useNumsolisStore.getState().lastMergedCardId;
      if (mergedId !== null) {
        setPulseId(mergedId);
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulseId(null), 500);
      }
    }
    return outcome;
  };

  const handleUndo = () => {
    if (!undo()) return;
    setSelected(null);
    setDragPoint(null);
    setPulseId(null);
    haptics.select();
  };

  const handleCardClick = (
    column: number,
    index: number,
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!state || won) return;

    if (!selected || selected.column === column) {
      if (selected?.column === column && selected.index === index) {
        setSelected(null);
      } else {
        setSelected({ column, index });
        haptics.select();
      }
      return;
    }

    if (performMove(selected.column, column, selected.index) === "none") {
      haptics.error();
      setSelected({ column, index });
    }
  };

  const handleColumnClick = (column: number) => {
    if (!state || won || !selected) return;
    // Only an empty locked column can receive a click outside a card.
    if (state.columns[column].length === 0) haptics.error();
  };

  const handlePointerDown = (
    column: number,
    index: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    if (won) return;
    dragStart.current = {
      pointerId: event.pointerId,
      column,
      index,
      x: event.clientX,
      y: event.clientY,
    };
    dragging.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!dragging.current && distance < 7) return;
    if (!dragging.current) {
      dragging.current = true;
      setSelected({ column: start.column, index: start.index });
    }
    setDragPoint({ x: event.clientX, y: event.clientY });
  };

  const finishPointer = (event: React.PointerEvent<HTMLButtonElement>, cancelled = false) => {
    const start = dragStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const wasDragging = dragging.current;
    dragStart.current = null;
    dragging.current = false;
    setDragPoint(null);

    if (!wasDragging) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (cancelled) return;

    const rect = boardRef.current?.getBoundingClientRect();
    if (
      !rect ||
      event.clientX < rect.left ||
      event.clientX >= rect.right ||
      event.clientY < rect.top ||
      event.clientY >= rect.bottom
    ) {
      setSelected({ column: start.column, index: start.index });
      return;
    }
    const target = Math.min(
      NUMSOLIS_COLUMN_COUNT - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * NUMSOLIS_COLUMN_COUNT),
    );
    if (
      target === start.column ||
      performMove(start.column, target, start.index) === "none"
    ) {
      setSelected({ column: start.column, index: start.index });
      if (target !== start.column) haptics.error();
    }
  };

  const cardsLeft = state ? numsolisCardCount(state) : 0;
  const colorCount = state?.colorCount ?? 2;
  const selectedCard =
    state && selected ? state.columns[selected.column][selected.index] : null;
  const selectedPacketSize =
    state && selected ? state.columns[selected.column].length - selected.index : 0;

  const toolbar = (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 sm:gap-4">
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.moves}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">
            {state?.moves ?? 0}
          </p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.cards}</p>
          <p className="font-display text-xl font-medium tabular-nums text-gold">
            {cardsLeft}
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

      <div className="flex flex-wrap items-center justify-end gap-2">
        <SaveIndicator status={status} dict={dict} />
        <Select
          value={String(colorCount)}
          onValueChange={(value) => startNew(Number(value) as NumsolisColorCount)}
        >
          <SelectTrigger
            size="sm"
            className="rounded-full border-surface bg-card text-gold-soft"
            aria-label={dict.game.numsolisColorCount}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-surface bg-card">
            <SelectItem value="1">{dict.game.numsolisOneColor}</SelectItem>
            <SelectItem value="2">{dict.game.numsolisTwoColors}</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={!canUndo}
          aria-label={dict.game.undo}
          className="rounded-full border-surface bg-card text-gold-soft hover:bg-surface hover:text-gold-soft disabled:opacity-40"
        >
          <Undo2 className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.undo}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => startNew(colorCount)}
          aria-label={dict.game.newGame}
          className="rounded-full border-surface bg-card text-gold-soft hover:bg-surface hover:text-gold-soft"
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
        onNew={() => startNew(2)}
      />
      <SyncDialog
        open={showSync}
        dict={dict}
        progress={remote?.progress ?? 0}
        onLoad={loadRemote}
        onKeep={keepMine}
      />

      <section className="mb-4 rounded-lg border border-surface bg-card px-3 py-3 sm:px-4">
        <p className="label-mono text-gold">{dict.game.numsolisRulesTitle}</p>
        <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
          <p className="font-body flex gap-2 leading-relaxed">
            <Combine className="mt-0.5 size-3.5 shrink-0 text-gold" />
            {dict.game.numsolisRuleMerge}
          </p>
          <p className="font-body flex gap-2 leading-relaxed">
            <ArrowDownToLine className="mt-0.5 size-3.5 shrink-0 text-gold" />
            {dict.game.numsolisRuleHigher}
          </p>
          <p className="font-body flex gap-2 leading-relaxed">
            <Layers3 className="mt-0.5 size-3.5 shrink-0 text-gold" />
            {dict.game.numsolisRuleLimit}
          </p>
        </div>
      </section>

      <div className="relative mx-auto w-full max-w-xl">
        {!state ? (
          <Skeleton className="h-[28rem] w-full rounded-lg bg-card" />
        ) : (
          <>
            <LayoutGroup id="numsolis-board">
              <div
                ref={boardRef}
                role="grid"
                aria-label={dict.games.numsolis.name}
                className="hairline relative w-full overflow-hidden rounded-lg bg-card shadow-xl shadow-black/40 outline-none [--card-h:4.5rem] [--card-step:2.35rem] sm:[--card-h:6.25rem] sm:[--card-step:2.8rem]"
                style={{ height: "calc(var(--card-step) * 8 + var(--card-h) + 2.5rem)" }}
              >
                <div
                  className="pointer-events-none absolute inset-x-3 z-0 border-t border-dashed border-gold"
                  style={{ top: "calc(0.75rem + var(--card-step) * 8 + var(--card-h) + 0.35rem)" }}
                  data-stack-limit
                >
                  <span className="label-mono absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[9px] text-gold">
                    {dict.game.numsolisLimit}
                  </span>
                </div>

                <div className="absolute inset-x-3 bottom-3 top-3 grid grid-cols-6 gap-1.5 sm:gap-2">
                  {state.columns.map((column, columnIndex) => {
                    const legalTarget =
                      selected !== null &&
                      selected.column !== columnIndex &&
                      canMoveNumsolis(
                        state,
                        selected.column,
                        columnIndex,
                        selected.index,
                      );
                    return (
                      <div
                        key={columnIndex}
                        data-numsolis-column
                        className="relative min-w-0"
                        onClick={() => handleColumnClick(columnIndex)}
                      >
                        {column.length === 0 && (
                          <div
                            data-numsolis-locked
                            className="absolute inset-x-0 top-0 flex h-[var(--card-h)] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-surface bg-muted text-muted-foreground"
                            aria-label={dict.game.numsolisLocked}
                          >
                            <LockKeyhole className="size-4 sm:size-5" />
                            <span className="label-mono hidden text-[8px] sm:block">
                              {dict.game.numsolisLocked}
                            </span>
                          </div>
                        )}
                        <AnimatePresence initial={false}>
                          {column.map((card, cardIndex) => {
                            const exposed = cardIndex === column.length - 1;
                            const inSelectedPacket =
                              selected?.column === columnIndex && cardIndex >= selected.index;
                            const packetBase =
                              selected?.column === columnIndex && cardIndex === selected.index;
                            const colorName = dict.game.numsolisColors[card.color];
                            return (
                              <div
                                key={card.id}
                                className="absolute inset-x-0"
                                style={{
                                  top: `calc(var(--card-step) * ${cardIndex})`,
                                  zIndex: cardIndex + 1,
                                }}
                              >
                                <CardFace
                                  card={card}
                                  exposed={exposed}
                                  selected={inSelectedPacket}
                                  packetBase={packetBase}
                                  legalTarget={exposed && legalTarget}
                                  pulsing={pulseId === card.id}
                                  label={`${colorName} ${card.value}`}
                                  onClick={(event) =>
                                    handleCardClick(columnIndex, cardIndex, event)
                                  }
                                  onPointerDown={(event) =>
                                    handlePointerDown(columnIndex, cardIndex, event)
                                  }
                                  onPointerMove={handlePointerMove}
                                  onPointerUp={(event) => finishPointer(event)}
                                  onPointerCancel={(event) => finishPointer(event, true)}
                                />
                              </div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              </div>
            </LayoutGroup>

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winNumsolis}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew(colorCount)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>

      <p className="label-mono mt-3 text-center text-[10px] text-muted-foreground">
        {dict.game.numsolisHint}
      </p>

      <AnimatePresence>
        {dragPoint && selectedCard && (
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0.9 }}
            className={`pointer-events-none fixed z-50 grid h-20 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border font-display text-sm font-semibold shadow-2xl shadow-black/60 ${COLOR_STYLES[selectedCard.color].card}`}
            style={{ left: dragPoint.x, top: dragPoint.y }}
            aria-hidden
          >
            <span className={`absolute inset-x-0 top-0 h-1 ${COLOR_STYLES[selectedCard.color].mark}`} />
            {selectedCard.value}
            {selectedPacketSize > 1 && (
              <span className="label-mono absolute -bottom-2 -right-2 grid size-7 place-items-center rounded-full bg-gold text-[9px] text-primary-foreground shadow-lg">
                ×{selectedPacketSize}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
