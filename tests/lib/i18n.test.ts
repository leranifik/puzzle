import { describe, it, expect } from "vitest";
import { locales, isLocale, defaultLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { en } from "@/i18n/dictionaries/en";
import { ru } from "@/i18n/dictionaries/ru";

/** Recursively collect dot-paths of all leaf keys. */
function leafPaths(obj: unknown, prefix = ""): string[] {
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return [prefix];
  return Object.entries(obj).flatMap(([k, v]) => leafPaths(v, prefix ? `${prefix}.${k}` : k));
}

describe("i18n", () => {
  it("isLocale narrows correctly", () => {
    expect(isLocale("ru")).toBe(true);
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(false);
    expect(isLocale("")).toBe(false);
    expect(isLocale("RU")).toBe(false);
  });

  it("default locale is part of the list", () => {
    expect(locales).toContain(defaultLocale);
  });

  it("getDictionary returns the right dictionary per locale", () => {
    expect(getDictionary("en")).toBe(en);
    expect(getDictionary("ru")).toBe(ru);
  });

  it("ru dictionary covers every key of en (no missing translations)", () => {
    expect(leafPaths(ru).sort()).toEqual(leafPaths(en).sort());
  });

  it("no leaf value is empty in either dictionary", () => {
    const check = (obj: unknown): void => {
      if (typeof obj === "string") {
        expect(obj.trim().length).toBeGreaterThan(0);
      } else if (Array.isArray(obj)) {
        obj.forEach(check);
      } else if (typeof obj === "object" && obj !== null) {
        Object.values(obj).forEach(check);
      }
    };
    check(en);
    check(ru);
  });
});
