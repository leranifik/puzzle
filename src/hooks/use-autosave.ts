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
  const generation = useRef(0);
  const requests = useRef(new Set<AbortController>());
  const invalidateResponses = useCallback(() => { generation.current++; }, []);
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({ state, progress, controller }: { state: string; progress: number; generation: number; controller: AbortController }) =>
      api.saveGame(game, state, progress, { signal: controller.signal }),
    onMutate: (variables) => {
      if (variables.generation !== generation.current) return;
      // Only surface "saving" for genuinely slow requests.
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      savingLabelTimer.current = setTimeout(() => setStatus("saving"), 600);
    },
    onSuccess: (data, variables) => {
      if (variables.generation !== generation.current) return;
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      setStatus("saved");
      setSyncedAt(data.updatedAt);
    },
    onError: (_error, variables) => {
      if (variables.generation !== generation.current) return;
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      setStatus("idle");
    },
    onSettled: (_data, _error, variables) => {
      requests.current.delete(variables.controller);
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
          const controller = new AbortController();
          requests.current.add(controller);
          mutate({ ...pending.current, generation: generation.current, controller });
          pending.current = null;
        }
      }, 1000);
    },
    [mutate],
  );

  /** Drop local work before accepting a remote save; never delete server data. */
  const cancelPending = useCallback(() => {
    invalidateResponses();
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
    savingLabelTimer.current = null;
    for (const controller of requests.current) controller.abort();
    requests.current.clear();
    setStatus("idle");
  }, [invalidateResponses]);

  // Flush on unmount so the last move is not lost.
  useEffect(() => {
    return () => {
      invalidateResponses();
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (savingLabelTimer.current) clearTimeout(savingLabelTimer.current);
      savingLabelTimer.current = null;
      const p = pending.current;
      pending.current = null;
      if (p) {
        // The shared transport also carries TMA auth when cookies are blocked.
        void api.saveGame(game, p.state, p.progress, { keepalive: true }).catch(() => {});
      }
    };
  }, [game, invalidateResponses]);

  const clearSave = useCallback(() => {
    cancelPending();
    setSyncedAt(null);
    void api.deleteSave(game).then(() => qc.invalidateQueries({ queryKey: sessionKey })).catch(() => {});
  }, [cancelPending, game, qc]);

  /** Record the server timestamp of a save we just loaded/accepted. */
  const markSynced = useCallback((iso: string | null) => setSyncedAt(iso), []);

  return { queueSave, cancelPending, clearSave, status, syncedAt, markSynced };
}
