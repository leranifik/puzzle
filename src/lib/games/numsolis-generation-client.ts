import { deserializeNumsolis, type NumsolisDifficulty, type NumsolisState } from "./numsolis";

/** A fresh, short-lived worker keeps all construction/verification off the UI. */
export function generateNumsolis(difficulty: NumsolisDifficulty, seed: number): Promise<NumsolisState> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL("./numsolis-generation.worker.ts", import.meta.url), { type: "module" });
    } catch (error) {
      reject(error);
      return;
    }
    const finish = () => {
      clearTimeout(timeout);
      worker.terminate();
    };
    const timeout = setTimeout(() => {
      finish();
      reject(new Error("Numsolis generation timed out"));
    }, 15_000);
    worker.onmessage = (event: MessageEvent<unknown>) => {
      finish();
      const state = typeof event.data === "string" ? deserializeNumsolis(event.data) : null;
      if (!state || state.difficulty !== difficulty || state.seed !== seed) reject(new Error("Invalid Numsolis worker response"));
      else resolve(state);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      finish();
      reject(new Error("Numsolis generation failed"));
    };
    worker.onmessageerror = () => {
      finish();
      reject(new Error("Invalid Numsolis worker message"));
    };
    try {
      worker.postMessage({ difficulty, seed });
    } catch (error) {
      finish();
      reject(error);
    }
  });
}
