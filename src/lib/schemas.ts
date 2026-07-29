import { z } from "zod";

export const gameIdSchema = z.enum(["fifteen", "sudoku", "g2048", "memory"]);
export type GameId = z.infer<typeof gameIdSchema>;

export const saveGameSchema = z.object({
  state: z.string().min(2).max(50_000),
  progress: z.number().min(0).max(1),
});

export const resultSchema = z.object({
  game: gameIdSchema,
  moves: z.number().int().min(0),
  seconds: z.number().int().min(0),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export const registerSchema = z.object({
  name: z.string().min(1).max(40),
  email: z.string().email(),
  password: z.string().min(6).max(100),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(100),
});

export type PlayerDto = {
  id: string;
  name: string;
  email: string | null;
  isGuest: boolean;
};

export type SaveDto = {
  game: GameId;
  state: string;
  progress: number;
  updatedAt: string;
};
