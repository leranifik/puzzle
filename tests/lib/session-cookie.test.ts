import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * Verifies session cookie attributes per environment.
 * Telegram Web runs Mini Apps in a cross-site iframe: production cookies
 * must be SameSite=None; Secure or the session silently breaks there.
 */

type SetCall = { name: string; value: string; options: Record<string, unknown> };
const setCalls: SetCall[] = [];

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (name: string, value: string, options: Record<string, unknown>) => {
      setCalls.push({ name, value, options });
    },
    delete: () => {},
  }),
}));

afterEach(() => {
  setCalls.length = 0;
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("session cookie attributes", () => {
  it("production: SameSite=None + Secure (Telegram Web iframe support)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { setSessionCookie } = await import("@/lib/session");
    await setSessionCookie("player-1");
    expect(setCalls[0].options).toMatchObject({
      sameSite: "none",
      secure: true,
      httpOnly: true,
    });
  });

  it("production + INSECURE_COOKIES=1: falls back to Lax (plain HTTP)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("INSECURE_COOKIES", "1");
    const { setSessionCookie } = await import("@/lib/session");
    await setSessionCookie("player-1");
    expect(setCalls[0].options).toMatchObject({ sameSite: "lax", secure: false });
  });

  it("development: Lax without Secure (localhost over http)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const { setSessionCookie } = await import("@/lib/session");
    await setSessionCookie("player-1");
    expect(setCalls[0].options).toMatchObject({ sameSite: "lax", secure: false });
  });
});
