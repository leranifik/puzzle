import { describe, expect, it } from "vitest";
import { applyMove, deserializeNumsolis, isNumsolisWon, serializeNumsolis, type NumsolisDifficulty } from "@/lib/games/numsolis";
import { buildNumsolisCandidate, generateNumsolisDeal, matchesNumsolisProfile, NUMSOLIS_RESERVE_SEEDS, verifyNumsolisSolution } from "@/lib/games/numsolis-generator";

const modes: NumsolisDifficulty[] = ["easy", "medium", "hard"];
for (const difficulty of modes) {
  describe(`Numsolis ${difficulty} generation`, () => {
    it("replays 100 different seeds to ALL 2048s using the ordinary engine", () => {
      const boards = new Set<string>();
      const majorities = new Set<number>();
      for (let seed = 0; seed < 100; seed++) {
        const deal = generateNumsolisDeal(difficulty, seed);
        const initial = serializeNumsolis(deal.state);
        expect(matchesNumsolisProfile(deal.state.columns, difficulty)).toBe(true);
        expect(deserializeNumsolis(initial)).toEqual(deal.state);
        boards.add(JSON.stringify(deal.state.columns));
        const light = deal.state.columns.filter((c) => c[0].suit === 0).length;
        majorities.add(light >= 5 ? 0 : 1);
        let played = deal.state;
        for (const move of deal.solution) {
          const next = applyMove(played, move);
          expect(next).not.toBeNull();
          played = next!;
        }
        expect(isNumsolisWon(played)).toBe(true);
        expect(played.columns.flat()).toHaveLength(difficulty === "easy" ? 1 : 2);
        expect(serializeNumsolis(deal.state)).toBe(initial);
      }
      expect(boards.size).toBeGreaterThan(95);
      if (difficulty === "hard") expect(majorities.size).toBe(2);
    });

    it("reproduces seeds, including zero and maximum uint32", () => {
      for (const seed of [0, 41, 0xffffffff]) {
        expect(generateNumsolisDeal(difficulty, seed)).toEqual(generateNumsolisDeal(difficulty, seed));
      }
    });

    it("has a replay-verified reserve when construction attempts are exhausted", () => {
      for (let seed = 0; seed < 10; seed++) {
        const deal = generateNumsolisDeal(difficulty, seed, { maxAttempts: 0 });
        expect(deal.source).toBe("fallback");
        expect(deal.state.seed).toBe(seed);
        expect(matchesNumsolisProfile(deal.state.columns, difficulty)).toBe(true);
        expect(verifyNumsolisSolution(deal.state, deal.solution)).toBe(true);
      }
    });

    it("rejects incomplete or illegal solution certificates", () => {
      const deal = generateNumsolisDeal(difficulty, 1);
      expect(verifyNumsolisSolution(deal.state, [])).toBe(false);
      expect(verifyNumsolisSolution(deal.state, deal.solution.slice(0, -1))).toBe(false);
      expect(verifyNumsolisSolution(deal.state, [{ from: 0, index: 0, to: 0 }, ...deal.solution])).toBe(false);
    });

    it("checks every reserve recipe", () => {
      for (const seed of NUMSOLIS_RESERVE_SEEDS[difficulty]) {
        const candidate = buildNumsolisCandidate(difficulty, seed);
        expect(candidate, `invalid reserve ${difficulty}/${seed}`).not.toBeNull();
        expect(verifyNumsolisSolution(candidate!.state, candidate!.solution)).toBe(true);
      }
    });
  });
}

it("rejects invalid seeds and attempt budgets", () => {
  for (const seed of [-1, 0.5, NaN, Infinity, 0x100000000]) expect(() => generateNumsolisDeal("easy", seed)).toThrow();
  for (const maxAttempts of [-1, 1.1, 33, Infinity]) expect(() => generateNumsolisDeal("easy", 1, { maxAttempts })).toThrow();
});
