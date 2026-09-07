"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, LoaderCircle, RotateCcw, Undo2 } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api } from "@/lib/api";
import { deserializeNumsolis, numsolisProgress, serializeNumsolis, type NumsolisDifficulty } from "@/lib/games/numsolis";
import { useNumsolisStore } from "@/stores/numsolis-store";
import { useAutosave } from "@/hooks/use-autosave";
import { useRemoteWatch } from "@/hooks/use-remote-watch";
import { haptics } from "@/lib/telegram-client";
import { GameShell, SaveIndicator, formatTime } from "@/components/games/game-shell";
import { NumsolisBoard } from "@/components/games/numsolis-board";
import { ContinueDialog } from "@/components/games/continue-dialog";
import { SyncDialog } from "@/components/games/sync-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import styles from "./numsolis.module.css";

export function NumsolisClient({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { state, won, lost, generating, generationError, newGame, init, move, undo, restart, tick } = useNumsolisStore();
  const { queueSave, clearSave, status, syncedAt, markSynced, cancelPending } = useAutosave("numsolis");
  const [dismissed, setDismissed] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [difficultyOpen, setDifficultyOpen] = useState(false);
  const [requestedDifficulty, setRequestedDifficulty] = useState<NumsolisDifficulty>("easy");
  const posted = useRef(new Set<string>());
  const copy = dict.numsolis;

  const saveQuery = useQuery({ queryKey: ["save", "numsolis"], queryFn: () => api.loadSave("numsolis"), staleTime: 0, refetchOnMount: "always" });
  // Cached success may still describe the previous visit. Wait for this mount's
  // fetch before deciding whether the player has a cloud game to continue.
  const saveReady = saveQuery.isSuccess && saveQuery.isFetchedAfterMount && !saveQuery.isFetching;
  const restored = saveQuery.data?.save ? deserializeNumsolis(saveQuery.data.save.state) : null;
  const restorable = restored && numsolisProgress(restored) < 1 ? restored : null;
  const askContinue = saveReady && !state && !!restorable && !dismissed;
  const remote = useRemoteWatch({ game: "numsolis", enabled: !!state && !won && !generating && !askContinue, syncedAt });
  const remoteRestored = remote ? deserializeNumsolis(remote.state) : null;
  const showSync = !!remote && !!remoteRestored;
  const paused = askContinue || showSync || rulesOpen || difficultyOpen || generating || won || lost;
  const hasState = !!state;
  // Subscribe to local transactions: cloud init and seconds deliberately do not
  // change revision. A remote load therefore never echoes stale data back.
  useEffect(() => useNumsolisStore.subscribe((next, previous) => {
    if (next.revision === previous.revision || !next.state) return;
    if (next.won) {
      if (posted.current.has(next.state.id)) return;
      posted.current.add(next.state.id);
      haptics.success();
      clearSave();
      void api.postResult({ game: "numsolis", moves: next.state.moves, seconds: next.state.seconds, meta: { difficulty: next.state.difficulty, rulesVersion: next.state.rulesVersion } }).catch(() => {});
    } else queueSave(serializeNumsolis(next.state), numsolisProgress(next.state));
  }), [queueSave, clearSave]);

  useEffect(() => {
    if (!saveReady) return;
    const store = useNumsolisStore.getState();
    if (store.state || store.generating || store.generationError) return;
    const saved = saveQuery.data.save?.state;
    const candidate = saved ? deserializeNumsolis(saved) : null;
    if (!candidate || numsolisProgress(candidate) === 1) void store.newGame("easy");
  }, [saveReady, saveQuery.data]);

  useEffect(() => {
    if (paused || !hasState) return;
    const timer = setInterval(() => { if (document.visibilityState === "visible") tick(); }, 1000);
    return () => clearInterval(timer);
  }, [paused, hasState, tick]);

  // useAutosave's earlier cleanup flushes its already-serialized payload first.
  // Discard this visit's local state and cancel pending generation so returning
  // starts from a fresh cloud fetch with a matching synchronization timestamp.
  // StrictMode cleanup/setup also safely invalidates the first worker request.
  useEffect(() => () => useNumsolisStore.getState().reset(), []);

  function startNew(difficulty: NumsolisDifficulty) {
    setRequestedDifficulty(difficulty);
    setDismissed(true);
    void newGame(difficulty);
  }

  function continueSaved() {
    if (!restorable) return;
    cancelPending();
    init(restorable);
    markSynced(saveQuery.data?.save?.updatedAt ?? null);
    setDismissed(true);
  }

  function loadRemote() {
    if (!remote || !remoteRestored) return;
    cancelPending();
    init(remoteRestored);
    markSynced(remote.updatedAt);
    haptics.tap();
  }

  function keepMine() {
    if (!remote || !state) return;
    markSynced(remote.updatedAt);
    queueSave(serializeNumsolis(state), numsolisProgress(state));
  }

  const difficulty = state?.difficulty ?? requestedDifficulty;
  const goals = difficulty === "easy" ? 1 : 2;
  const collected = state?.columns.flat().filter((card) => card.value === 2048).length ?? 0;
  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-4">
        <div><p className="label-mono text-muted-foreground">{dict.game.moves}</p><p data-testid="numsolis-moves" className="font-display text-xl font-medium tabular-nums text-foreground">{state?.moves ?? 0}</p></div>
        <div className="h-8 w-px bg-surface" />
        <div><p className="label-mono text-muted-foreground">{dict.game.time}</p><p className="font-display text-xl font-medium tabular-nums text-foreground">{formatTime(state?.seconds ?? 0)}</p></div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden sm:inline-flex"><SaveIndicator status={status} dict={dict} /></span>
        <Select value={difficulty} onOpenChange={setDifficultyOpen} onValueChange={(value) => startNew(value as NumsolisDifficulty)} disabled={generating || askContinue || showSync || (!state && !saveReady)}>
          <SelectTrigger size="sm" aria-label={dict.game.difficulty} className="rounded-full border-surface bg-card text-gold-soft"><SelectValue /></SelectTrigger>
          <SelectContent className="border-surface bg-card">{(["easy", "medium", "hard"] as const).map((value) => <SelectItem key={value} value={value}>{copy[value]}</SelectItem>)}</SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft" aria-label={copy.undo} disabled={!state?.history.length || generating || won || askContinue || showSync} onClick={() => { if (undo()) haptics.tap(); }}><Undo2 className="size-3.5" /><span className="hidden sm:inline">{copy.undoAction}</span></Button>
        <Button variant="outline" size="sm" className="rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface hover:text-gold-soft" aria-label={dict.game.newGame} disabled={generating || askContinue || showSync || (!state && !saveReady)} onClick={() => startNew(difficulty)}><RotateCcw className="size-3.5" /><span className="hidden sm:inline">{dict.game.newGame}</span></Button>
      </div>
    </div>
  );
  return <GameShell locale={locale} dict={dict} title={dict.games.numsolis.name} toolbar={toolbar}>
      <div className={styles.play}>
        <div className={styles.goal}>
          <span className={`${styles.mono} ${styles.goalValue}`} aria-label={`${copy.goals}: ${collected}/${goals}`}>{copy.goalLabel} · 2048</span>
          <button type="button" className={styles.help} onClick={() => setRulesOpen(true)}><CircleHelp className="size-[15px]" />{copy.rules}</button>
        </div>
        <div className="relative">
          {state ? <NumsolisBoard state={state} copy={copy} disabled={paused} onMove={(action) => { const accepted = move(action); if (accepted) haptics.tap(); return accepted; }} /> : <div className="h-[430px]" aria-busy={!generationError && !saveQuery.isError} />}
          {(won || lost) && !generating && state && <div className={styles.overlay}>
            <div role="status" className={styles.message}>
              <h2>{won ? dict.game.youWon : copy.lost}</h2><p>{won ? copy.won : copy.lostHint}</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {!won && <button className={styles.action} disabled={!state.history.length} onClick={() => undo()}><Undo2 className="size-4" />{copy.undoShort}</button>}
                <button className={`${styles.action} ${styles.primary}`} onClick={() => startNew(difficulty)}>{won ? dict.game.playAgain : copy.newParty}</button>
              </div>
            </div>
          </div>}
          {generating && <div role="status" className={styles.overlay}><p className="flex items-center gap-2 text-gold-soft"><LoaderCircle className="size-5" />{copy.generating}</p></div>}
          {!state && saveQuery.isError && <div role="alert" className={styles.overlay}><div className={styles.message}><p>{copy.loadError}</p><button className={`${styles.action} mt-4 w-full`} onClick={() => void saveQuery.refetch()}>{copy.retry}</button></div></div>}
        </div>
        <div className={styles.floor} aria-hidden />
        <p className={`${styles.limit} ${styles.mono}`}>{copy.capacityLabel}</p>
      </div>
      {generationError && <div role="alert" className="mx-4 mt-4 text-center text-sm text-muted-foreground"><p>{copy.generationError}</p><button className={`${styles.action} mx-auto mt-3`} onClick={() => startNew(requestedDifficulty)}>{copy.retry}</button></div>}
    <ContinueDialog open={askContinue} dict={dict} onContinue={continueSaved} onNew={() => startNew(restorable?.difficulty ?? "easy")} />
    <SyncDialog open={showSync} dict={dict} progress={remote?.progress ?? 0} onLoad={loadRemote} onKeep={keepMine} />
    <Dialog open={rulesOpen} onOpenChange={setRulesOpen}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] overflow-y-auto border-surface bg-card sm:max-w-md">
        <DialogTitle className="font-display text-xl text-gold-soft">{copy.rulesTitle}</DialogTitle>
        <DialogDescription className="font-body">{dict.games.numsolis.tagline}</DialogDescription>
        <ol className="font-body list-decimal space-y-3 pl-5 text-sm leading-relaxed text-muted-foreground">{copy.rulesText.map((rule) => <li key={rule}>{rule}</li>)}</ol>
        <button className={styles.action} disabled={!state || generating} onClick={() => { setRulesOpen(false); restart(); }}><RotateCcw className="size-4" />{copy.repeat}</button>
        <DialogClose asChild><Button className="min-h-11 rounded-full bg-gold text-primary-foreground">{copy.close}</Button></DialogClose>
      </DialogContent>
    </Dialog>
  </GameShell>;
}
