"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Ban, Check, LockKeyhole } from "lucide-react";
import type { Dictionary } from "@/i18n/get-dictionary";
import { canMove, type NumsolisCard, type NumsolisColumns, type NumsolisMove, type NumsolisState } from "@/lib/games/numsolis";

type Selection = { from: number; index: number; columns: NumsolisColumns };
type Gesture = Selection & { pointerId: number; startX: number; startY: number; dragged: boolean };
type Drag = Selection & { dx: number; dy: number; over: number };
const BAND = 44;
const CARD_HEIGHT = 78;

function cardClass(card: NumsolisCard) {
  return card.suit === 0
    ? "bg-gold-soft text-primary-foreground"
    : "bg-gold text-primary-foreground";
}

function CardFace({ card }: { card: NumsolisCard }) {
  return <>
    <span className="font-display absolute inset-x-0 top-3 block text-center text-[19px] leading-[1.2] font-medium tabular-nums max-[350px]:text-[18px]">{card.value}</span>
    <span aria-hidden className={`absolute top-[5px] right-[5px] size-[5px] rounded-full ${card.suit === 1 ? "bg-current" : "border border-current"}`} />
  </>;
}

export function NumsolisBoard({ state, copy, disabled = false, onMove }: {
  state: NumsolisState;
  copy: Dictionary["numsolis"];
  disabled?: boolean;
  onMove: (move: NumsolisMove) => boolean;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [picked, setPicked] = useState<Selection | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [cursor, setCursor] = useState({ from: 0, index: 0 });
  const hintId = useId();
  // Any external board replacement invalidates an in-progress gesture without
  // effects that could race a remote load, Undo, or a new deal.
  const selected = !disabled && picked?.columns === state.columns ? picked : null;
  const activeDrag = !disabled && drag?.columns === state.columns ? drag : null;

  useEffect(() => { boardRef.current?.focus({ preventScroll: true }); }, []);

  function cancel() {
    gesture.current = null;
    setDrag(null);
    setPicked(null);
  }

  function place(from: Selection, to: number) {
    if (canMove(state, { from: from.from, index: from.index, to })) {
      onMove({ from: from.from, index: from.index, to });
    }
    cancel();
  }

  function activate(from: number, index: number) {
    if (disabled) return;
    if (selected && selected.from !== from) place(selected, from);
    else if (selected?.from === from && selected.index === index) cancel();
    else if (state.columns[from]?.[index]) setPicked({ from, index, columns: state.columns });
  }

  function targetAt(x: number, y: number) {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || x < rect.left || x >= rect.right || y < rect.top || y > rect.bottom) return -1;
    return Math.min(5, Math.floor((x - rect.left) / (rect.width / 6)));
  }

  function pointerDown(event: PointerEvent, from: number, index: number) {
    if (disabled || event.button !== 0 || gesture.current) return;
    event.preventDefault();
    boardRef.current?.focus({ preventScroll: true });
    boardRef.current?.setPointerCapture(event.pointerId);
    gesture.current = { from, index, columns: state.columns, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragged: false };
    setCursor({ from, index });
  }

  function pointerMove(event: PointerEvent) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId || start.columns !== state.columns || disabled) return;
    const dx = event.clientX - start.startX;
    const dy = event.clientY - start.startY;
    if (!start.dragged && Math.hypot(dx, dy) < 7) return;
    start.dragged = true;
    setPicked(start);
    setDrag({ ...start, dx, dy, over: targetAt(event.clientX, event.clientY) });
  }

  function pointerUp(event: PointerEvent) {
    const start = gesture.current;
    if (!start || start.pointerId !== event.pointerId) return;
    gesture.current = null;
    if (start.columns !== state.columns || disabled) { cancel(); return; }
    if (start.dragged) place(start, targetAt(event.clientX, event.clientY));
    else activate(start.from, start.index);
    if (boardRef.current?.hasPointerCapture(event.pointerId)) boardRef.current.releasePointerCapture(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") { event.preventDefault(); cancel(); return; }
    if (disabled) return;
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-card]");
    const current = button ? { from: Number(button.dataset.column), index: Number(button.dataset.index) } : cursor;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      activate(current.from, current.index);
      return;
    }
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let { from, index } = current;
    if (event.key === "ArrowLeft") from = Math.max(0, from - 1);
    if (event.key === "ArrowRight") from = Math.min(5, from + 1);
    if (event.key === "ArrowUp") index--;
    if (event.key === "ArrowDown") index++;
    if (event.key === "Home") index = 0;
    if (event.key === "End") index = state.columns[from].length - 1;
    index = Math.max(0, Math.min(index, state.columns[from].length - 1));
    setCursor({ from, index });
    const nextFocus = boardRef.current?.querySelector<HTMLElement>(`[data-column="${from}"][data-index="${index}"]`);
    (nextFocus ?? boardRef.current)?.focus({ preventScroll: true });
  }

  return <>
    <div
      ref={boardRef}
      role="group"
      tabIndex={0}
      aria-label={copy.boardLabel}
      aria-describedby={hintId}
      data-testid="numsolis-board"
      className="relative grid w-full touch-none grid-cols-6 gap-[var(--column-gap)] rounded-lg outline-none select-none [--column-gap:5px] focus-visible:ring-2 focus-visible:ring-gold/60"
      style={{ height: BAND * 8 + CARD_HEIGHT }}
      onKeyDown={onKeyDown}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) cancel(); }}
      onPointerMove={pointerMove}
      onPointerUp={pointerUp}
      onPointerCancel={cancel}
      onLostPointerCapture={() => { if (gesture.current) cancel(); }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {state.columns.map((column, from) => {
        const legal = selected && canMove(state, { from: selected.from, index: selected.index, to: from });
        const over = activeDrag?.over === from && activeDrag.from !== from;
        return <div
          key={from}
          data-testid={`numsolis-column-${from}`}
          className={`relative min-w-0 rounded-lg ${selected && from !== selected.from ? legal ? "ring-1 ring-gold/60" : "opacity-65" : ""} ${over ? legal ? "bg-gold/10 ring-2 ring-gold" : "ring-2 ring-destructive" : ""}`}
          aria-label={copy.columnLabel.replace("{column}", String(from + 1))}
          onClick={(event) => { if (event.target === event.currentTarget && selected) place(selected, from); }}
        >
          {!column.length && <span className="absolute inset-0 flex items-end justify-center pb-4 text-muted-foreground/50" title={copy.closedColumn}><LockKeyhole aria-label={copy.closedColumn} className="size-4" /></span>}
          {column.map((card, index) => {
            const lifted = activeDrag?.from === from && index >= activeDrag.index;
            const chosen = selected?.from === from && index >= selected.index;
            return <button
              key={card.id}
              type="button"
              data-card={card.id}
              data-column={from}
              data-index={index}
              data-value={card.value}
              data-suit={card.suit}
              aria-label={copy.cardLabel.replace("{value}", String(card.value)).replace("{suit}", card.suit === 0 ? copy.suitLight : copy.suitDark).replace("{column}", String(from + 1)).replace("{position}", String(index + 1))}
              aria-pressed={chosen}
              disabled={disabled}
              tabIndex={cursor.from === from && cursor.index === index ? 0 : -1}
              className={`absolute left-0 w-full cursor-grab rounded-lg border text-left outline-none active:cursor-grabbing focus-visible:ring-2 focus-visible:ring-foreground ${cardClass(card)} ${chosen ? "ring-2 ring-gold" : ""}`}
              style={{ top: index * BAND, height: CARD_HEIGHT, zIndex: index + 1, opacity: lifted ? 0 : 1, borderColor: "color-mix(in srgb, var(--background) 60%, transparent)", boxShadow: "0 2px 3px color-mix(in srgb, var(--background) 35%, transparent)" }}
              onPointerDown={(event) => pointerDown(event, from, index)}
              onClick={(event) => { if (event.detail === 0) activate(from, index); }}
            ><CardFace card={card} /></button>;
          })}
          {over && <span className={`pointer-events-none absolute -bottom-7 left-1/2 -translate-x-1/2 ${legal ? "text-gold" : "text-destructive"}`}>{legal ? <Check className="size-4" /> : <Ban className="size-4" />}</span>}
        </div>;
      })}
      {activeDrag && <div
        aria-hidden
        data-testid="numsolis-drag"
        className="pointer-events-none absolute z-30"
        style={{ left: `calc(${activeDrag.from} * (100% + var(--column-gap)) / 6)`, top: activeDrag.index * BAND, width: "calc((100% - 5 * var(--column-gap)) / 6)", transform: `translate(${activeDrag.dx}px, ${activeDrag.dy}px)` }}
      >{state.columns[activeDrag.from].slice(activeDrag.index).map((card, index) => <div key={card.id} className={`absolute w-full rounded-lg border border-background/60 shadow-xl ${cardClass(card)}`} style={{ top: index * BAND, height: CARD_HEIGHT }}><CardFace card={card} /></div>)}</div>}
    </div>
    <p id={hintId} className="sr-only" aria-live="polite">{selected ? copy.selectedHint : copy.keyboardHint}</p>
  </>;
}
