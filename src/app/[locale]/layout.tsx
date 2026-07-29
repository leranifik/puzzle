import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "../globals.css";
import { locales, isLocale, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { Providers } from "@/components/providers";
import { TelegramInit } from "@/components/telegram-init";

const archivo = Archivo({
  subsets: ["latin", "latin-ext"],
  variable: "--font-archivo",
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-plex-mono",
  weight: ["400", "600"],
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const dict = getDictionary(locale);
  return {
    title: dict.meta.title,
    description: dict.meta.description,
    alternates: {
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <html
      lang={locale}
      className={`${archivo.variable} ${plexMono.variable} h-full antialiased`}
      // The Telegram SDK (beforeInteractive) sets --tg-viewport-* inline styles
      // on <html> before React hydrates; suppress the attribute-only mismatch.
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col paper-grain">
        <Providers>
          {/* TelegramInit loads the Telegram SDK itself and runs setup onReady */}
          <TelegramInit locale={locale} />
          {children}
        </Providers>
      </body>
    </html>
  );
}

export type LocaleParams = { params: Promise<{ locale: Locale }> };
