import type { ReplayResult } from "./types/ReplayResult.js";

export class ReplayVerifier {
  verify(original: ReplayResult, replayed: ReplayResult): boolean {
    return JSON.stringify(original) === JSON.stringify(replayed);
  }
}
