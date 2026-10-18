import { TrustRecordHasher } from "./TrustRecordHasher.js";

/**
 * Receipt Hasher.
 */
export class ReceiptHasher {
  constructor(private readonly hasher: TrustRecordHasher) {}

  async hash(receipt: unknown): Promise<string> {
    return this.hasher.hash(receipt);
  }
}
