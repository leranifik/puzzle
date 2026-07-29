import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import proxy from "@/proxy";

function makeRequest(path: string, headers: Record<string, string> = {}, cookies: Record<string, string> = {}, method = "GET") {
  const req = new NextRequest(`https://example.com${path}`, { headers, method });
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

describe("locale proxy", () => {
  it("passes through paths that already carry a locale", () => {
    for (const path of ["/ru", "/en", "/ru/play/sudoku", "/en/games"]) {
      const res = proxy(makeRequest(path));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("redirects / according to Accept-Language", () => {
    const res = proxy(makeRequest("/", { "accept-language": "ru-RU,ru;q=0.9,en;q=0.8" }));
    expect(res.headers.get("location")).toBe("https://example.com/ru");
  });

  it("picks the highest-quality supported language", () => {
    const res = proxy(makeRequest("/", { "accept-language": "de-DE,de;q=0.9,en;q=0.5,ru;q=0.8" }));
    expect(res.headers.get("location")).toBe("https://example.com/ru");
  });

  it("falls back to the default locale for unsupported languages", () => {
    const res = proxy(makeRequest("/", { "accept-language": "de-DE,fr;q=0.9" }));
    expect(res.headers.get("location")).toBe("https://example.com/en");
  });

  it("prefers the ph_locale cookie over Accept-Language", () => {
    const res = proxy(
      makeRequest("/", { "accept-language": "ru-RU,ru;q=0.9" }, { ph_locale: "en" }),
    );
    expect(res.headers.get("location")).toBe("https://example.com/en");
  });

  it("ignores an invalid ph_locale cookie", () => {
    const res = proxy(
      makeRequest("/", { "accept-language": "ru" }, { ph_locale: "hack" }),
    );
    expect(res.headers.get("location")).toBe("https://example.com/ru");
  });

  it("preserves the rest of the path when redirecting", () => {
    const res = proxy(makeRequest("/play/sudoku", { "accept-language": "ru" }));
    expect(res.headers.get("location")).toBe("https://example.com/ru/play/sudoku");
  });

  it("does not treat /russia as the ru locale", () => {
    const res = proxy(makeRequest("/russia", { "accept-language": "en" }));
    expect(res.headers.get("location")).toBe("https://example.com/en/russia");
  });
});

describe("API CSRF guard", () => {
  it("passes GET requests regardless of origin", () => {
    const res = proxy(
      makeRequest("/api/session", { origin: "https://evil.example.org" }),
    );
    expect(res.status).not.toBe(403);
  });

  it("passes same-origin mutations", () => {
    const res = proxy(
      makeRequest("/api/saves/fifteen", { origin: "https://example.com" }, {}, "PUT"),
    );
    expect(res.status).not.toBe(403);
  });

  it("behind a proxy: matches X-Forwarded-Host, not the internal host", () => {
    // standalone server thinks it's on 127.0.0.1:3000; nginx forwards the real host
    const req = new NextRequest("http://127.0.0.1:3000/api/auth/telegram", {
      method: "POST",
      headers: {
        origin: "https://migurro.soon.it",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "migurro.soon.it",
      },
    });
    expect(proxy(req).status).not.toBe(403);
  });

  it("behind a proxy: still blocks foreign origins", () => {
    const req = new NextRequest("http://127.0.0.1:3000/api/results", {
      method: "POST",
      headers: {
        origin: "https://evil.example.org",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "migurro.soon.it",
      },
    });
    expect(proxy(req).status).toBe(403);
  });

  it("blocks cross-site mutations with 403", () => {
    const res = proxy(
      makeRequest("/api/saves/fifteen", { origin: "https://evil.example.org" }, {}, "PUT"),
    );
    expect(res.status).toBe(403);
  });

  it("blocks malformed origins", () => {
    const res = proxy(
      makeRequest("/api/results", { origin: "not a url" }, {}, "POST"),
    );
    expect(res.status).toBe(403);
  });

  it("passes non-browser clients without an Origin header (curl, monitors)", () => {
    const res = proxy(makeRequest("/api/results", {}, {}, "POST"));
    expect(res.status).not.toBe(403);
  });

  it("never applies locale redirects to API routes", () => {
    const res = proxy(makeRequest("/api/health", { "accept-language": "ru" }));
    expect(res.headers.get("location")).toBeNull();
  });
});
