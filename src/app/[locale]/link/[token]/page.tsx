import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";
import { ClaimClient } from "@/components/claim-client";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function LinkPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  if (!isLocale(locale)) notFound();
  if (!/^[\w-]{16,64}$/.test(token)) notFound();
  const dict = getDictionary(locale);

  return <ClaimClient locale={locale} dict={dict} token={token} />;
}
