import { isLocale } from "@/i18n/config";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n/get-dictionary";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { Hero } from "@/components/landing/hero";
import { GamesGrid } from "@/components/landing/games-grid";
import { HowItWorks } from "@/components/landing/how-it-works";

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return (
    <>
      <SiteHeader locale={locale} dict={dict} />
      <main className="flex-1">
        <Hero locale={locale} dict={dict} />
        <GamesGrid locale={locale} dict={dict} />
        <HowItWorks dict={dict} />
      </main>
      <SiteFooter dict={dict} />
    </>
  );
}
