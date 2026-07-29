"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { GameId, SaveDto } from "@/lib/schemas";

/**
 * Live watch for "this save was updated on the server by another device".
 *
 * Polls the save every 15s while the tab is visible and refetches on window
 * focus. Returns the remote save when its `updatedAt` is strictly newer than
 * the last save this client has synced (`syncedAt` from useAutosave) —
 * i.e. it must have been written elsewhere.
 *
 * Resolution is up to the caller: calling `markSynced(remote.updatedAt)`
 * makes the result disappear (both for "load it" and "keep mine").
 */
export function useRemoteWatch({
  game,
  enabled,
  syncedAt,
}: {
  game: GameId;
  enabled: boolean;
  syncedAt: string | null;
}): SaveDto | null {
  const query = useQuery({
    queryKey: ["remote-save", game],
    queryFn: () => api.loadSave(game),
    enabled,
    staleTime: 0,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });

  const save = query.data?.save ?? null;
  if (!enabled || !save) return null;
  // Until this client has synced at least once (own PUT or an accepted load),
  // we can't attribute the server save to another device — stay quiet.
  // This also prevents false positives from stale cache right after "New game".
  if (!syncedAt) return null;
  // ISO-8601 UTC strings compare correctly as strings.
  if (save.updatedAt <= syncedAt) return null;
  return save;
}
