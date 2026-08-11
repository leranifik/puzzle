import { Grid3X3, Hash, Boxes, Copy, Layers3, type LucideIcon } from "lucide-react";
import type { GameId } from "@/lib/schemas";
import type { Dictionary } from "@/i18n/get-dictionary";

export type GameMeta = {
  id: GameId;
  icon: LucideIcon;
  index: string;
  name: (dict: Dictionary) => string;
  tagline: (dict: Dictionary) => string;
};

export const GAMES: GameMeta[] = [
  {
    id: "fifteen",
    icon: Grid3X3,
    index: "001",
    name: (d) => d.games.fifteen.name,
    tagline: (d) => d.games.fifteen.tagline,
  },
  {
    id: "sudoku",
    icon: Hash,
    index: "002",
    name: (d) => d.games.sudoku.name,
    tagline: (d) => d.games.sudoku.tagline,
  },
  {
    id: "g2048",
    icon: Boxes,
    index: "003",
    name: (d) => d.games.g2048.name,
    tagline: (d) => d.games.g2048.tagline,
  },
  {
    id: "memory",
    icon: Copy,
    index: "004",
    name: (d) => d.games.memory.name,
    tagline: (d) => d.games.memory.tagline,
  },
  {
    id: "numsolis",
    icon: Layers3,
    index: "005",
    name: (d) => d.games.numsolis.name,
    tagline: (d) => d.games.numsolis.tagline,
  },
];
