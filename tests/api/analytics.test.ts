import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initDb,
  teardownDb,
  newDevice,
  useDevice,
  jsonRequest,
} from "./harness";

let session: typeof import("@/app/api/session/route");
let results: typeof import("@/app/api/results/route");
let health: typeof import("@/app/api/health/route");
let adminStats: typeof import("@/app/api/admin/stats/route");
let prisma: Awaited<ReturnType<typeof initDb>>;

const ADMIN_KEY = "test-admin-key-123";

/** track() is fire-and-forget; give the event insert a beat to land. */
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  process.env.ADMIN_KEY = ADMIN_KEY;
  prisma = await initDb();
  session = await import("@/app/api/session/route");
  results = await import("@/app/api/results/route");
  health = await import("@/app/api/health/route");
  adminStats = await import("@/app/api/admin/stats/route");
});

afterAll(() => {
  delete process.env.ADMIN_KEY;
  teardownDb();
});

describe("GET /api/health", () => {
  it("reports ok with version and uptime", async () => {
    const res = await health.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(typeof body.uptimeSeconds).toBe("number");
    expect(body.version).toBeTruthy();
  });
});

describe("analytics tracking", () => {
  it("first session visit creates a visit event and sets lastSeenAt", async () => {
    useDevice(newDevice());
    const { player } = await (await session.GET()).json();
    await settle();

    const events = await prisma.event.findMany({ where: { playerId: player.id } });
    expect(events.map((e) => e.type)).toContain("visit");

    const row = await prisma.player.findUnique({ where: { id: player.id } });
    expect(row?.lastSeenAt).toBeTruthy();
  });

  it("repeat sessions within 30 minutes do not create extra visit events", async () => {
    useDevice(newDevice());
    const { player } = await (await session.GET()).json();
    await session.GET();
    await session.GET();
    await settle();

    const visits = await prisma.event.count({
      where: { playerId: player.id, type: "visit" },
    });
    expect(visits).toBe(1);
  });

  it("posting a result records a game_finished event", async () => {
    useDevice(newDevice());
    const { player } = await (await session.GET()).json();
    await results.POST(
      await jsonRequest("/api/results", { game: "fifteen", moves: 10, seconds: 60 }),
    );
    await settle();

    const finished = await prisma.event.findMany({
      where: { playerId: player.id, type: "game_finished" },
    });
    expect(finished).toHaveLength(1);
    expect(JSON.parse(finished[0].meta)).toMatchObject({ game: "fifteen", moves: 10 });
  });
});

describe("GET /api/admin/stats", () => {
  it("rejects requests without the key and with a wrong key", async () => {
    const noKey = await adminStats.GET(await jsonRequest("/api/admin/stats", undefined, "GET"));
    expect(noKey.status).toBe(401);

    const { NextRequest } = await import("next/server");
    const wrong = await adminStats.GET(
      new NextRequest("http://test.local/api/admin/stats", {
        headers: { "X-Admin-Key": "wrong" },
      }),
    );
    expect(wrong.status).toBe(401);
  });

  it("returns aggregated stats with the correct key", async () => {
    const { NextRequest } = await import("next/server");
    const res = await adminStats.GET(
      new NextRequest("http://test.local/api/admin/stats", {
        headers: { "X-Admin-Key": ADMIN_KEY },
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.players.total).toBeGreaterThanOrEqual(3); // devices above
    expect(body.players.dau).toBeGreaterThanOrEqual(3);
    expect(body.daily).toHaveLength(14);
    expect(body.daily.at(-1).visits).toBeGreaterThanOrEqual(3);

    const fifteen = body.games.perGame.find((g: { game: string }) => g.game === "fifteen");
    expect(fifteen).toMatchObject({ finished: 1, players: 1 });
    expect(body.recent[0]).toMatchObject({ game: "fifteen", moves: 10 });
    expect(body.events30d.map((e: { type: string }) => e.type)).toEqual(
      expect.arrayContaining(["visit", "game_finished"]),
    );
  });

  it("is 404 when ADMIN_KEY is not configured", async () => {
    const saved = process.env.ADMIN_KEY;
    delete process.env.ADMIN_KEY;
    const { NextRequest } = await import("next/server");
    const res = await adminStats.GET(
      new NextRequest("http://test.local/api/admin/stats", {
        headers: { "X-Admin-Key": "anything" },
      }),
    );
    expect(res.status).toBe(404);
    process.env.ADMIN_KEY = saved;
  });
});
