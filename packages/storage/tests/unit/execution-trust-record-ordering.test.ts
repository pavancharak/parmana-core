import crypto from "node:crypto";

import { VerificationCrypto } from "@parmana/crypto";

import { describe, expect, it } from "vitest";

import { MemoryExecutionTrustRecordRepository } from "../../src/memory/MemoryExecutionTrustRecordRepository.js";

import {
  buildBusinessTransaction,
  buildReceiptPair,
  buildSignedMultiExecutionOverrideRecord,
  buildVerificationPair,
} from "../fixtures/multi-item-trust-record.js";

/**
 * Reference-behavior counterpart to the Supabase ordering fix. This
 * repository already preserves insertion order via plain array append
 * (see MemoryExecutionTrustRecordRepository.appendExecution/appendOverride/
 * appendVerification/appendReceipt), so it is expected to pass without the
 * ORDER BY / seq changes made to SupabaseExecutionTrustRecordRepository.
 * It runs unconditionally, unlike the Supabase counterpart, to guarantee
 * this specific guarantee — round-tripping a Trust Record with 2+ items
 * per collection without breaking its hash or signature — is exercised on
 * every test run, not only when Supabase credentials happen to be present.
 */
describe("ExecutionTrustRecordRepository ordering (in-memory)", () => {
  it("round-trips a Trust Record with 2+ items per collection without breaking hash or signature", async () => {
    const transaction = buildBusinessTransaction(crypto.randomUUID());

    const signedRecord =
      await buildSignedMultiExecutionOverrideRecord(transaction);

    const repository = new MemoryExecutionTrustRecordRepository();

    await repository.create(signedRecord);

    const [verification1, verification2] = buildVerificationPair(
      transaction.businessTransactionId,
      signedRecord.trustRecordHash,
    );

    await repository.appendVerification(
      transaction.businessTransactionId,
      verification1,
    );
    await repository.appendVerification(
      transaction.businessTransactionId,
      verification2,
    );

    const [receipt1, receipt2] = buildReceiptPair(
      transaction.businessTransactionId,
      signedRecord.trustRecordHash,
    );

    await repository.appendReceipt(transaction.businessTransactionId, receipt1);
    await repository.appendReceipt(transaction.businessTransactionId, receipt2);

    const reloaded = await repository.findByTransactionId(
      transaction.businessTransactionId,
    );

    expect(reloaded).not.toBeNull();

    //
    // Explicit ordering assertions — insertion order must survive
    // the round trip for every collection.
    //
    expect(reloaded!.executions.map((e) => e.executionId)).toEqual(
      signedRecord.executions.map((e) => e.executionId),
    );
    expect(reloaded!.overrides.map((o) => o.overrideId)).toEqual(
      signedRecord.overrides.map((o) => o.overrideId),
    );
    expect(reloaded!.verifications.map((v) => v.verificationId)).toEqual([
      verification1.verificationId,
      verification2.verificationId,
    ]);
    expect(reloaded!.receipts.map((r) => r.receiptId)).toEqual([
      receipt1.receiptId,
      receipt2.receiptId,
    ]);

    //
    // Hash and signature must still validate against the reloaded
    // record — this is the actual regression this suite guards
    // against: reordered executions/overrides recompute to a
    // different hash than what was signed.
    //
    const verificationCrypto = new VerificationCrypto();

    const recomputedHash = await verificationCrypto.hash(reloaded!);

    expect(recomputedHash).toBe(reloaded!.trustRecordHash);

    const verified = await verificationCrypto.verify(reloaded!);

    expect(verified).toBe(true);
  });
});
