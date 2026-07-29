import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createHmac } from "node:crypto";
import {
  initDb,
  teardownDb,
  newDevice,
  useDevice,
  jsonRequest,
} from "./harness";

const BOT_TOKEN = "12345:TEST_TOKEN";

function buildInitData(user: { id: number; first_name: string; last_name?: string; language_code?: string }) {
  const params = new URLSearchParams();
  params.set("user", JSON.stringify(user));
  params.set("auth_date", String(Math.floor(Date.now() / 1000)));
  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
  return params.toString();
}

let session: typeof import("@/app/api/session/route");
let telegram: typeof import("@/app/api/auth/telegram/route");
let saves: typeof import("@/app/api/saves/[game]/route");

const params = (game: string) => ({ params: Promise.resolve({ game }) });

beforeAll(async () => {
  process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
  await initDb();
  session = await import("@/app/api/session/route");
  telegram = await import("@/app/api/auth/telegram/route");
  saves = await import("@/app/api/saves/[game]/route");
});

afterAll(() => {
  delete process.env.TELEGRAM_BOT_TOKEN;
  teardownDb();
});

describe("POST /api/auth/telegram", () => {
  it("upgrades the current guest, keeping their saves", async () => {
    useDevice(newDevice());
    const guest = await (await session.GET()).json();
    await saves.PUT(
      await jsonRequest("/api/saves/fifteen", { state: '{"g":1}', progress: 0.3 }, "PUT"),
      params("fifteen"),
    );

    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 100, first_name: "Guest", last_name: "Upgraded" }) }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player.id).toBe(guest.player.id); // upgraded in place
    expect(body.player.isGuest).toBe(false);
    expect(body.player.name).toBe("Guest Upgraded");
    expect(body.languageCode).toBeNull();

    const after = await (await session.GET()).json();
    expect(after.saves.map((s: { game: string }) => s.game)).toContain("fifteen");
  });

  it("second device with same Telegram user gets the same profile", async () => {
    useDevice(newDevice());
    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 100, first_name: "Guest", last_name: "Upgraded" }) }),
    );
    const body = await res.json();
    const s = await (await session.GET()).json();
    expect(s.player.id).toBe(body.player.id);
    expect(s.saves.map((x: { game: string }) => x.game)).toContain("fifteen");
  });

  it("merges a fresh guest's unique saves into the existing Telegram profile", async () => {
    // new guest on a third device plays sudoku, then signs in with the SAME tg id
    useDevice(newDevice());
    await session.GET();
    await saves.PUT(
      await jsonRequest("/api/saves/sudoku", { state: '{"from-guest":1}', progress: 0.6 }, "PUT"),
      params("sudoku"),
    );
    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 100, first_name: "Guest", last_name: "Upgraded" }) }),
    );
    expect(res.status).toBe(200);
    const s = await (await session.GET()).json();
    const games = s.saves.map((x: { game: string }) => x.game).sort();
    expect(games).toEqual(["fifteen", "sudoku"]); // fifteen from before + merged sudoku
  });

  it("does not overwrite existing saves on the Telegram profile during merge", async () => {
    // guest plays fifteen (the tg profile already has one) -> tg copy must win
    useDevice(newDevice());
    await session.GET();
    await saves.PUT(
      await jsonRequest("/api/saves/fifteen", { state: '{"intruder":1}', progress: 0.99 }, "PUT"),
      params("fifteen"),
    );
    await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 100, first_name: "Guest", last_name: "Upgraded" }) }),
    );
    const get = await saves.GET(
      await jsonRequest("/api/saves/fifteen", undefined, "GET"),
      params("fifteen"),
    );
    expect((await get.json()).save.state).toBe('{"g":1}'); // original kept
  });

  it("passes through language_code", async () => {
    useDevice(newDevice());
    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 200, first_name: "Rus", language_code: "ru" }) }),
    );
    expect((await res.json()).languageCode).toBe("ru");
  });

  it("rejects forged initData with 401", async () => {
    useDevice(newDevice());
    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: "user=%7B%22id%22%3A1%7D&auth_date=1&hash=deadbeef" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 503 when the bot token is not configured", async () => {
    const saved = process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_TOKEN;
    const res = await telegram.POST(
      await jsonRequest("/api/auth/telegram", { initData: buildInitData({ id: 300, first_name: "X" }) }),
    );
    expect(res.status).toBe(503);
    process.env.TELEGRAM_BOT_TOKEN = saved;
  });
});

describe("header auth (tma) — cookie-blocked iframe on web.telegram.org", () => {
  it("session resolves the player from Authorization: tma without any cookie", async () => {
    const initData = buildInitData({ id: 555, first_name: "Iframe", last_name: "User" });
    // Fresh "device" whose cookie jar never persists (simulates blocked cookies):
    // we pass ONLY the header — no prior session cookie exists.
    useDevice(newDevice(), { authorization: `tma ${initData}` });
    const body = await (await session.GET()).json();
    expect(body.player.isGuest).toBe(false);
    expect(body.player.name).toBe("Iframe User");

    // Same header on a *different* cookie-less device → the same player,
    // not a new guest (this was the web.telegram.org bug).
    useDevice(newDevice(), { authorization: `tma ${initData}` });
    const again = await (await session.GET()).json();
    expect(again.player.id).toBe(body.player.id);
  });

  it("saves persist across cookie-less requests via the header", async () => {
    const initData = buildInitData({ id: 556, first_name: "Saver" });
    useDevice(newDevice(), { authorization: `tma ${initData}` });
    await saves.PUT(
      await jsonRequest("/api/saves/sudoku", { state: '{"tma":1}', progress: 0.5 }, "PUT"),
      params("sudoku"),
    );

    useDevice(newDevice(), { authorization: `tma ${initData}` }); // new "request", no cookies
    const get = await saves.GET(
      await jsonRequest("/api/saves/sudoku", undefined, "GET"),
      params("sudoku"),
    );
    expect((await get.json()).save?.state).toBe('{"tma":1}');
  });

  it("ignores forged tma headers and falls back to a guest", async () => {
    useDevice(newDevice(), { authorization: "tma user=%7B%22id%22%3A1%7D&auth_date=1&hash=dead" });
    const body = await (await session.GET()).json();
    expect(body.player.isGuest).toBe(true);
  });

  it("an existing session cookie wins over the header", async () => {
    const device = newDevice();
    useDevice(device);
    const guest = await (await session.GET()).json();

    const initData = buildInitData({ id: 557, first_name: "Other" });
    useDevice(device, { authorization: `tma ${initData}` });
    const body = await (await session.GET()).json();
    expect(body.player.id).toBe(guest.player.id); // cookie takes precedence
  });
});
