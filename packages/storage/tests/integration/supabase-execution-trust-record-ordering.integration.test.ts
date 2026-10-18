import crypto from "node:crypto";

import { VerificationCrypto } from "@parmana/crypto";

import { describe, expect, it } from "vitest";

import { SupabaseBusinessTransactionRepository } from "../../src/supabase/SupabaseBusinessTransactionRepository.js";
import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseExecutionTrustRecordRepository } from "../../src/supabase/SupabaseExecutionTrustRecordRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

import {
  buildBusinessTransaction,
  buildReceiptPair,
  buildSignedMultiExecutionOverrideRecord,
  buildVerificationPair,
} from "../fixtures/multi-item-trust-record.js";

const databaseConfigured = resolveDatabaseGate(
  "Supabase Execution Trust Record Ordering",
);

/**
 * Live-database counterpart to the unconditional in-memory ordering test
 * (tests/unit/execution-trust-record-ordering.test.ts). Confirms the
 * ORDER BY <timestamp> ASC, seq ASC fix in
 * SupabaseExecutionTrustRecordRepository.findByTransactionId reconstructs
 * executions/overrides/verifications/receipts in insertion order against a
 * real database, so a Trust Record with 2+ items per collection still
 * hashes and verifies after a round trip.
 *
 * Requires the seq migration (supabase/migrations/
 * 20260711120000_add_trust_record_sequence_columns.sql) to have been
 * applied to the target project.
 *
 * Writes via PostgresPoolFactory (DATABASE_URL) now, not a
 * supabase-js/PostgREST client — see SupabaseExecutionTrustRecordRepository
 * for why.
 */
describe.skipIf(!databaseConfigured)(
  "SupabaseExecutionTrustRecordRepository ordering",
  () => {
    it("round-trips a Trust Record with 2+ items per collection without breaking hash or signature", async () => {
      const pool = PostgresPoolFactory.create();

      const businessTransactions = new SupabaseBusinessTransactionRepository(
        pool,
      );

      const trustRecords = new SupabaseExecutionTrustRecordRepository(pool);

      const transaction = buildBusinessTransaction(crypto.randomUUID());

      await businessTransactions.create(transaction);

      const signedRecord =
        await buildSignedMultiExecutionOverrideRecord(transaction);

      await trustRecords.create(signedRecord);

      for (const execution of signedRecord.executions) {
        await trustRecords.appendExecution(
          transaction.businessTransactionId,
          execution,
        );
      }

      for (const override of signedRecord.overrides) {
        await trustRecords.appendOverride(
          transaction.businessTransactionId,
          override,
        );
      }

      const [verification1, verification2] = buildVerificationPair(
        transaction.businessTransactionId,
        signedRecord.trustRecordHash,
      );

      await trustRecords.appendVerification(
        transaction.businessTransactionId,
        verification1,
      );
      await trustRecords.appendVerification(
        transaction.businessTransactionId,
        verification2,
      );

      const [receipt1, receipt2] = buildReceiptPair(
        transaction.businessTransactionId,
        signedRecord.trustRecordHash,
      );

      await trustRecords.appendReceipt(
        transaction.businessTransactionId,
        receipt1,
      );
      await trustRecords.appendReceipt(
        transaction.businessTransactionId,
        receipt2,
      );

      const reloaded = await trustRecords.findByTransactionId(
        transaction.businessTransactionId,
      );

      expect(reloaded).not.toBeNull();

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

      const verificationCrypto = new VerificationCrypto();

      const recomputedHash = await verificationCrypto.hash(reloaded!);

      expect(recomputedHash).toBe(reloaded!.trustRecordHash);

      const verified = await verificationCrypto.verify(reloaded!);

      expect(verified).toBe(true);
    }, 30000);
  },
);
