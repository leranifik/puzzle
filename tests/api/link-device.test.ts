import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  initDb,
  teardownDb,
  newDevice,
  useDevice,
  jsonRequest,
  type CookieJar,
} from "./harness";

let session: typeof import("@/app/api/session/route");
let register: typeof import("@/app/api/auth/register/route");
let login: typeof import("@/app/api/auth/login/route");
let linkDevice: typeof import("@/app/api/link-device/route");
let claim: typeof import("@/app/api/link-device/claim/route");
let saves: typeof import("@/app/api/saves/[game]/route");

const params = (game: string) => ({ params: Promise.resolve({ game }) });

async function issueLink(): Promise<string> {
  const res = await linkDevice.POST(await jsonRequest("/api/link-device", { locale: "ru" }));
  const body = await res.json();
  expect(res.status).toBe(200);
  expect(body.url).toContain("/ru/link/");
  return body.token;
}

async function putSave(game: string, state: string, progress: number) {
  const res = await saves.PUT(
    await jsonRequest(`/api/saves/${game}`, { state, progress }, "PUT"),
    params(game),
  );
  expect(res.status).toBe(200);
}

async function getSaveState(game: string): Promise<string | null> {
  const res = await saves.GET(await jsonRequest(`/api/saves/${game}`, undefined, "GET"), params(game));
  const body = await res.json();
  return body.save?.state ?? null;
}

beforeAll(async () => {
  await initDb();
  session = await import("@/app/api/session/route");
  register = await import("@/app/api/auth/register/route");
  login = await import("@/app/api/auth/login/route");
  linkDevice = await import("@/app/api/link-device/route");
  claim = await import("@/app/api/link-device/claim/route");
  saves = await import("@/app/api/saves/[game]/route");
});

afterAll(() => teardownDb());

describe("device link — issuing", () => {
  it("issues a token with ~5 minute TTL", async () => {
    useDevice(newDevice());
    await session.GET();
    const res = await linkDevice.POST(await jsonRequest("/api/link-device", { locale: "en" }));
    const body = await res.json();
    const ttl = new Date(body.expiresAt).getTime() - Date.now();
    expect(ttl).toBeGreaterThan(4.5 * 60 * 1000);
    expect(ttl).toBeLessThanOrEqual(5 * 60 * 1000);
    expect(body.url).toContain(`/en/link/${body.token}`);
  });

  it("re-issuing revokes the previous unused link", async () => {
    useDevice(newDevice());
    await session.GET();
    const t1 = await issueLink();
    const t2 = await issueLink();

    useDevice(newDevice());
    const old = await claim.POST(await jsonRequest("/api/link-device/claim", { token: t1 }));
    expect(old.status).toBe(410);
    const fresh = await claim.POST(await jsonRequest("/api/link-device/claim", { token: t2 }));
    expect(fresh.status).toBe(200);
  });
});

describe("device link — claiming & conflicts", () => {
  let deviceA: CookieJar;
  let playerAId: string;

  beforeAll(async () => {
    deviceA = newDevice();
    useDevice(deviceA);
    playerAId = (await (await session.GET()).json()).player.id;
    await putSave("fifteen", '{"A-fifteen":1}', 0.5);
  });

  it("fresh device simply adopts the profile", async () => {
    useDevice(deviceA);
    const token = await issueLink();

    useDevice(newDevice());
    const res = await claim.POST(await jsonRequest("/api/link-device/claim", { token }));
    const body = await res.json();
    expect(body.player.id).toBe(playerAId);
    expect(body.mergedGames).toEqual([]);
    expect(await getSaveState("fifteen")).toBe('{"A-fifteen":1}');
  });

  it("token is single-use: a second claim gets 410", async () => {
    useDevice(deviceA);
    const token = await issueLink();

    useDevice(newDevice());
    expect((await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).status).toBe(200);
    useDevice(newDevice());
    expect((await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).status).toBe(410);
  });

  it("guest with own progress: newer save wins per game, unique games merge", async () => {
    // Guest device: older fifteen (loses), unique sudoku (merges)
    const guest = newDevice();
    useDevice(guest);
    await session.GET();
    await putSave("fifteen", '{"guest-fifteen-older":1}', 0.2);
    await putSave("sudoku", '{"guest-sudoku":1}', 0.8);

    await new Promise((r) => setTimeout(r, 1100)); // make A's save strictly newer
    useDevice(deviceA);
    await putSave("fifteen", '{"A-fifteen-newer":1}', 0.9);
    const token = await issueLink();

    useDevice(guest);
    const res = await claim.POST(await jsonRequest("/api/link-device/claim", { token }));
    const body = await res.json();
    expect(body.player.id).toBe(playerAId);
    expect(body.mergedGames).toEqual(["sudoku"]); // only the unique one

    expect(await getSaveState("fifteen")).toBe('{"A-fifteen-newer":1}');
    expect(await getSaveState("sudoku")).toBe('{"guest-sudoku":1}');
  });

  it("guest save newer than the profile's -> guest version wins", async () => {
    const guest = newDevice();
    useDevice(guest);
    await session.GET();
    await new Promise((r) => setTimeout(r, 1100)); // strictly newer than A's fifteen
    await putSave("fifteen", '{"guest-newest":1}', 0.95);

    useDevice(deviceA);
    const token = await issueLink();

    useDevice(guest);
    const body = await (await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).json();
    expect(body.mergedGames).toEqual(["fifteen"]);
    expect(await getSaveState("fifteen")).toBe('{"guest-newest":1}');
  });

  it("signed-in device: session switches, nothing merged, account untouched", async () => {
    const emmaDevice = newDevice();
    useDevice(emmaDevice);
    await session.GET();
    await register.POST(
      await jsonRequest("/api/auth/register", { name: "Emma", email: "emma@test.dev", password: "secret123" }),
    );
    await putSave("memory", '{"emma-memory":1}', 0.5);

    useDevice(deviceA);
    const token = await issueLink();

    useDevice(emmaDevice);
    const body = await (await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).json();
    expect(body.player.id).toBe(playerAId); // switched
    expect(body.mergedGames).toEqual([]); // no merge

    // Emma can still log in elsewhere and her save is intact
    const other = newDevice();
    useDevice(other);
    const loginRes = await login.POST(
      await jsonRequest("/api/auth/login", { email: "emma@test.dev", password: "secret123" }),
    );
    expect(loginRes.status).toBe(200);
    expect(await getSaveState("memory")).toBe('{"emma-memory":1}');
  });

  it("claiming your own link is a no-op (alreadyLinked)", async () => {
    useDevice(deviceA);
    const token = await issueLink();
    const body = await (await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).json();
    expect(body.alreadyLinked).toBe(true);
    expect(body.player.id).toBe(playerAId);
  });

  it("rejects unknown and malformed tokens", async () => {
    useDevice(newDevice());
    expect(
      (await claim.POST(await jsonRequest("/api/link-device/claim", { token: "x".repeat(32) }))).status,
    ).toBe(410);
    expect(
      (await claim.POST(await jsonRequest("/api/link-device/claim", { token: "short" }))).status,
    ).toBe(400);
  });

  it("expired tokens are rejected with 410", async () => {
    useDevice(deviceA);
    const token = await issueLink();
    // manually expire it
    const { prisma } = await import("@/lib/prisma");
    await prisma.linkToken.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    useDevice(newDevice());
    expect(
      (await claim.POST(await jsonRequest("/api/link-device/claim", { token }))).status,
    ).toBe(410);
  });
});
