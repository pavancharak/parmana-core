import crypto from "node:crypto";

import {
  ExecutionTrustRecordRepository,
  Receipt,
  VerificationStatus,
} from "@parmana/shared";

import { ReceiptGenerationError } from "../errors/ReceiptGenerationError.js";
import { VerificationFailedError } from "../errors/VerificationFailedError.js";

import { ReceiptCrypto } from "@parmana/crypto";

/**
 * Application service responsible for generating
 * Execution Trust Receipts.
 *
 * Receipts are immutable cryptographic attestations
 * of verified Execution Trust Records.
 */
export class ReceiptService {
  private readonly crypto = new ReceiptCrypto();

  constructor(private readonly trustRecords: ExecutionTrustRecordRepository) {
    Object.freeze(this);
  }

  /**
   * Generates a Receipt for the specified
   * Business Transaction.
   */
  async generate(businessTransactionId: string): Promise<Receipt> {
    //
    // 1. Load Trust Record
    //

    const trustRecord = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (!trustRecord) {
      throw new VerificationFailedError("Execution Trust Record not found.");
    }

    //
    // 2. Ensure latest Verification succeeded
    //

    const latestVerification = trustRecord.verifications.at(-1);

    if (
      !latestVerification ||
      latestVerification.status !== VerificationStatus.VERIFIED
    ) {
      throw new ReceiptGenerationError(
        "Execution Trust Record must be successfully verified before a Receipt can be generated.",
      );
    }

    //
    // 3. Compute receipt hash
    //

    const receiptHash = await this.crypto.hash(trustRecord);

    //
    // 4. Build and sign Receipt
    //

    const receipt = await this.crypto.createReceipt({
      receiptId: crypto.randomUUID(),

      businessTransactionId,

      trustRecordHash: trustRecord.trustRecordHash,

      receiptHash,

      issuedAt: new Date(),
    });

    //
    // 5. Persist Receipt
    //

    await this.trustRecords.appendReceipt(businessTransactionId, receipt);

    return receipt;
  }
}
