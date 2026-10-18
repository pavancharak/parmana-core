import { TrustRecordHasher } from "./TrustRecordHasher.js";

/**
 * Execution Chain Hasher.
 */
export class ExecutionChainHasher {
  constructor(private readonly hasher: TrustRecordHasher) {}

  async hash(chainEntry: unknown): Promise<string> {
    return this.hasher.hash(chainEntry);
  }
}
