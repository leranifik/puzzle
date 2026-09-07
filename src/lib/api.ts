import type { GameId, PlayerDto, SaveDto } from "./schemas";
import { getInitDataRaw } from "./telegram-client";

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(response.status, (body as { error?: string }).error ?? "generic");
  }
  return response.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(code);
  }
}

/**
 * fetch wrapper: inside Telegram Mini Apps every request carries
 * `Authorization: tma <initData>`. web.telegram.org runs the app in a
 * cross-site iframe where cookies may be blocked entirely — the header is
 * the only reliable way to keep the session there. initData is read from
 * the URL hash, so this works even before (or without) the Telegram SDK.
 * Outside Telegram this is a plain fetch (cookie-based sessions as usual).
 */
function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const initData = getInitDataRaw();
  if (initData) {
    init = {
      ...init,
      headers: { ...(init.headers ?? {}), Authorization: `tma ${initData}` },
    };
  }
  return fetch(url, init);
}

export const api = {
  session: () =>
    apiFetch("/api/session", { cache: "no-store" }).then((r) =>
      json<{ player: PlayerDto; saves: SaveDto[] }>(r),
    ),

  register: (data: { name: string; email: string; password: string }) =>
    apiFetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ player: PlayerDto }>(r)),

  login: (data: { email: string; password: string }) =>
    apiFetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).then((r) => json<{ player: PlayerDto }>(r)),

  logout: () => apiFetch("/api/auth/logout", { method: "POST" }).then((r) => json<{ ok: true }>(r)),

  loadSave: (game: GameId) =>
    apiFetch(`/api/saves/${game}`, { cache: "no-store" }).then((r) =>
      json<{ save: SaveDto | null }>(r),
    ),

  createDeviceLink: (locale: string) =>
    apiFetch("/api/link-device", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale }),
    }).then((r) => json<{ url: string; token: string; expiresAt: string }>(r)),

  claimDeviceLink: (token: string) =>
    apiFetch("/api/link-device/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) =>
      json<{ player: PlayerDto; mergedGames: string[]; alreadyLinked: boolean }>(r),
    ),

  saveGame: (game: GameId, state: string, progress: number, options: Pick<RequestInit, "keepalive" | "signal"> = {}) =>
    apiFetch(`/api/saves/${game}`, {
      ...options,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state, progress }),
    }).then((r) => json<{ ok: true; updatedAt: string }>(r)),

  deleteSave: (game: GameId) =>
    apiFetch(`/api/saves/${game}`, { method: "DELETE" }).then((r) => json<{ ok: true }>(r)),

  postResult: (data: { game: GameId; moves: number; seconds: number; meta?: Record<string, unknown> }) =>
    apiFetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ meta: {}, ...data }),
    }).then((r) => json<{ ok: true; id: string }>(r)),
};
