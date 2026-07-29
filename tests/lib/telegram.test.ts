import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { validateInitData, type TelegramUser } from "@/lib/telegram";

const BOT_TOKEN = "12345:TEST_TOKEN";

function buildInitData(
  user: Partial<TelegramUser> & { id: number },
  overrides: { authDate?: number; token?: string; omitHash?: boolean; omitUser?: boolean } = {},
): string {
  const params = new URLSearchParams();
  if (!overrides.omitUser) params.set("user", JSON.stringify(user));
  params.set("auth_date", String(overrides.authDate ?? Math.floor(Date.now() / 1000)));
  params.set("query_id", "AAF1");

  const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
  const secret = createHmac("sha256", "WebAppData").update(overrides.token ?? BOT_TOKEN).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  if (!overrides.omitHash) params.set("hash", hash);
  return params.toString();
}

describe("validateInitData", () => {
  const user = { id: 42, first_name: "Иван", username: "ivan", language_code: "ru" };

  it("accepts a correctly signed payload and parses the user", () => {
    const result = validateInitData(buildInitData(user), BOT_TOKEN);
    expect(result).toMatchObject({ id: 42, first_name: "Иван", language_code: "ru" });
  });

  it("rejects a payload signed with a different bot token", () => {
    const data = buildInitData(user, { token: "999:OTHER" });
    expect(validateInitData(data, BOT_TOKEN)).toBeNull();
  });

  it("rejects tampered user data", () => {
    const data = buildInitData(user).replace("%22id%22%3A42", "%22id%22%3A43");
    expect(validateInitData(data, BOT_TOKEN)).toBeNull();
  });

  it("rejects initData older than 24 hours", () => {
    const stale = Math.floor(Date.now() / 1000) - 25 * 60 * 60;
    expect(validateInitData(buildInitData(user, { authDate: stale }), BOT_TOKEN)).toBeNull();
  });

  it("rejects missing hash / missing user / garbage", () => {
    expect(validateInitData(buildInitData(user, { omitHash: true }), BOT_TOKEN)).toBeNull();
    expect(validateInitData(buildInitData(user, { omitUser: true }), BOT_TOKEN)).toBeNull();
    expect(validateInitData("", BOT_TOKEN)).toBeNull();
    expect(validateInitData("hash=deadbeef", BOT_TOKEN)).toBeNull();
  });

  it("rejects user payloads without a numeric id", () => {
    const params = new URLSearchParams();
    params.set("user", JSON.stringify({ first_name: "NoId" }));
    params.set("auth_date", String(Math.floor(Date.now() / 1000)));
    const dcs = [...params.entries()].map(([k, v]) => `${k}=${v}`).sort().join("\n");
    const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
    params.set("hash", createHmac("sha256", secret).update(dcs).digest("hex"));
    expect(validateInitData(params.toString(), BOT_TOKEN)).toBeNull();
  });
});
