"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { Eraser, Pencil, RotateCcw } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import {
  deserializeSudoku,
  serializeSudoku,
  sudokuProgress,
  type SudokuDifficulty,
} from "@/lib/games/sudoku";
import { useSudokuStore } from "@/stores/sudoku-store";
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

export function SudokuClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const {
    state, won, selected, notesMode, conflictCells,
    init, newGame, select, input, erase, toggleNotesMode, tick,
  } = useSudokuStore();
  const { queueSave, clearSave, status, syncedAt, markSynced } = useAutosave("sudoku");
  const [dialogDismissed, setDialogDismissed] = useState(false);
  const resultPosted = useRef(false);

  const saveQuery = useQuery({
    queryKey: ["save", "sudoku"],
    queryFn: () => api.loadSave("sudoku"),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const rawSave = saveQuery.data?.save?.state ?? null;
  const restorable = (() => {
    const restored = rawSave ? deserializeSudoku(rawSave) : null;
    return restored && sudokuProgress(restored) < 1 ? restored : null;
  })();

  const askContinue = saveQuery.isSuccess && !state && !!restorable && !dialogDismissed;

  // Live watch: someone saved this game from another device.
  const remote = useRemoteWatch({
    game: "sudoku",
    enabled: !!state && !won && !askContinue,
    syncedAt,
  });
  const remoteRestored = remote ? deserializeSudoku(remote.state) : null;
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
    const s = useSudokuStore.getState().state;
    if (s) queueSave(serializeSudoku(s), sudokuProgress(s));
  };

  useEffect(() => {
    if (!saveQuery.isSuccess) return;
    const store = useSudokuStore.getState();
    if (store.state) return;
    const raw = saveQuery.data.save?.state;
    const restored = raw ? deserializeSudoku(raw) : null;
    if (!restored || sudokuProgress(restored) >= 1) store.newGame("easy");
  }, [saveQuery.isSuccess, saveQuery.data]);

  useEffect(() => {
    if (!state || won) return;
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [state, won, tick]);

  // Autosave only on meaningful changes (cell edits/notes), not on timer ticks.
  useEffect(() => {
    const store = useSudokuStore.getState();
    const s = store.state;
    if (!s || store.won) return;
    if (s.moves === 0 && s.notes.every((n) => n.length === 0) && s.cells.every((v, i) => v === s.puzzle[i])) return;
    queueSave(serializeSudoku(s), sudokuProgress(s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.cells, state?.notes]);

  useEffect(() => {
    if (!won || !state || resultPosted.current) return;
    resultPosted.current = true;
    haptics.success();
    clearSave();
    void api.postResult({
      game: "sudoku",
      moves: state.moves,
      seconds: state.seconds,
      meta: { difficulty: state.difficulty, mistakes: state.mistakes },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [won]);

  // Keyboard input on desktop.
  const doInput = (value: number) => {
    const store = useSudokuStore.getState();
    const s = store.state;
    const sel = store.selected;
    if (!s || store.won || sel === null || s.puzzle[sel] !== 0) return;
    input(value);
    if (store.notesMode) {
      haptics.select();
      return;
    }
    if (value === s.solution[sel]) haptics.tap();
    else haptics.error();
  };

  // Keyboard input, scoped to the focused board — the page scrolls normally
  // when the board is not focused.
  const onBoardKeyDown = (e: React.KeyboardEvent) => {
    if (!state || won) return;
    if (e.key >= "1" && e.key <= "9") {
      doInput(Number(e.key));
    } else if (e.key === "Backspace" || e.key === "Delete" || e.key === "0") {
      e.preventDefault();
      erase();
    } else if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      if (selected === null) {
        select(40); // start from the middle when nothing is selected yet
        return;
      }
      const row = Math.floor(selected / 9);
      const col = selected % 9;
      let next = selected;
      if (e.key === "ArrowLeft" && col > 0) next = selected - 1;
      else if (e.key === "ArrowRight" && col < 8) next = selected + 1;
      else if (e.key === "ArrowUp" && row > 0) next = selected - 9;
      else if (e.key === "ArrowDown" && row < 8) next = selected + 9;
      if (next !== selected) select(next);
    }
  };

  const boardRef = useRef<HTMLDivElement>(null);

  // Autofocus the board once the game is ready, so keys work immediately.
  useEffect(() => {
    if (state && !askContinue) boardRef.current?.focus({ preventScroll: true });
  }, [state, askContinue]);

  const startNew = (difficulty: SudokuDifficulty) => {
    resultPosted.current = false;
    clearSave();
    newGame(difficulty);
    setDialogDismissed(true);
  };

  const continueSaved = () => {
    if (restorable) init(restorable);
    else newGame("easy");
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDialogDismissed(true);
  };

  const difficulty = state?.difficulty ?? "easy";
  const selectedValue = state && selected !== null ? state.cells[selected] : 0;

  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.time}</p>
          <p className="font-display text-xl font-medium tabular-nums text-foreground">
            {formatTime(state?.seconds ?? 0)}
          </p>
        </div>
        <div className="h-8 w-px bg-surface" />
        <div>
          <p className="label-mono text-muted-foreground">{dict.game.mistakes}</p>
          <p className="font-display text-xl font-medium tabular-nums text-destructive">
            {state?.mistakes ?? 0}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <SaveIndicator status={status} dict={dict} />
        <Select
          value={difficulty}
          onValueChange={(v) => startNew(v as SudokuDifficulty)}
        >
          <SelectTrigger
            size="sm"
            className="rounded-full border-surface bg-card text-gold-soft"
            aria-label={dict.game.difficulty}
          >
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
          onClick={() => startNew(difficulty)}
          className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">{dict.game.newGame}</span>
        </Button>
      </div>
    </div>
  );

  return (
    <GameShell locale={locale} dict={dict} title={dict.games.sudoku.name} toolbar={toolbar}>
      <ContinueDialog
        open={askContinue}
        dict={dict}
        onContinue={continueSaved}
        onNew={() => startNew("easy")}
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
              className="hairline grid aspect-square w-full grid-cols-9 overflow-hidden rounded-lg bg-card shadow-xl shadow-black/40 outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
              ref={boardRef}
              tabIndex={0}
              onKeyDown={onBoardKeyDown}
              role="grid"
              aria-label={dict.games.sudoku.name}
            >
              {state.cells.map((value, index) => {
                const row = Math.floor(index / 9);
                const col = index % 9;
                const given = state.puzzle[index] !== 0;
                const isSelected = selected === index;
                const sameRowColBox =
                  selected !== null &&
                  (row === Math.floor(selected / 9) ||
                    col === selected % 9 ||
                    (Math.floor(row / 3) === Math.floor(Math.floor(selected / 9) / 3) &&
                      Math.floor(col / 3) === Math.floor((selected % 9) / 3)));
                const sameValue = value !== 0 && selectedValue !== 0 && value === selectedValue && !isSelected;
                const isConflict = conflictCells.includes(index);
                const wrong = !given && value !== 0 && value !== state.solution[index];

                const thickR = col === 2 || col === 5;
                const thickB = row === 2 || row === 5;

                return (
                  <button
                    key={index}
                    role="gridcell"
                    onClick={() => select(index)}
                    aria-selected={isSelected}
                    className={[
                      "relative grid place-items-center border-surface/60 font-display text-base sm:text-lg select-none",
                      "border-r border-b",
                      thickR ? "border-r-2 border-r-gold/35" : "",
                      thickB ? "border-b-2 border-b-gold/35" : "",
                      col === 8 ? "border-r-0" : "",
                      row === 8 ? "border-b-0" : "",
                      isSelected
                        ? "bg-gold/25"
                        : isConflict
                          ? "bg-destructive/25"
                          : sameValue
                            ? "bg-gold/15"
                            : sameRowColBox
                              ? "bg-surface/45"
                              : "bg-transparent",
                      given
                        ? "text-foreground"
                        : wrong
                          ? "text-destructive"
                          : "text-gold",
                    ].join(" ")}
                  >
                    {value !== 0 ? (
                      value
                    ) : state.notes[index].length > 0 ? (
                      <span className="grid w-full grid-cols-3 px-0.5 text-[7px] leading-[1.15] text-muted-foreground sm:text-[8px]">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                          <span key={n} className="text-center">
                            {state.notes[index].includes(n) ? n : ""}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {/* Number pad */}
            <div className="mt-4 grid grid-cols-9 gap-1 sm:gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
                const remaining = 9 - state.cells.filter((v) => v === n).length;
                return (
                  <button
                    key={n}
                    onClick={() => doInput(n)}
                    disabled={remaining <= 0}
                    className="flex aspect-[3/4] flex-col items-center justify-center rounded-md bg-card font-display text-lg text-gold-soft transition-colors hover:bg-surface active:scale-95 disabled:opacity-30 sm:text-xl"
                  >
                    {n}
                    <span className="label-mono text-[9px] text-muted-foreground">
                      {remaining > 0 ? remaining : ""}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleNotesMode}
                aria-pressed={notesMode}
                className={`rounded-full border-surface bg-transparent hover:bg-surface ${
                  notesMode ? "bg-gold/20 text-gold" : "text-muted-foreground"
                }`}
              >
                <Pencil className="size-3.5" />
                {dict.game.notes}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={erase}
                className="rounded-full border-surface bg-transparent text-muted-foreground hover:bg-surface hover:text-gold-soft"
              >
                <Eraser className="size-3.5" />
                {dict.game.erase}
              </Button>
            </div>

            {conflictCells.length > 0 && (
              <p className="font-body mt-3 text-center text-xs text-destructive">
                {dict.game.conflictHint}
              </p>
            )}

            <AnimatePresence>
              {won && (
                <WinOverlay
                  dict={dict}
                  text={dict.game.winSudoku}
                  moves={state.moves}
                  seconds={state.seconds}
                  onPlayAgain={() => startNew(difficulty)}
                />
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </GameShell>
  );
}
