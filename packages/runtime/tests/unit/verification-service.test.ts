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
  type Verification,
} from "@parmana/shared";

import { ExecutionChainCrypto } from "@parmana/crypto";

import { BusinessTrustRecordBuilder } from "../../src/BusinessTrustRecordBuilder.js";
import { VerificationService } from "../../src/services/verification-service.js";
import type { RuntimeContext } from "../../src/context/RuntimeContext.js";

//
// In-memory repository test double, matching the
// conventions of execution-authorization-wiring.test.ts.
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
 * Builds a genuinely hashed and signed Execution Trust
 * Record via the real BusinessTrustRecordBuilder — the
 * same machinery the live runtime uses — so tests exercise
 * real canonicalization, hashing, and signing rather than
 * hand-rolled substitutes.
 */
async function buildTrustRecord(options: {
  businessTransactionId: string;
  decisionOutcome: DecisionOutcome;
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
      outcome: options.decisionOutcome,
      evaluatedAt: fixedDate,
    },

    status: ExecutionStatus.COMPLETED,
    mode: ExecutionMode.SYNC,
    startedAt: fixedDate,
    completedAt: fixedDate,

    metadata:
      options.authorizationId === undefined
        ? {}
        : { authorizationId: options.authorizationId },
  };

  const context: RuntimeContext = {
    transaction,
    decision: execution.decision,
    execution,
  };

  return new BusinessTrustRecordBuilder().build(context);
}

/**
 * Builds a trust record whose sole Execution carries real,
 * signed chain fields (via the real ExecutionChainCrypto — the
 * same machinery ExecutionService uses), optionally with a
 * corrupted previousChainHash to exercise the broken-chain path.
 */
async function buildChainedTrustRecord(options: {
  businessTransactionId: string;
  corruptPreviousChainHash?: boolean;
}): Promise<ExecutionTrustRecord> {
  const transaction = createTransaction(options.businessTransactionId);

  const fixedDate = new Date("2026-01-01T00:00:00Z");

  const draft: Execution = {
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

    metadata: { authorizationId: "authorization-xyz" },
  };

  const chainFields = await new ExecutionChainCrypto().chain(draft, null);

  const execution: Execution = {
    ...draft,
    ...chainFields,

    ...(options.corruptPreviousChainHash && {
      previousChainHash: "forged-predecessor-hash",
    }),
  };

  const context: RuntimeContext = {
    transaction,
    decision: execution.decision,
    execution,
  };

  return new BusinessTrustRecordBuilder().build(context);
}

describe("VerificationService (live path)", () => {
  it("verifies a valid record: hash, signature, and authorization binding all pass", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-valid",
      decisionOutcome: DecisionOutcome.APPROVED,
      authorizationId: "authorization-xyz",
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-valid");

    expect(verification.status).toBe(VerificationStatus.VERIFIED);
    expect(verification.message).toBe(
      "Execution Trust Record verified successfully.",
    );
  });

  it("fails with a named hash mismatch when the stored hash no longer matches the record", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-tampered-hash",
      decisionOutcome: DecisionOutcome.APPROVED,
      authorizationId: "authorization-xyz",
    });

    //
    // trustRecordHash is not part of the signed canonical
    // content (see VerificationCrypto.canonicalRecord), so
    // corrupting only this field isolates the integrity
    // check from the signature check.
    //
    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      trustRecordHash: "tampered-hash-value",
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-tampered-hash");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Integrity check failed");
    expect(verification.message).toContain("tampered-hash-value");
    expect(verification.message).not.toContain("Signature check failed");
    expect(verification.message).not.toContain(
      "Authorization binding check failed",
    );
  });

  it("fails signature verification when the signature value is tampered", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-tampered-signature",
      decisionOutcome: DecisionOutcome.APPROVED,
      authorizationId: "authorization-xyz",
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

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-tampered-signature");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Signature check failed");
    expect(verification.message).not.toContain("Integrity check failed");
    expect(verification.message).not.toContain(
      "Authorization binding check failed",
    );
  });

  it("fails authorization binding when an APPROVED execution has no authorizationId", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-missing-authorization",
      decisionOutcome: DecisionOutcome.APPROVED,
      // authorizationId intentionally omitted
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-missing-authorization");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain(
      "Authorization binding check failed",
    );
    expect(verification.message).toContain(
      trustRecord.executions[0]!.executionId,
    );
    expect(verification.message).not.toContain("Integrity check failed");
    expect(verification.message).not.toContain("Signature check failed");
  });

  it("does not fail a REJECTED-decision record for lacking an authorization", async () => {
    //
    // A REJECTED decision never reaches this point via the
    // live RuntimeEngine path — ExecutionGate.enforce()
    // throws a RuntimeError as soon as decision.outcome is
    // REJECTED (packages/runtime/src/ExecutionGate.ts),
    // before RuntimeEngine builds the Execution artifact or
    // BusinessTrustRecordBuilder is ever invoked. This was
    // also verified empirically in Session 4: the
    // "rejected transaction produces no authorization" test
    // in execution-authorization-wiring.test.ts shows
    // trustRecords.findByTransactionId(...) returns null for
    // a rejected transaction — no trust record is persisted.
    //
    // This record is therefore built directly as a fixture
    // to unit-test the per-execution branch in
    // VerificationService: a REJECTED execution must not be
    // required to carry an authorizationId.
    //
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-rejected",
      decisionOutcome: DecisionOutcome.REJECTED,
      // authorizationId intentionally omitted — a rejected
      // decision was never authorized.
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-rejected");

    expect(verification.status).toBe(VerificationStatus.VERIFIED);
  });

  it("names every failed check when integrity and authorization binding both fail simultaneously", async () => {
    const trustRecord = await buildTrustRecord({
      businessTransactionId: "txn-multi-fail",
      decisionOutcome: DecisionOutcome.APPROVED,
      // authorizationId intentionally omitted
    });

    const tamperedRecord: ExecutionTrustRecord = {
      ...trustRecord,
      trustRecordHash: "tampered-hash-value",
    };

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(tamperedRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-multi-fail");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain("Integrity check failed");
    expect(verification.message).toContain(
      "Authorization binding check failed",
    );
  });

  it("verifies a record whose Execution carries a real, valid chain", async () => {
    const trustRecord = await buildChainedTrustRecord({
      businessTransactionId: "txn-chain-valid",
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-chain-valid");

    expect(verification.status).toBe(VerificationStatus.VERIFIED);
  });

  it("fails with a named chain-integrity failure when previousChainHash is tampered", async () => {
    const trustRecord = await buildChainedTrustRecord({
      businessTransactionId: "txn-chain-tampered",
      corruptPreviousChainHash: true,
    });

    const repository = new InMemoryExecutionTrustRecordRepository();
    await repository.create(trustRecord);

    const service = new VerificationService(repository);

    const verification = await service.verify("txn-chain-tampered");

    expect(verification.status).toBe(VerificationStatus.FAILED);
    expect(verification.message).toContain(
      "Execution chain integrity check failed",
    );
    expect(verification.message).toContain(
      trustRecord.executions[0]!.executionId,
    );
  });
});
