import { randomUUID } from "node:crypto";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { beforeAll, describe, expect, it } from "vitest";

import request from "supertest";

import type { ExecutionTrustRecord, Override } from "@parmana/shared";
import { VerificationCrypto } from "@parmana/crypto";
import { SupabaseStorageProvider } from "@parmana/storage";
import { VerificationService } from "@parmana/runtime";

beforeAll(() => {
  process.env.PARMANA_STORAGE = "supabase";
});

import app from "../test-app.js";
import { resolveDatabaseGate } from "../helpers/database-availability.js";

const databaseConfigured = resolveDatabaseGate("Supabase Workflow Integration");

describe.skipIf(!databaseConfigured)("Supabase Workflow Integration", () => {
  it("executes a Business Transaction", async () => {
    //
    // Create Transaction
    //
    const transaction = await createBusinessTransaction();

    //
    // Execute
    //
    const response = await request(app).post("/execute").send(transaction);

    console.log("EXECUTE:", response.status);

    console.log(response.body);

    expect(response.status).toBe(200);

    const trustRecord = response.body;

    //
    // Verify
    //
    const verifyResponse = await request(app).post("/verify").send({
      businessTransactionId: trustRecord.businessTransactionId,
    });

    console.log("VERIFY:", verifyResponse.status);

    console.log(verifyResponse.body);

    expect(verifyResponse.status).toBe(200);

    //
    // Receipt
    //
    const receiptResponse = await request(app).post("/receipt").send({
      businessTransactionId: trustRecord.businessTransactionId,
    });

    console.log("RECEIPT:", receiptResponse.status);

    console.log(receiptResponse.body);

    expect(receiptResponse.status).toBe(200);
  }, 30000);

  it("round-trips an override through the Supabase repository and still verifies", async () => {
    const storage = new SupabaseStorageProvider();

    const transaction = await createBusinessTransaction();

    await storage.businessTransactions.create(transaction);

    const override: Override = {
      overrideId: randomUUID(),
      businessTransactionId: transaction.businessTransactionId,
      approvedBy: "integration-test",
      reason: "override round-trip test",
      approvedAt: new Date(),
    };

    //
    // The Trust Record's hash/signature must be computed
    // over content that already includes the override —
    // appendOverride() (like OverrideService) never
    // recomputes them, so a record hashed without its
    // override can never verify once one is added.
    //
    const crypto = new VerificationCrypto();

    const unsigned: ExecutionTrustRecord = {
      trustRecordId: randomUUID(),
      businessTransactionId: transaction.businessTransactionId,
      transaction,
      overrides: [override],
      executions: [],
      verifications: [],
      receipts: [],
      trustRecordHash: "",
      signature: {
        algorithm: "ed25519",
        keyId: "default",
        value: "",
        signedAt: new Date(),
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as ExecutionTrustRecord;

    const trustRecordHash = await crypto.hash(unsigned);
    const signature = await crypto.sign(unsigned);

    await storage.trustRecords.create({
      ...unsigned,
      trustRecordHash,
      signature,
    });

    await storage.trustRecords.appendOverride(
      transaction.businessTransactionId,
      override,
    );

    const reloaded = await storage.trustRecords.findByTransactionId(
      transaction.businessTransactionId,
    );

    expect(reloaded?.overrides.length).toBe(1);
    expect(reloaded?.overrides[0]?.overrideId).toBe(override.overrideId);

    //
    // Verify against the same real Supabase-backed repository this
    // test wrote to directly (storage.trustRecords), not through
    // request(app) — app's own repositories are always in-memory
    // under NODE_ENV=test (G-15, docs/VERIFICATION-GAPS.md), so an
    // HTTP round-trip here would look up this record in a store
    // that never received it. VerificationService is the exact
    // class the real /verify route delegates to
    // (ExecutionTrustApplication.verify), so this still exercises
    // production verification logic, just constructed directly
    // against the real repository instead of through the app.
    //
    const verification = await new VerificationService(
      storage.trustRecords,
    ).verify(transaction.businessTransactionId);

    expect(verification.status).toBe("VERIFIED");
  }, 30000);
});
