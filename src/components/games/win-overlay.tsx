"use client";

import { motion } from "framer-motion";
import type { Dictionary } from "@/i18n/get-dictionary";
import { Button } from "@/components/ui/button";
import { PartyPopper } from "lucide-react";
import { formatTime } from "./game-shell";

export function WinOverlay({
  dict,
  text,
  moves,
  seconds,
  onPlayAgain,
}: {
  dict: Dictionary;
  text: string;
  moves: number;
  seconds: number;
  onPlayAgain: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="absolute inset-0 z-10 grid place-items-center rounded-lg bg-background/85 backdrop-blur-sm"
    >
      <motion.div
        initial={{ scale: 0.85, y: 16, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 220, damping: 20 }}
        className="hairline mx-4 flex flex-col items-center rounded-lg bg-card px-8 py-8 text-center shadow-2xl shadow-black/50"
      >
        <span className="grid size-12 place-items-center rounded-full bg-gold/15 text-gold">
          <PartyPopper className="size-6" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-medium text-foreground">{dict.game.youWon}</h2>
        <p className="font-body mt-1.5 text-sm text-muted-foreground">{text}</p>
        <p className="label-mono mt-4 text-gold-soft">
          {moves} {dict.game.moves} · {formatTime(seconds)}
        </p>
        <Button
          onClick={onPlayAgain}
          className="mt-6 rounded-full bg-gold px-6 text-primary-foreground hover:bg-gold/90"
        >
          {dict.game.playAgain}
        </Button>
      </motion.div>
    </motion.div>
  );
}
