import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initDb,
  teardownDb,
  newDevice,
  useDevice,
  jsonRequest,
} from "./harness";

/* Route handlers are imported dynamically AFTER initDb sets DATABASE_URL. */
let session: typeof import("@/app/api/session/route");
let register: typeof import("@/app/api/auth/register/route");
let login: typeof import("@/app/api/auth/login/route");
let logout: typeof import("@/app/api/auth/logout/route");
let saves: typeof import("@/app/api/saves/[game]/route");
let results: typeof import("@/app/api/results/route");

const params = (game: string) => ({ params: Promise.resolve({ game }) });

beforeAll(async () => {
  await initDb();
  session = await import("@/app/api/session/route");
  register = await import("@/app/api/auth/register/route");
  login = await import("@/app/api/auth/login/route");
  logout = await import("@/app/api/auth/logout/route");
  saves = await import("@/app/api/saves/[game]/route");
  results = await import("@/app/api/results/route");
});

afterAll(() => teardownDb());

describe("session & auth flow", () => {
  it("GET /api/session lazily creates a guest and keeps it across calls", async () => {
    useDevice(newDevice());
    const first = await (await session.GET()).json();
    expect(first.player.isGuest).toBe(true);
    expect(first.saves).toEqual([]);

    const second = await (await session.GET()).json();
    expect(second.player.id).toBe(first.player.id); // cookie reused
  });

  it("register upgrades the guest in place, keeping the same player id", async () => {
    useDevice(newDevice());
    const guest = await (await session.GET()).json();

    const res = await register.POST(
      await jsonRequest("/api/auth/register", {
        name: "Alice",
        email: "alice@test.dev",
        password: "secret123",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player.id).toBe(guest.player.id);
    expect(body.player.isGuest).toBe(false);
  });

  it("rejects duplicate email registration with 409", async () => {
    useDevice(newDevice());
    await session.GET();
    const res = await register.POST(
      await jsonRequest("/api/auth/register", {
        name: "Clone",
        email: "alice@test.dev",
        password: "secret123",
      }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe("email_taken");
  });

  it("login succeeds with correct credentials and fails with wrong ones", async () => {
    useDevice(newDevice());
    const ok = await login.POST(
      await jsonRequest("/api/auth/login", { email: "alice@test.dev", password: "secret123" }),
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).player.name).toBe("Alice");

    const bad = await login.POST(
      await jsonRequest("/api/auth/login", { email: "alice@test.dev", password: "nope" }),
    );
    expect(bad.status).toBe(401);
  });

  it("logout clears the session; next visit creates a fresh guest", async () => {
    const device = newDevice();
    useDevice(device);
    await login.POST(
      await jsonRequest("/api/auth/login", { email: "alice@test.dev", password: "secret123" }),
    );
    const before = await (await session.GET()).json();
    expect(before.player.name).toBe("Alice");

    await logout.POST();
    const after = await (await session.GET()).json();
    expect(after.player.id).not.toBe(before.player.id);
    expect(after.player.isGuest).toBe(true);
  });

  it("rejects invalid register payloads with 400", async () => {
    useDevice(newDevice());
    const res = await register.POST(
      await jsonRequest("/api/auth/register", { name: "", email: "bad", password: "1" }),
    );
    expect(res.status).toBe(400);
  });
});

describe("saves API", () => {
  it("PUT/GET/DELETE round-trip for a save", async () => {
    useDevice(newDevice());
    await session.GET();

    const put = await saves.PUT(
      await jsonRequest("/api/saves/fifteen", { state: '{"a":1}', progress: 0.25 }, "PUT"),
      params("fifteen"),
    );
    expect(put.status).toBe(200);
    expect((await put.json()).updatedAt).toBeTruthy();

    const get = await saves.GET(
      await jsonRequest("/api/saves/fifteen", undefined, "GET"),
      params("fifteen"),
    );
    const loaded = (await get.json()).save;
    expect(loaded).toMatchObject({ game: "fifteen", state: '{"a":1}', progress: 0.25 });

    const del = await saves.DELETE(
      await jsonRequest("/api/saves/fifteen", undefined, "DELETE"),
      params("fifteen"),
    );
    expect(del.status).toBe(200);

    const gone = await saves.GET(
      await jsonRequest("/api/saves/fifteen", undefined, "GET"),
      params("fifteen"),
    );
    expect((await gone.json()).save).toBeNull();
  });

  it("upsert: a second PUT overwrites the same game slot", async () => {
    useDevice(newDevice());
    await session.GET();
    await saves.PUT(
      await jsonRequest("/api/saves/sudoku", { state: '{"v":1}', progress: 0.1 }, "PUT"),
      params("sudoku"),
    );
    await saves.PUT(
      await jsonRequest("/api/saves/sudoku", { state: '{"v":2}', progress: 0.9 }, "PUT"),
      params("sudoku"),
    );
    const get = await saves.GET(
      await jsonRequest("/api/saves/sudoku", undefined, "GET"),
      params("sudoku"),
    );
    const s = (await get.json()).save;
    expect(s.state).toBe('{"v":2}');
    expect(s.progress).toBe(0.9);
  });

  it("rejects unknown games with 404 and invalid bodies with 400", async () => {
    useDevice(newDevice());
    await session.GET();
    const unknown = await saves.PUT(
      await jsonRequest("/api/saves/chess", { state: "{}", progress: 0 }, "PUT"),
      params("chess"),
    );
    expect(unknown.status).toBe(404);

    const invalid = await saves.PUT(
      await jsonRequest("/api/saves/fifteen", { state: "{}", progress: 7 }, "PUT"),
      params("fifteen"),
    );
    expect(invalid.status).toBe(400);
  });

  it("saves are per-player: another device sees null", async () => {
    const deviceA = newDevice();
    useDevice(deviceA);
    await session.GET();
    await saves.PUT(
      await jsonRequest("/api/saves/memory", { state: '{"mine":1}', progress: 0.5 }, "PUT"),
      params("memory"),
    );

    useDevice(newDevice()); // different cookies -> different guest
    await session.GET();
    const get = await saves.GET(
      await jsonRequest("/api/saves/memory", undefined, "GET"),
      params("memory"),
    );
    expect((await get.json()).save).toBeNull();
  });
});

describe("results API", () => {
  it("records a finished game", async () => {
    useDevice(newDevice());
    await session.GET();
    const res = await results.POST(
      await jsonRequest("/api/results", {
        game: "g2048",
        moves: 120,
        seconds: 300,
        meta: { score: 4096 },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBeTruthy();
  });

  it("rejects invalid payloads", async () => {
    useDevice(newDevice());
    const res = await results.POST(
      await jsonRequest("/api/results", { game: "poker", moves: 1, seconds: 1 }),
    );
    expect(res.status).toBe(400);
  });
});
