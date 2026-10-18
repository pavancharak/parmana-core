import { describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  type BusinessTransaction,
  type BusinessTransactionRepository,
  type Execution,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
  type Override,
  type Receipt,
  type Verification,
} from "@parmana/shared";

import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";

import { DefaultExecutionSystem } from "@parmana/execution-system";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";
import { ExecutionRequestBuilder } from "../../src/ExecutionRequestBuilder.js";
import { ExecutionEvidenceBuilder } from "../../src/ExecutionEvidenceBuilder.js";
import { ExecutionService } from "../../src/services/execution-service.js";
import { ExecutionComponent } from "../../src/components/ExecutionComponent.js";
import { TrustChainValidationComponent } from "../../src/components/TrustChainValidationComponent.js";

/**
 * Regulatory-evidence gap found while indexing CLAIMS.md against real
 * tests: no automated measurement of RuntimeEngine's own pipeline
 * latency exists anywhere in this repo. This measures the in-process
 * cost of validate -> evaluate policy -> sign authorization -> execute
 * -> assemble trust record, with an in-memory ExecutionSystem/repositories
 * (DefaultExecutionSystem, no real connector network call).
 *
 * Explicit about what this does NOT measure: HTTP request/response
 * overhead, Express middleware, real database writes (Postgres/Supabase),
 * or a real connector's network round trip -- all of those sit outside
 * RuntimeEngine itself. See the
 * 2026-08-10 latency investigation (in git history), which explicitly flags a full POST /execute round trip as still
 * unmeasured; this test narrows, but does not close, that open
 * question.
 */

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

  async appendExecution(_id: string, _execution: Execution): Promise<void> {}
  async replaceExecution(_execution: Execution): Promise<void> {}
  async appendOverride(_id: string, _override: Override): Promise<void> {}
  async appendVerification(
    _id: string,
    _verification: Verification,
  ): Promise<void> {}
  async appendReceipt(_id: string, _receipt: Receipt): Promise<void> {}
}

class FixedPolicyRepository implements PolicyRepository {
  constructor(private readonly policy: Policy) {}

  async load(): Promise<Policy> {
    return this.policy;
  }

  async save(): Promise<void> {
    throw new Error("not used by this test");
  }
}

const APPROVE_POLICY: Policy = {
  policyId: "payment-approval",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  approvalSignals: { humanApproved: { resourceId: "target" } },
  rules: [
    {
      id: "approve-with-approval",
      condition: { fact: "humanApproved", operator: "is_true" },
      outcome: { action: PolicyAction.APPROVE, reason: "approved for test" },
    },
  ],
};

function createTransaction(
  businessTransactionId: string,
): Promise<BusinessTransaction> {
  const authorityId = "authority-1";
  const authorizationId = "authorization-1";
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  return withTestApproval(
    {
      businessTransactionId,
      metadata: { businessTransactionId },
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
    },
    APPROVE_POLICY,
  );
}

describe("RuntimeEngine pipeline latency (in-process, no HTTP/network/database)", () => {
  it("completes 50 approved executions within a generous smoke-test bound", async () => {
    const transactions = new InMemoryBusinessTransactionRepository();
    const trustRecords = new InMemoryExecutionTrustRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository(APPROVE_POLICY))
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .addStage(new TrustChainValidationComponent())
      .addStage(
        new ExecutionComponent(
          new ExecutionService(transactions, trustRecords),
          new ExecutionRequestBuilder(),
          new DefaultExecutionSystem(),
          new ExecutionEvidenceBuilder(),
        ),
      )
      .build(trustRecords);

    const iterations = 50;
    const durationsMs: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const transaction = await createTransaction(`txn-perf-${i}`);
      await transactions.create(transaction);

      const start = performance.now();
      await runtime.execute(transaction);
      durationsMs.push(performance.now() - start);
    }

    const sorted = [...durationsMs].sort((a, b) => a - b);
    const totalMs = durationsMs.reduce((a, b) => a + b, 0);
    const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
    const p99 = sorted[Math.floor(sorted.length * 0.99)]!;

    console.log(
      `[perf] ${iterations} in-process RuntimeEngine.execute() calls: ` +
        `avg ${(totalMs / iterations).toFixed(2)}ms, p50 ${p50.toFixed(2)}ms, p99 ${p99.toFixed(2)}ms. ` +
        `Excludes HTTP, database, and connector network overhead -- see docstring.`,
    );

    // Generous smoke bound, not an SLA -- catches a catastrophic
    // regression (e.g. an accidental synchronous file/key reload per
    // call), not a performance target.
    expect(p99).toBeLessThan(500);
  });
});
