import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale, locales } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { GamesHub } from "@/components/games-hub";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: `${dict.hub.title} — PuzzleHub`,
    description: dict.hub.subtitle,
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}/games`])),
    },
  };
}

export default async function GamesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return <GamesHub locale={locale} dict={dict} />;
}
