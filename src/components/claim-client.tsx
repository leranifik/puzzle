"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type { Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n/get-dictionary";
import { api, ApiError } from "@/lib/api";
import { sessionKey } from "@/hooks/use-session";
import { haptics } from "@/lib/telegram-client";
import { GAMES } from "@/lib/games/registry";
import { Button } from "@/components/ui/button";

type Phase = "claiming" | "success" | "expired";

export function ClaimClient({
  locale,
  dict,
  token,
}: {
  locale: Locale;
  dict: Dictionary;
  token: string;
}) {
  const t = dict.link;
  const [phase, setPhase] = useState<Phase>("claiming");
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [mergedGames, setMergedGames] = useState<string[]>([]);
  const qc = useQueryClient();
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    api
      .claimDeviceLink(token)
      .then((data) => {
        setPlayerName(data.player.name);
        setMergedGames(data.mergedGames);
        setPhase("success");
        haptics.success();
        qc.invalidateQueries({ queryKey: sessionKey });
      })
      .catch((error: unknown) => {
        setPhase("expired");
        if (error instanceof ApiError && error.status === 410) haptics.error();
      });
  }, [token, qc]);

  const gameName = (id: string) =>
    GAMES.find((g) => g.id === id)?.name(dict) ?? id;

  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="hairline flex w-full max-w-sm flex-col items-center rounded-lg bg-card px-8 py-10 text-center shadow-2xl shadow-black/50"
      >
        {phase === "claiming" && (
          <>
            <Loader2 className="size-10 animate-spin text-gold" />
            <p className="font-display mt-5 text-lg font-medium text-foreground">{t.claiming}</p>
          </>
        )}

        {phase === "success" && (
          <>
            <CheckCircle2 className="size-10 text-gold" />
            <h1 className="font-display mt-5 text-xl font-medium text-foreground">
              {t.claimSuccess}
            </h1>
            {playerName && (
              <p className="label-mono mt-2 text-gold-soft">{playerName}</p>
            )}
            {mergedGames.length > 0 && (
              <p className="font-body mt-3 text-sm text-muted-foreground">
                {t.claimMerged}{" "}
                <span className="text-gold-soft">
                  {mergedGames.map(gameName).join(", ")}
                </span>
              </p>
            )}
            <Button
              asChild
              className="mt-7 rounded-full bg-gold px-7 text-primary-foreground hover:bg-gold/90"
            >
              <Link href={`/${locale}/games`}>{t.goPlay}</Link>
            </Button>
          </>
        )}

        {phase === "expired" && (
          <>
            <XCircle className="size-10 text-destructive" />
            <h1 className="font-display mt-5 text-xl font-medium text-foreground">
              {t.claimExpired}
            </h1>
            <p className="font-body mt-2 text-sm text-muted-foreground">{t.claimExpiredHint}</p>
            <Button
              asChild
              variant="outline"
              className="mt-7 rounded-full border-surface bg-transparent text-gold-soft hover:bg-surface"
            >
              <Link href={`/${locale}/games`}>{t.goPlay}</Link>
            </Button>
          </>
        )}
      </motion.div>
    </main>
  );
}
