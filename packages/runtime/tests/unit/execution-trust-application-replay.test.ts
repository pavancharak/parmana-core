import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type BusinessTransaction,
  type Execution,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type Verification,
} from "@parmana/shared";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import { ExecutionTrustApplication } from "../../src/ExecutionTrustApplication.js";
import { VerificationFailedError } from "../../src/errors/VerificationFailedError.js";
import { VerificationService } from "../../src/services/verification-service.js";
import type { BusinessTransactionService } from "../../src/services/business-transaction-service.js";
import type { ReceiptService } from "../../src/services/receipt-service.js";
import type { Runtime } from "../../src/Runtime.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

//
// Phase 2G / TD-13. ExecutionTrustApplication.replay() only ever
// touches its own `trustRecords` repository and `crypto` field --
// `transactions`, `runtime`, and `receipts` are unused by this
// method. Standing in inert stubs for the unused dependencies lets
// this suite target replay() directly, without pulling in a full
// RuntimeEngine/ExecutionSystem, and without the Supabase gate that
// skips packages/api/tests/integration/replay.integration.test.ts
// when no database is configured.
//
class InMemoryExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  private readonly store = new Map<string, ExecutionTrustRecord>();

  public readonly appendedVerifications: Verification[] = [];

  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    this.store.set(record.businessTransactionId, record);
    return record;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null> {
    return this.store.get(businessTransactionId) ?? null;
  }

  async appendExecution(): Promise<void> {}

  async replaceExecution(): Promise<void> {}

  async appendOverride(): Promise<void> {}

  async appendVerification(
    _businessTransactionId: string,
    verification: Verification,
  ): Promise<void> {
    this.appendedVerifications.push(verification);
  }

  async appendReceipt(): Promise<void> {}
}

function createTransaction(businessTransactionId: string): BusinessTransaction {
  const authorityId = "authority-1";
  const authorizationId = "authorization-1";
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  return {
    businessTransactionId,

    metadata: {
      businessTransactionId,
    },

    authority: {
      authorityId,
      authorityType: AuthorityType.SERVICE,
      principalId: "svc-1",
      issuedAt: fixedDate,
    },

    authorization: {
      authorizationId,
      authorityId,
      purpose: "test",
      issuedAt: fixedDate,
    },

    intent: {
      intentId: "intent-1",
      authorizationId,
      action: "PAY",
      target: "vendor/1",
      parameters: { amount: 100 },
      createdAt: fixedDate,
    },

    policy: {
      name: "payment-approval",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },

    signals: { amount: 100 },

    status: BusinessTransactionStatus.RECEIVED,

    createdAt: fixedDate,
  };
}

/**
 * Builds a genuinely hashed and signed Execution Trust Record via
 * the real BusinessTrustRecordBuilder, matching the conventions of
 * verification-service.test.ts, so these tests exercise real
 * canonicalization, hashing, and signing rather than hand-rolled
 * substitutes.
 */
async function buildTrustRecord(options: {
  businessTransactionId: string;
  authorizationId?: string;
}): Promise<ExecutionTrustRecord> {
  const transaction = createTransaction(options.businessTransactionId);

  const fixedDate = new Date("2026-01-01T00:00:00Z");

  const execution: Execution = {
    executionId: `exec-${options.businessTransactionId}`,
    businessTransactionId: options.businessTransactionId,

    decision: {
      decisionId: `decision-${options.businessTransactionId}`,
      intentId: "intent-1",
      policy: transaction.policy,
      signals: transaction.signals as Record<string, never>,
      outcome: DecisionOutcome.APPROVED,
      evaluatedAt: fixedDate,
    },

    status: ExecutionStatus.COMPLETED,
    mode: ExecutionMode.SYNC,
    startedAt: fixedDate,
    completedAt: fixedDate,

    metadata: {
      authorizationId: options.authorizationId ?? "authorization-xyz",
    },
  };

  const context: RuntimeContext = {
    transaction,
    decision: execution.decision,
    execution,
  };

  return new BusinessTrustRecordBuilder().build(context);
}

/**
 * Builds an ExecutionTrustApplication wired to a real
 * VerificationService and the repository under test, with inert
 * stubs for the constructor dependencies replay() never touches.
 */
function buildApplication(
  repository: ExecutionTrustRecordRepository,
): ExecutionTrustApplication {
  return new ExecutionTrustApplication(
    {} as BusinessTransactionService,
    {} as Runtime,
    new VerificationService(repository),
    {} as ReceiptService,
    repository,
  );
}

describe("ExecutionTrustApplication.replay() (TD-13 / Phase 2G)", () => {
  it("reports verified: true and the stored hash for a valid Trust Record", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-replay-valid",
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const application = buildApplication(repository);

    const replay = await application.replay("txn-replay-valid");

    expect(replay).toEqual({
      businessTransactionId: "txn-replay-valid",
      trustRecordHash: trustRecord.trustRecordHash,
      verified: true,
    });
  });

  it("is deterministic: repeated calls against the same record produce identical results", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-replay-deterministic",
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const application = buildApplication(repository);

    const first = await application.replay("txn-replay-deterministic");
    const second = await application.replay("txn-replay-deterministic");

    expect(first).toEqual(second);
  });

  it("does not persist a Verification record -- diverges from verify(), which does", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-replay-no-side-effect",
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const application = buildApplication(repository);

    await application.replay("txn-replay-no-side-effect");

    expect(repository.appendedVerifications).toHaveLength(0);
  });

  it("cannot fabricate a valid result for a Trust Record with a tampered hash", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-replay-tampered-hash",
    });

    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      trustRecordHash: "tampered-hash-value",
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const application = buildApplication(repository);

    const replay = await application.replay("txn-replay-tampered-hash");

    expect(replay.verified).toBe(false);

    // Reports the actual (tampered) stored hash rather than
    // silently substituting or omitting it.
    expect(replay.trustRecordHash).toBe("tampered-hash-value");
  });

  it("cannot fabricate a valid result for a Trust Record with a tampered signature", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-replay-tampered-signature",
    });

    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      signature: {
        ...trustRecord.signature,
        value: "not-a-real-signature",
      },
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const application = buildApplication(repository);

    const replay = await application.replay("txn-replay-tampered-signature");

    expect(replay.verified).toBe(false);
  });

  it("throws VerificationFailedError for an unknown Business Transaction and fabricates no Trust Record, Receipt, or vendor evidence", async () => {
    const repository = new InMemoryExecutionTrustRecordRepository();

    const application = buildApplication(repository);

    await expect(application.replay("txn-does-not-exist")).rejects.toThrow(
      VerificationFailedError,
    );

    // No record was created as a side effect of the failed replay.
    expect(
      await repository.findByTransactionId("txn-does-not-exist"),
    ).toBeNull();
  });
});
