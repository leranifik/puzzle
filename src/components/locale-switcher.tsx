"use client";

import { usePathname, useRouter } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

function persistLocale(locale: Locale) {
  document.cookie = `ph_locale=${locale};path=/;max-age=${60 * 60 * 24 * 365}`;
}

export function LocaleSwitcher({ current }: { current: Locale }) {
  const pathname = usePathname();
  const router = useRouter();

  const switchTo = (locale: Locale) => {
    persistLocale(locale);
    const rest = pathname.replace(/^\/(ru|en)(?=\/|$)/, "");
    router.push(`/${locale}${rest || ""}`);
  };

  return (
    <div className="flex items-center gap-px rounded-full border border-surface bg-card p-1">
      {locales.map((locale) => (
        <button
          key={locale}
          onClick={() => switchTo(locale)}
          className={`label-mono rounded-full px-3 py-1.5 transition-colors ${
            locale === current
              ? "bg-gold text-primary-foreground"
              : "text-muted-foreground hover:text-gold-soft"
          }`}
          aria-current={locale === current ? "true" : undefined}
        >
          {locale.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
