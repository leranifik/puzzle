import { newNumsolis } from "./numsolis-generator";
import { serializeNumsolis, type NumsolisDifficulty } from "./numsolis";

self.onmessage = (event: MessageEvent<{ difficulty: NumsolisDifficulty; seed: number }>) => {
  try {
    self.postMessage(serializeNumsolis(newNumsolis(event.data.difficulty, event.data.seed)));
  } catch {
    self.postMessage(null);
  }
};
