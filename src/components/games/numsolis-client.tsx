"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, Combine, Layers3, RotateCcw } from "lucide-react";
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

const COLOR_STYLES: Record<NumsolisColor, { card: string; mark: string; symbol: string }> = {
  amber: {
    card: "border-gold/75 bg-surface text-gold",
    mark: "bg-gold",
    symbol: "◆",
  },
  ivory: {
    card: "border-gold-soft/60 bg-gold-soft/10 text-gold-soft",
    mark: "bg-gold-soft",
    symbol: "●",
  },
  silver: {
    card: "border-muted-foreground/70 bg-muted text-foreground",
    mark: "bg-muted-foreground",
    symbol: "■",
  },
  ruby: {
    card: "border-destructive/70 bg-muted text-destructive",
    mark: "bg-destructive",
    symbol: "▲",
  },
};

type DragStart = {
  pointerId: number;
  column: number;
  x: number;
  y: number;
};

function CardFace({
  card,
  exposed,
  selected,
  legalTarget,
  pulsing,
  label,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: {
  card: NumsolisCard;
  exposed: boolean;
  selected: boolean;
  legalTarget: boolean;
  pulsing: boolean;
  label: string;
  onPointerDown?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerUp?: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerCancel?: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const style = COLOR_STYLES[card.color];
  const classes = `absolute inset-x-0 h-[var(--card-h)] overflow-hidden rounded-md border shadow-lg shadow-black/35 select-none ${style.card} ${
    exposed ? "cursor-grab touch-none active:cursor-grabbing" : "pointer-events-none"
  } ${selected ? "ring-2 ring-gold ring-offset-2 ring-offset-background" : ""} ${
    legalTarget ? "ring-2 ring-gold/45 ring-offset-1 ring-offset-background" : ""
  }`;

  const content = (
    <>
      <span className={`absolute inset-x-0 top-0 h-1 ${style.mark}`} />
      <span className="absolute left-1.5 top-2 font-display text-[10px] font-semibold leading-none sm:left-2 sm:top-2.5 sm:text-xs">
        {card.value}
      </span>
      <span className="absolute right-1.5 top-2 text-[8px] leading-none sm:right-2 sm:top-2.5 sm:text-[10px]">
        {style.symbol}
      </span>
      {exposed && (
        <span className="absolute inset-0 grid place-items-center pt-2 font-display text-base font-semibold tabular-nums sm:text-xl">
          {card.value}
        </span>
      )}
    </>
  );

  const motionProps = {
    layout: true,
    layoutId: `numsolis-card-${card.id}`,
    animate: { scale: pulsing ? [1, 1.09, 1] : 1, opacity: 1 },
    initial: { opacity: 0, scale: 0.9 },
    exit: { opacity: 0, scale: 0.75 },
    transition: {
      layout: { type: "spring" as const, stiffness: 430, damping: 34 },
      opacity: { duration: 0.15 },
      scale: pulsing ? { duration: 0.28, times: [0, 0.5, 1] } : { duration: 0.16 },
    },
  };

  return exposed ? (
    <motion.button
      {...motionProps}
      type="button"
      role="gridcell"
      aria-label={label}
      aria-selected={selected}
      className={classes}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {content}
    </motion.button>
  ) : (
    <motion.div {...motionProps} role="gridcell" aria-label={label} className={classes}>
      {content}
    </motion.div>
  );
}

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, init, newGame, move, tick } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("numsolis");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
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
    if (!current || current.moves === 0 || useNumsolisStore.getState().won) return;
    queueSave(serializeNumsolis(current), numsolisProgress(current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      meta: { cards: state.initialCards, colors: 4 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  useEffect(
    () => () => {
      if (pulseTimer.current) clearTimeout(pulseTimer.current);
    },
    [],
  );

  const startNew = () => {
    resultPosted.current = false;
    setSelected(null);
    setDragPoint(null);
    setPulseId(null);
    clearSave();
    newGame();
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame();
    setSelected(null);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const performMove = (from: number, to: number): NumsolisMoveOutcome => {
    const outcome = move(from, to);
    if (outcome === "none") return outcome;

    setSelected(null);
    if (outcome === "moved") {
      haptics.tap();
    } else {
      haptics.impact();
      const destination = useNumsolisStore.getState().state?.columns[to];
      const merged = destination?.[destination.length - 1];
      if (merged) {
        setPulseId(merged.id);
        if (pulseTimer.current) clearTimeout(pulseTimer.current);
        pulseTimer.current = setTimeout(() => setPulseId(null), 320);
      }
    }
    return outcome;
  };

  const handleColumnClick = (column: number) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (!state || won) return;
    if (selected === null) {
      if (state.columns[column].length > 0) {
        setSelected(column);
        haptics.select();
      }
      return;
    }
    if (selected === column) {
      setSelected(null);
      return;
    }
    if (performMove(selected, column) === "none") {
      haptics.error();
      if (state.columns[column].length > 0) setSelected(column);
    }
  };

  const handlePointerDown = (column: number, event: React.PointerEvent<HTMLButtonElement>) => {
    if (won) return;
    dragStart.current = {
      pointerId: event.pointerId,
      column,
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
      setSelected(start.column);
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
    // Pointer-up is normally followed by click in the same task. Clear the
    // guard afterwards as well, because a successful merge may unmount the
    // source button before that click can be dispatched.
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (cancelled) return;

    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || event.clientX < rect.left || event.clientX >= rect.right || event.clientY < rect.top || event.clientY >= rect.bottom) {
      setSelected(start.column);
      return;
    }
    const target = Math.min(
      NUMSOLIS_COLUMN_COUNT - 1,
      Math.floor(((event.clientX - rect.left) / rect.width) * NUMSOLIS_COLUMN_COUNT),
    );
    if (target === start.column || performMove(start.column, target) === "none") {
      setSelected(start.column);
      if (target !== start.column) haptics.error();
    }
  };

  const cardsLeft = state ? numsolisCardCount(state) : 0;
  const selectedCard =
    state && selected !== null
      ? state.columns[selected][state.columns[selected].length - 1]
      : null;

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

      <section className="mb-4 rounded-lg border border-surface/70 bg-card/60 px-3 py-3 sm:px-4">
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
                  className="pointer-events-none absolute inset-x-3 z-0 border-t border-dashed border-gold/55"
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
                      selected !== columnIndex &&
                      canMoveNumsolis(state, selected, columnIndex);
                    return (
                      <div
                        key={columnIndex}
                        data-numsolis-column
                        className="relative min-w-0"
                        onClick={() => handleColumnClick(columnIndex)}
                      >
                        <AnimatePresence initial={false}>
                          {column.map((card, cardIndex) => {
                            const exposed = cardIndex === column.length - 1;
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
                                  selected={exposed && selected === columnIndex}
                                  legalTarget={exposed && legalTarget}
                                  pulsing={pulseId === card.id}
                                  label={`${colorName} ${card.value}`}
                                  onPointerDown={
                                    exposed
                                      ? (event) => handlePointerDown(columnIndex, event)
                                      : undefined
                                  }
                                  onPointerMove={exposed ? handlePointerMove : undefined}
                                  onPointerUp={
                                    exposed ? (event) => finishPointer(event) : undefined
                                  }
                                  onPointerCancel={
                                    exposed ? (event) => finishPointer(event, true) : undefined
                                  }
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
                  onPlayAgain={startNew}
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 0.92, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`pointer-events-none fixed z-50 grid h-20 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-md border font-display text-sm font-semibold shadow-2xl shadow-black/60 ${COLOR_STYLES[selectedCard.color].card}`}
            style={{ left: dragPoint.x, top: dragPoint.y }}
            aria-hidden
          >
            <span className={`absolute inset-x-0 top-0 h-1 ${COLOR_STYLES[selectedCard.color].mark}`} />
            {selectedCard.value}
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}
