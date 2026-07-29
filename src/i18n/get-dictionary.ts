import type { Locale } from "./config";
import { en, type Dictionary } from "./dictionaries/en";
import { ru } from "./dictionaries/ru";

const dictionaries: Record<Locale, Dictionary> = { en, ru };

export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries.en;
}

export type { Dictionary };
