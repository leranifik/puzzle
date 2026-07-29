"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowUpRight, RotateCcw, Eraser } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import {
  type FifteenState,
  newFifteen,
  moveTile,
  isSolved,
  solvedBoard,
} from "@/lib/games/fifteen";
import {
  type G2048State,
  type Direction,
  new2048,
  move2048,
  pruneDying,
} from "@/lib/games/g2048";
import {
  type MemoryState,
  newMemory,
  flipCard,
  hideMisses,
  isMemoryComplete,
} from "@/lib/games/memory";
import { haptics } from "@/lib/telegram-client";
import { Button } from "@/components/ui/button";

/* --------------------------- shared solved veil --------------------------- */

function DemoSolved({
  show,
  dict,
  onRestart,
  title,
}: {
  show: boolean;
  dict: Dictionary;
  onRestart: () => void;
  /** Overlay heading; defaults to the "Solved!" label. */
  title?: string;
}) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-20 grid place-items-center rounded-lg bg-background/80 backdrop-blur-sm"
        >
          <div className="flex flex-col items-center gap-3">
            <p className="font-display text-xl font-medium text-gold-soft">
              {title ?? dict.demo.solvedShort}
            </p>
            <Button
              size="sm"
              onClick={onRestart}
              className="rounded-full bg-gold text-primary-foreground hover:bg-gold/90"
            >
              <RotateCcw className="size-3.5" />
              {dict.game.playAgain}
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ----------------------------- Fifteen demo ----------------------------- */

/** Deterministic solvable start (hydration-safe); randomness only on restart. */
const FIFTEEN_START: FifteenState = {
  size: 3,
  board: [2, 3, 6, 1, 5, 0, 4, 7, 8],
  moves: 0,
  seconds: 0,
};

function DemoFifteen({ dict }: { dict: Dictionary }) {
  const [state, setState] = useState<FifteenState>(FIFTEEN_START);
  const goal = solvedBoard(3);
  const solved = isSolved(state.board);

  const handleMove = (index: number) => {
    const next = moveTile(state, index);
    if (next) {
      haptics.tap();
      setState(next);
    }
  };

  return (
    <div className="relative">
      <div className="hairline grid aspect-square w-full grid-cols-3 gap-1.5 rounded-lg bg-card p-2">
        {state.board.map((tile, index) =>
          tile === 0 ? (
            <div key="empty" />
          ) : (
            <motion.button
              key={tile}
              layout
              transition={{ type: "spring", stiffness: 500, damping: 34 }}
              onClick={() => handleMove(index)}
              className={`grid place-items-center rounded-md font-display text-xl font-medium select-none transition-colors hover:bg-surface active:scale-[0.97] ${
                tile === goal[index] ? "bg-surface text-gold" : "bg-muted text-gold-soft"
              }`}
            >
              {tile}
            </motion.button>
          ),
        )}
      </div>
      <DemoSolved show={solved} dict={dict} onRestart={() => setState(newFifteen(3))} />
    </div>
  );
}

/* ---------------------------- Mini sudoku 4x4 ---------------------------- */

/** Deterministic 4x4 grid (hydration-safe); digits get permuted on restart. */
const S4_SOLUTION = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
const S4_GIVEN = [true, false, true, false, false, true, false, true, true, false, true, false, false, true, false, true];

function shuffledSudoku4(): { solution: number[]; given: boolean[] } {
  const perm = [1, 2, 3, 4].sort(() => Math.random() - 0.5);
  return { solution: S4_SOLUTION.map((v) => perm[v - 1]), given: S4_GIVEN };
}

function DemoSudoku({ dict }: { dict: Dictionary }) {
  const [puzzle, setPuzzle] = useState({ solution: S4_SOLUTION, given: S4_GIVEN });
  const [cells, setCells] = useState<number[]>(
    S4_SOLUTION.map((v, i) => (S4_GIVEN[i] ? v : 0)),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const solved = cells.every((v, i) => v === puzzle.solution[i]);

  const input = (value: number) => {
    if (selected === null || puzzle.given[selected] || solved) return;
    const next = [...cells];
    next[selected] = value;
    setCells(next);
    if (value === 0) return;
    if (value === puzzle.solution[selected]) haptics.tap();
    else haptics.error();
  };

  // Keyboard scoped to the board: digits 1-4 fill, Backspace/0 erases,
  // arrows move the selection within the 4x4 grid.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key >= "1" && e.key <= "4") {
      input(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      input(0);
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (selected === null) {
        setSelected(5);
        return;
      }
      const row = Math.floor(selected / 4);
      const col = selected % 4;
      let next = selected;
      if (e.key === "ArrowLeft" && col > 0) next = selected - 1;
      else if (e.key === "ArrowRight" && col < 3) next = selected + 1;
      else if (e.key === "ArrowUp" && row > 0) next = selected - 4;
      else if (e.key === "ArrowDown" && row < 3) next = selected + 4;
      if (next !== selected) {
        setSelected(next);
        haptics.select();
      }
    }
  };

  const restart = () => {
    const fresh = shuffledSudoku4();
    setPuzzle(fresh);
    setCells(fresh.solution.map((v, i) => (fresh.given[i] ? v : 0)));
    setSelected(null);
  };

  return (
    <div className="relative">
      <div
        ref={boardRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="hairline grid aspect-square w-full grid-cols-4 overflow-hidden rounded-lg bg-card outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        role="grid"
        aria-label="Mini sudoku"
      >
        {cells.map((value, index) => {
          const row = Math.floor(index / 4);
          const col = index % 4;
          const given = puzzle.given[index];
          const wrong = !given && value !== 0 && value !== puzzle.solution[index];
          return (
            <button
              key={index}
              role="gridcell"
              onClick={() => {
                setSelected(index);
                haptics.select();
              }}
              className={[
                "grid place-items-center border-surface/60 font-display text-2xl select-none border-r border-b",
                col === 1 ? "border-r-2 border-r-gold/35" : "",
                row === 1 ? "border-b-2 border-b-gold/35" : "",
                col === 3 ? "border-r-0" : "",
                row === 3 ? "border-b-0" : "",
                selected === index ? "bg-gold/25" : "bg-transparent",
                given ? "text-foreground" : wrong ? "text-destructive" : "text-gold",
              ].join(" ")}
            >
              {value !== 0 ? value : ""}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <button
            key={n}
            onClick={() => input(n)}
            className="rounded-md bg-muted py-2 font-display text-lg text-gold-soft transition-colors hover:bg-surface active:scale-95"
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => input(0)}
          aria-label={dict.game.erase}
          className="grid place-items-center rounded-md bg-muted text-muted-foreground transition-colors hover:bg-surface active:scale-95"
        >
          <Eraser className="size-4" />
        </button>
      </div>

      <DemoSolved show={solved} dict={dict} onRestart={restart} />
    </div>
  );
}

/* ------------------------------ 2048 demo ------------------------------ */

const DEMO_TILE_STYLES: Record<number, string> = {
  2: "bg-muted text-muted-foreground",
  4: "bg-muted text-gold-soft",
  8: "bg-surface text-gold-soft",
  16: "bg-surface text-gold",
  32: "bg-gold/25 text-gold-soft",
  64: "bg-gold/40 text-gold-soft",
  128: "bg-gold/55 text-primary-foreground",
  256: "bg-gold/70 text-primary-foreground",
};

const GAP_FRAC = 0.02;
const CELL_FRAC = (1 - GAP_FRAC * 5) / 4;
const pos = (i: number) => `${(GAP_FRAC + i * (CELL_FRAC + GAP_FRAC)) * 100}%`;
const cellSize = `${CELL_FRAC * 100}%`;

/** Deterministic start (hydration-safe); randomness begins with the first move. */
const G2048_START: G2048State = {
  tiles: [
    { id: 1, value: 2, r: 0, c: 0 },
    { id: 2, value: 2, r: 1, c: 2 },
  ],
  nextId: 3,
  score: 0,
  best: 0,
  moves: 0,
  seconds: 0,
  over: false,
  reached2048: false,
};

function Demo2048({ dict }: { dict: Dictionary }) {
  const [state, setState] = useState<G2048State>(G2048_START);
  const dragStart = useRef<{ x: number; y: number } | null>(null);
  const pruneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Focus the board so arrow keys work right after switching to this tab.
    // Keys are scoped to the element: clicking elsewhere gives scrolling back.
    boardRef.current?.focus({ preventScroll: true });
    return () => {
      if (pruneTimer.current) clearTimeout(pruneTimer.current);
    };
  }, []);

  const doMove = (direction: Direction) => {
    setState((prev) => {
      if (prev.over) return prev;
      const { state: next, outcome } = move2048(prev, direction);
      if (outcome === "none") return prev;
      if (outcome === "merged") haptics.impact();
      else haptics.tap();
      if (pruneTimer.current) clearTimeout(pruneTimer.current);
      pruneTimer.current = setTimeout(() => setState((s) => pruneDying(s)), 220);
      return next;
    });
  };

  const KEY_DIRS: Record<string, Direction> = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const dir = KEY_DIRS[e.key];
    if (!dir) return;
    e.preventDefault(); // only while the board is focused
    doMove(dir);
  };

  // Pointer events cover both touch swipes and mouse drags.
  const onPointerDown = (e: React.PointerEvent) => {
    dragStart.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    dragStart.current = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    doMove(
      Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up",
    );
  };

  return (
    <div className="relative" data-demo="g2048">
      <div
        ref={boardRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        className="hairline relative aspect-square w-full cursor-grab touch-none select-none rounded-lg bg-card outline-none focus-visible:ring-2 focus-visible:ring-gold/40 active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {Array.from({ length: 16 }, (_, i) => (
          <div
            key={i}
            className="absolute rounded-md bg-muted/40"
            style={{ top: pos(Math.floor(i / 4)), left: pos(i % 4), width: cellSize, height: cellSize }}
          />
        ))}
        <AnimatePresence>
          {[...state.tiles].sort((a, b) => a.id - b.id).map((tile) => (
            <motion.div
              key={tile.id}
              initial={{ scale: tile.merged ? 1 : 0, top: pos(tile.r), left: pos(tile.c) }}
              animate={{ scale: tile.merged ? [1, 1.18, 1] : 1, top: pos(tile.r), left: pos(tile.c) }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{
                top: { type: "tween", duration: 0.16, ease: [0.3, 0.8, 0.4, 1] },
                left: { type: "tween", duration: 0.16, ease: [0.3, 0.8, 0.4, 1] },
                scale: tile.merged
                  ? { duration: 0.22, times: [0, 0.6, 1], delay: 0.1 }
                  : { type: "spring", stiffness: 480, damping: 30, delay: 0.06 },
              }}
              className={`pointer-events-none absolute grid place-items-center rounded-md font-display text-lg font-medium sm:text-xl ${
                DEMO_TILE_STYLES[tile.value] ?? "bg-gold text-primary-foreground"
              } ${tile.dying ? "z-0" : "z-10"}`}
              style={{ width: cellSize, height: cellSize }}
            >
              {tile.value}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <p className="label-mono mt-2 text-center text-[10px] text-muted-foreground">
        {dict.game.swipeHint}
      </p>
      <DemoSolved
        show={state.over}
        dict={dict}
        title={dict.game.gameOver}
        onRestart={() => setState(new2048())}
      />
    </div>
  );
}

/* ----------------------------- Memory demo ----------------------------- */

const DEMO_SYMBOLS = ["◆", "●", "▲", "■", "★", "✚"];

/** Deterministic deck (hydration-safe); shuffled decks appear on restart. */
const MEMORY_START: MemoryState = {
  size: 12,
  deck: [0, 3, 1, 4, 2, 5, 3, 0, 5, 2, 4, 1],
  matched: new Array(12).fill(false),
  flipped: [],
  moves: 0,
  seconds: 0,
};

function DemoMemory({ dict }: { dict: Dictionary }) {
  const [state, setState] = useState<MemoryState>(MEMORY_START);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const handleFlip = (index: number) => {
    const { state: next, outcome } = flipCard(state, index);
    if (outcome === "ignored") return;
    if (outcome === "flip") haptics.tap();
    if (outcome === "match") haptics.impact();
    setState(next);
    if (outcome === "miss") {
      haptics.error();
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setState((s) => hideMisses(s)), 900);
    }
  };

  return (
    <div className="relative">
      <div className="hairline grid w-full grid-cols-4 gap-1.5 rounded-lg bg-card p-2">
        {state.deck.map((symbol, index) => {
          const faceUp = state.matched[index] || state.flipped.includes(index);
          return (
            <button
              key={index}
              onClick={() => handleFlip(index)}
              disabled={state.matched[index]}
              className="aspect-square [perspective:600px]"
            >
              <motion.div
                className="relative size-full [transform-style:preserve-3d]"
                animate={{ rotateY: faceUp ? 180 : 0 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="absolute inset-0 grid place-items-center rounded-md bg-muted [backface-visibility:hidden]">
                  <span className="font-display text-sm text-surface">?</span>
                </div>
                <div
                  className={`absolute inset-0 grid place-items-center rounded-md [backface-visibility:hidden] [transform:rotateY(180deg)] ${
                    state.matched[index] ? "bg-gold/20 text-gold" : "bg-surface text-gold-soft"
                  }`}
                >
                  <span className="text-xl">{DEMO_SYMBOLS[symbol]}</span>
                </div>
              </motion.div>
            </button>
          );
        })}
      </div>
      <DemoSolved
        show={isMemoryComplete(state)}
        dict={dict}
        onRestart={() => setState(newMemory(12))}
      />
    </div>
  );
}

/* ---------------------------- hero demo panel ---------------------------- */

type DemoId = "fifteen" | "sudoku" | "g2048" | "memory";

export function HeroDemo({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const [active, setActive] = useState<DemoId>("fifteen");

  const demos: { id: DemoId; label: string }[] = [
    { id: "fifteen", label: dict.games.fifteen.name },
    { id: "sudoku", label: dict.games.sudoku.name },
    { id: "g2048", label: dict.games.g2048.name },
    { id: "memory", label: dict.games.memory.name },
  ];

  return (
    <motion.div
      id="demo"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      className="mx-auto w-full max-w-[340px]"
    >
      <div className="mb-3 flex flex-wrap justify-center gap-1.5">
        {demos.map((demo) => (
          <button
            key={demo.id}
            onClick={() => {
              haptics.select();
              setActive(demo.id);
            }}
            aria-pressed={active === demo.id}
            className={`label-mono rounded-full border px-3 py-1.5 transition-colors ${
              active === demo.id
                ? "border-gold bg-gold text-primary-foreground"
                : "border-surface text-muted-foreground hover:border-gold/50 hover:text-gold-soft"
            }`}
          >
            {demo.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {active === "fifteen" && <DemoFifteen dict={dict} />}
          {active === "sudoku" && <DemoSudoku dict={dict} />}
          {active === "g2048" && <Demo2048 dict={dict} />}
          {active === "memory" && <DemoMemory dict={dict} />}
        </motion.div>
      </AnimatePresence>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="label-mono text-[10px] text-muted-foreground">{dict.demo.demoNote}</p>
        <Link
          href={`/${locale}/play/${active}`}
          className="label-mono inline-flex shrink-0 items-center gap-1 text-gold transition-colors hover:text-gold-soft"
        >
          {dict.demo.openFull}
          <ArrowUpRight className="size-3" />
        </Link>
      </div>
    </motion.div>
  );
}
