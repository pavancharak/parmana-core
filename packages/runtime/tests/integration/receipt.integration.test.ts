import { describe, expect, it } from "vitest";

import {
  BusinessTransaction,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Receipt,
  VerificationStatus,
} from "@parmana/shared";

import { ReceiptService } from "../../src/services/receipt-service.js";

/**
 * Receipt Integration Test
 *
 * Ensures cryptographic receipts are only
 * generated from verified Execution Trust Records.
 */
describe("Receipt Service", () => {
  it("generates a receipt after successful verification", async () => {
    //
    // Arrange
    //
    const transaction = {} as BusinessTransaction;

    const trustRecord: ExecutionTrustRecord = {
      trustRecordId: "tr-1",
      businessTransactionId: transaction.businessTransactionId,
      transaction,
      overrides: [],
      executions: [],
      verifications: [
        {
          verificationId: "v-1",
          businessTransactionId: transaction.businessTransactionId,
          status: VerificationStatus.VERIFIED,
          message: "ok",
          verifiedAt: new Date(),
          trustRecordHash: "hash",
        },
      ],
      receipts: [],
      trustRecordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    //
    // Partial repository double: ReceiptService.generate()
    // only calls findByTransactionId and appendReceipt, so
    // the other ExecutionTrustRecordRepository methods are
    // intentionally omitted here.
    //
    const receiptService = new ReceiptService({
      findByTransactionId: async () => trustRecord,
      appendReceipt: async () => {},
    } as unknown as ExecutionTrustRecordRepository);

    //
    // Act
    //
    const receipt: Receipt = await receiptService.generate(
      transaction.businessTransactionId,
    );

    //
    // Assert
    //
    expect(receipt.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );

    expect(receipt.trustRecordHash).toBe(trustRecord.trustRecordHash);

    expect(receipt.receiptId).toBeDefined();
  });

  it("fails when verification is missing", async () => {
    const transaction = {
      businessTransactionId: "tx-2",
    } as BusinessTransaction;

    const trustRecord: ExecutionTrustRecord = {
      trustRecordId: "tr-2",
      businessTransactionId: transaction.businessTransactionId,
      transaction,
      overrides: [],
      executions: [],
      verifications: [],
      receipts: [],
      trustRecordHash: "hash",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    //
    // Partial repository double — see rationale above.
    //
    const receiptService = new ReceiptService({
      findByTransactionId: async () => trustRecord,
      appendReceipt: async () => {},
    } as unknown as ExecutionTrustRecordRepository);

    //
    // Act + Assert
    //
    await expect(
      receiptService.generate(transaction.businessTransactionId),
    ).rejects.toThrow();
  });
});
