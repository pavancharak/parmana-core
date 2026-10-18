import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  VerificationStatus,
  type BusinessTransaction,
  type Execution,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
} from "@parmana/shared";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import { VerificationService } from "../../src/services/verification-service.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

/**
 * Always-running, in-memory equivalent of
 * packages/api/tests/integration/verification-negative.integration.test.ts,
 * which is describe.skipIf(!supabaseConfigured)-gated and silently no-ops
 * without live Supabase credentials. This file exercises the same
 * tamper-after-persist shape — a genuinely signed record, mutated post-seal,
 * must fail verification — without depending on any external service, so
 * the claim it backs (CLAIMS.md §2.15) is provable on every test run.
 *
 * Covers three independent mutation shapes: a payload field inside the
 * signed BusinessTransaction, the signature value, and an element inside
 * one of the hash-chain-participating arrays (executions/overrides).
 */

class InMemoryExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  private readonly store = new Map<string, ExecutionTrustRecord>();

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

  async appendVerification(): Promise<void> {}

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
 * Builds a genuinely hashed and signed Execution Trust Record via the real
 * BusinessTrustRecordBuilder, matching verification-service.test.ts's
 * convention.
 */
async function buildTrustRecord(
  businessTransactionId: string,
): Promise<ExecutionTrustRecord> {
  const transaction = createTransaction(businessTransactionId);
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  const execution: Execution = {
    executionId: `exec-${businessTransactionId}`,
    businessTransactionId,

    decision: {
      decisionId: `decision-${businessTransactionId}`,
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

    metadata: { authorizationId: "authorization-xyz" },
  };

  const context: RuntimeContext = {
    transaction,
    decision: execution.decision,
    execution,
  };

  return new BusinessTrustRecordBuilder().build(context);
}

describe("VerificationService negative cases (in-memory, always-on)", () => {
  it("fails integrity when a payload field inside the signed transaction is mutated after persistence", async () => {
    const trustRecord = await buildTrustRecord(
      "txn-tampered-transaction-field",
    );

    //
    // transaction is part of VerificationCrypto.canonicalRecord(), so
    // mutating a field inside it — without recomputing the hash/signature
    // — reproduces the same "content changed, hash didn't" gap the
    // Supabase-gated integration test proves against a live database.
    //
    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      transaction: {
        ...trustRecord.transaction,
        intent: {
          ...trustRecord.transaction.intent,
          parameters: { amount: 999999 },
        },
      },
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-tampered-transaction-field");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Integrity check failed");
  });

  it("fails signature verification when the signature value is mutated after persistence", async () => {
    const trustRecord = await buildTrustRecord("txn-tampered-signature-value");

    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      signature: {
        ...trustRecord.signature,
        value: "not-a-real-signature",
      },
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-tampered-signature-value");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Signature check failed");
  });

  it("fails integrity when an element of the executions hash-chain array is mutated after persistence", async () => {
    const trustRecord = await buildTrustRecord("txn-tampered-execution-link");

    //
    // Mirrors packages/api/tests/integration/verification-negative
    // .integration.test.ts's use of replaceExecution() against a live
    // database: the executions array is one of the two collections
    // VerificationCrypto.canonicalRecord() hashes, so altering one of its
    // elements — here, flipping the completed Execution's status — is a
    // hash-chain-link mutation distinct from corrupting trustRecordHash
    // directly or mutating a top-level transaction field.
    //
    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      executions: [
        {
          ...trustRecord.executions[0]!,
          status: ExecutionStatus.FAILED,
        },
      ],
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-tampered-execution-link");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Integrity check failed");
  });
});
