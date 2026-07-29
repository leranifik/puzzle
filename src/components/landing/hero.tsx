"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { useSession } from "@/hooks/use-session";
import { Button } from "@/components/ui/button";
import { HeroDemo } from "@/components/landing/hero-demo";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const } },
};

export function Hero({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { data } = useSession();
  const lastSave = data?.saves?.[0];
  const playerLabel = data?.player
    ? data.player.isGuest
      ? dict.hero.guest
      : data.player.name
    : "…";

  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 sm:px-6 md:grid-cols-[1.1fr_0.9fr] md:pb-28 md:pt-24">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.p variants={item} className="label-mono mb-6 inline-flex items-center gap-2 rounded-full border border-surface px-3 py-1.5 text-gold">
            <span className="size-1.5 rounded-full bg-gold" />
            {dict.hero.eyebrow}
          </motion.p>

          <motion.h1
            variants={item}
            className="font-display text-[40px] font-medium leading-[1.04] tracking-tight text-foreground sm:text-[56px] md:text-[64px]"
          >
            {dict.hero.titleA}
            <br />
            <span className="text-gold">{dict.hero.titleB}</span>
          </motion.h1>

          <motion.p variants={item} className="font-body mt-6 max-w-xl text-base leading-[1.6] text-muted-foreground">
            {dict.hero.lead}
          </motion.p>

          <motion.div variants={item} className="mt-9 flex flex-wrap items-center gap-3">
            <Button
              asChild
              size="lg"
              className="rounded-full bg-gold px-7 text-primary-foreground transition-transform hover:-translate-y-0.5 hover:bg-gold/90"
            >
              <Link href={`/${locale}#games`}>
                {dict.hero.ctaPlay}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            {lastSave && lastSave.progress < 1 && (
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-surface bg-transparent px-7 text-gold-soft hover:bg-surface hover:text-gold-soft"
              >
                <Link href={`/${locale}/play/${lastSave.game}`}>{dict.hero.ctaContinue}</Link>
              </Button>
            )}
          </motion.div>

          <motion.p variants={item} className="label-mono mt-8 text-muted-foreground">
            {dict.hero.syncedAs}{" "}
            <span className="text-gold-soft">{playerLabel}</span>
          </motion.p>
        </motion.div>

        <HeroDemo locale={locale} dict={dict} />
      </div>
    </section>
  );
}
