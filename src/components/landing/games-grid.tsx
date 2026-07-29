"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowUpRight, Sparkles, type LucideIcon } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { GAMES } from "@/lib/games/registry";
import { useSession } from "@/hooks/use-session";
import { Badge } from "@/components/ui/badge";

const cardVariants = {
  hidden: { opacity: 0, y: 28 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

type GameCardDef = {
  id: string;
  icon: LucideIcon;
  name: string;
  tagline: string;
  index: string;
};

export function GamesGrid({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const { data } = useSession();
  const saveFor = (game: string) => data?.saves.find((s) => s.game === game && s.progress < 1);

  const games: GameCardDef[] = [
    ...GAMES.map((g) => ({
      id: g.id as string,
      icon: g.icon,
      name: g.name(dict),
      tagline: g.tagline(dict),
      index: g.index,
    })),
    { id: "soon", icon: Sparkles, name: dict.games.soon.name, tagline: dict.games.soon.tagline, index: "00N" },
  ];

  return (
    <section id="games" className="border-t border-surface/60 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="label-mono text-gold">{dict.games.sectionEyebrow}</p>
        <h2 className="mt-3 font-display text-3xl font-medium tracking-tight text-foreground sm:text-4xl">
          {dict.games.sectionTitle}
        </h2>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game, i) => {
            const save = game.id !== "soon" ? saveFor(game.id) : undefined;
            const isSoon = game.id === "soon";
            const Icon = game.icon;

            const card = (
              <motion.article
                custom={i}
                variants={cardVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                whileHover={isSoon ? undefined : { y: -6 }}
                className={`group relative flex h-full flex-col rounded-lg border border-surface bg-card p-6 transition-colors ${
                  isSoon ? "opacity-60" : "hover:border-gold/50"
                }`}
              >
                <div className="flex items-start justify-between">
                  <span className="grid size-11 place-items-center rounded-lg bg-surface text-gold">
                    <Icon className="size-5" />
                  </span>
                  <span className="label-mono text-muted-foreground">{game.index}</span>
                </div>

                <h3 className="mt-5 font-display text-xl font-medium text-foreground">{game.name}</h3>
                <p className="font-body mt-2 flex-1 text-sm leading-[1.6] text-muted-foreground">
                  {game.tagline}
                </p>

                <div className="mt-6 flex items-center justify-between">
                  {isSoon ? (
                    <span className="label-mono text-muted-foreground">···</span>
                  ) : (
                    <span className="label-mono inline-flex items-center gap-1 text-gold transition-colors group-hover:text-gold-soft">
                      {save ? dict.games.continue : dict.games.play}
                      <ArrowUpRight className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                    </span>
                  )}
                  {save && (
                    <Badge className="rounded-full border-gold/30 bg-surface font-mono text-[10px] text-gold-soft">
                      {Math.round(save.progress * 100)}% · {dict.games.inProgress}
                    </Badge>
                  )}
                </div>
              </motion.article>
            );

            return isSoon ? (
              <div key={game.id}>{card}</div>
            ) : (
              <Link key={game.id} href={`/${locale}/play/${game.id}`} className="focus-visible:outline-2 focus-visible:outline-gold">
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
