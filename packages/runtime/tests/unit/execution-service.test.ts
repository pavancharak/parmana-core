import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  DecisionOutcome,
  ExecutionMode,
  ExecutionStatus,
  type BusinessTransaction,
  type BusinessTransactionRepository,
  type Execution,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
} from "@parmana/shared";

import { ExecutionChainCrypto } from "@parmana/crypto";

import { ExecutionService } from "../../src/services/execution-service.js";

//
// In-memory test doubles, matching the conventions of
// execution-authorization-wiring.test.ts.
//

class InMemoryBusinessTransactionRepository implements BusinessTransactionRepository {
  private readonly store = new Map<string, BusinessTransaction>();

  async create(transaction: BusinessTransaction): Promise<BusinessTransaction> {
    this.store.set(transaction.businessTransactionId, transaction);
    return transaction;
  }

  async findById(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    return this.store.get(businessTransactionId) ?? null;
  }

  async exists(businessTransactionId: string): Promise<boolean> {
    return this.store.has(businessTransactionId);
  }

  async list(): Promise<readonly BusinessTransaction[]> {
    return [...this.store.values()];
  }
}

class RecordingExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  public appended: Execution | undefined;
  public replaced: Execution[] = [];

  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    return record;
  }

  async findByTransactionId(): Promise<ExecutionTrustRecord | null> {
    return null;
  }

  async appendExecution(
    _businessTransactionId: string,
    execution: Execution,
  ): Promise<void> {
    this.appended = execution;
  }

  async replaceExecution(execution: Execution): Promise<void> {
    this.replaced.push(execution);
  }

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

describe("ExecutionService chain signing", () => {
  it("create() signs a chain link with previousChainHash null", async () => {
    const transactions = new InMemoryBusinessTransactionRepository();
    const trustRecords = new RecordingExecutionTrustRecordRepository();

    const businessTransactionId = "txn-1";
    await transactions.create(createTransaction(businessTransactionId));

    const service = new ExecutionService(transactions, trustRecords);

    const execution = await service.create(
      businessTransactionId,
      {
        decisionId: "decision-1",
        intentId: "intent-1",
        policy: {
          name: "payment-approval",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        },
        signals: { amount: 100 },
        outcome: DecisionOutcome.APPROVED,
        evaluatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      ExecutionMode.SYNC,
    );

    expect(execution.previousChainHash).toBeNull();
    expect(execution.chainHash).toBeDefined();
    expect(execution.chainSignature).toBeDefined();
    expect(trustRecords.appended).toEqual(execution);

    const chainCrypto = new ExecutionChainCrypto();
    await expect(chainCrypto.verifyEntry(execution)).resolves.toBe(true);
  });

  it("attachEvidence() then complete() each produce a different chainHash while previousChainHash stays fixed", async () => {
    const transactions = new InMemoryBusinessTransactionRepository();
    const trustRecords = new RecordingExecutionTrustRecordRepository();

    const businessTransactionId = "txn-2";
    await transactions.create(createTransaction(businessTransactionId));

    const service = new ExecutionService(transactions, trustRecords);

    const created = await service.create(
      businessTransactionId,
      {
        decisionId: "decision-2",
        intentId: "intent-1",
        policy: {
          name: "payment-approval",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        },
        signals: { amount: 100 },
        outcome: DecisionOutcome.APPROVED,
        evaluatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      ExecutionMode.SYNC,
    );

    const withEvidence = await service.attachEvidence(created, {
      businessTransactionId,
      action: "PAY",
      target: "vendor/1",
      parameters: { amount: 100 },
      success: true,
      executedAt: new Date("2026-01-01T00:01:00Z"),
    });

    const completed = await service.complete(withEvidence);

    expect(withEvidence.previousChainHash).toBeNull();
    expect(completed.previousChainHash).toBeNull();

    expect(created.chainHash).not.toBe(withEvidence.chainHash);
    expect(withEvidence.chainHash).not.toBe(completed.chainHash);

    expect(trustRecords.replaced).toEqual([withEvidence, completed]);

    const chainCrypto = new ExecutionChainCrypto();
    await expect(chainCrypto.verifyEntry(completed)).resolves.toBe(true);
  });

  it("detects post-hoc tampering of a returned Execution", async () => {
    const transactions = new InMemoryBusinessTransactionRepository();
    const trustRecords = new RecordingExecutionTrustRecordRepository();

    const businessTransactionId = "txn-3";
    await transactions.create(createTransaction(businessTransactionId));

    const service = new ExecutionService(transactions, trustRecords);

    const execution = await service.create(
      businessTransactionId,
      {
        decisionId: "decision-3",
        intentId: "intent-1",
        policy: {
          name: "payment-approval",
          version: "1.0.0",
          schemaVersion: "1.0.0",
        },
        signals: { amount: 100 },
        outcome: DecisionOutcome.APPROVED,
        evaluatedAt: new Date("2026-01-01T00:00:00Z"),
      },
      ExecutionMode.SYNC,
    );

    const tampered: Execution = {
      ...execution,
      status: ExecutionStatus.COMPLETED,
    };

    const chainCrypto = new ExecutionChainCrypto();
    await expect(chainCrypto.verifyEntry(tampered)).resolves.toBe(false);
  });
});
