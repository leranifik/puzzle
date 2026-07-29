"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GameId } from "@/lib/schemas";
import { sessionKey } from "./use-session";

export type SaveStatus = "idle" | "saving" | "saved";

/**
 * Debounced cloud autosave. Call `queueSave` after every meaningful change;
 * the hook batches writes so the backend sees at most one PUT per second.
 *
 * Status is intentionally "sticky": "saving" only appears if a request takes
 * longer than 600ms, and "saved" persists between saves — so the indicator
 * doesn't blink on every move.
 *
 * `syncedAt` is the server timestamp of the last save this client has seen
 * (own PUT or an explicitly loaded one via `markSynced`). Anything on the
 * server newer than this was written by another device.
 */
export function useAutosave(game: GameId) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ state: string; progress: number } | null>(null);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ state, progress }: { state: string; progress: number }) =>
      api.saveGame(game, state, progress),
    onMutate: () => {
      // Only surface "saving" for genuinely slow requests.
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      savingLabelTimer.current = setTimeout(() => setStatus("saving"), 600);
    },
    onSuccess: (data) => {
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      setStatus("saved");
      setSyncedAt(data.updatedAt);
    },
    onError: () => {
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      setStatus("idle");
    },
  });

  const mutate = mutation.mutate;

  const queueSave = useCallback(
    (state: string, progress: number) => {
      pending.current = { state, progress };
      if (timer.current) return;
      timer.current = setTimeout(() => {
        timer.current = null;
        if (pending.current) {
          mutate(pending.current);
          pending.current = null;
        }
      }, 1000);
    },
    [mutate],
  );

  // Flush on unmount so the last move is not lost.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      const p = pending.current;
      if (p) {
        // fire-and-forget; keepalive survives page navigation
        void fetch(`/api/saves/${game}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
          keepalive: true,
        });
      }
    };
  }, [game]);

  const clearSave = useCallback(() => {
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setStatus("idle");
    setSyncedAt(null);
    void api.deleteSave(game).then(() => qc.invalidateQueries({ queryKey: sessionKey }));
  }, [game, qc]);

  /** Record the server timestamp of a save we just loaded/accepted. */
  const markSynced = useCallback((iso: string | null) => setSyncedAt(iso), []);

  return { queueSave, clearSave, status, syncedAt, markSynced };
}
