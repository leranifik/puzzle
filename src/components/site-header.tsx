import Link from "next/link";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AuthDialog } from "@/components/auth-dialog";
import { LinkDeviceDialog } from "@/components/link-device-dialog";
import { HomeLink } from "@/components/home-link";

export function SiteHeader({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  return (
    <header className="sticky top-0 z-40 border-b border-surface/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <HomeLink locale={locale} className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-gold font-display text-sm font-semibold text-primary-foreground">
            P
          </span>
          <span className="font-display text-lg font-medium tracking-tight text-foreground">
            Puzzle<span className="text-gold">Hub</span>
          </span>
        </HomeLink>

        <nav className="hidden items-center gap-6 md:flex">
          <Link href={`/${locale}#games`} className="label-mono text-muted-foreground transition-colors hover:text-gold-soft">
            {dict.nav.games}
          </Link>
          <Link href={`/${locale}#how`} className="label-mono text-muted-foreground transition-colors hover:text-gold-soft">
            {dict.nav.how}
          </Link>
        </nav>

        <div className="flex items-center gap-2.5">
          <LinkDeviceDialog locale={locale} dict={dict} compact />
          <LocaleSwitcher current={locale} />
          <AuthDialog dict={dict} />
        </div>
      </div>
    </header>
  );
}
