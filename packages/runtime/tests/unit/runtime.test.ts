import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  type BusinessTransaction,
  type ExecutionTrustRecord,
  type ExecutionTrustRecordRepository,
} from "@parmana/shared";

import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

//
// Hermetic key material: a fresh temp key dir per test,
// matching packages/crypto/test/dilithium3-cross-instance.test.ts.
// No test may depend on the repo-root keys/ directory, which is
// gitignored and absent on a fresh clone.
//
let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-runtime-test-keys-"));

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  writeFileSync(
    join(keyDir, "default.private.pem"),
    privateKey.export({ format: "pem", type: "pkcs8" }),
  );

  writeFileSync(
    join(keyDir, "default.public.pem"),
    publicKey.export({ format: "pem", type: "spki" }),
  );

  previousKeyDir = process.env.PARMANA_KEY_DIR;
  process.env.PARMANA_KEY_DIR = keyDir;
});

afterEach(() => {
  if (previousKeyDir === undefined) {
    delete process.env.PARMANA_KEY_DIR;
  } else {
    process.env.PARMANA_KEY_DIR = previousKeyDir;
  }

  rmSync(keyDir, { recursive: true, force: true });
});

class InMemoryExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  public created: ExecutionTrustRecord[] = [];

  async create(record: ExecutionTrustRecord): Promise<ExecutionTrustRecord> {
    this.created.push(record);
    return record;
  }

  async findByTransactionId(): Promise<ExecutionTrustRecord | null> {
    return null;
  }

  async appendExecution(): Promise<void> {}

  async replaceExecution(): Promise<void> {}

  async appendOverride(): Promise<void> {}

  async appendVerification(): Promise<void> {}

  async appendReceipt(): Promise<void> {}
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
      outcome: {
        action: PolicyAction.APPROVE,
        reason: "approved for test",
      },
    },
  ],
};

class FixedPolicyRepository implements PolicyRepository {
  async load(): Promise<Policy> {
    return APPROVE_POLICY;
  }

  async save(): Promise<void> {
    throw new Error("not used by these tests");
  }
}

function createTransaction(): BusinessTransaction {
  const authorityId = "authority-1";
  const authorizationId = "authorization-1";
  const fixedDate = new Date("2026-01-01T00:00:00Z");

  return {
    businessTransactionId: "txn-runtime-facade-1",

    metadata: {
      businessTransactionId: "txn-runtime-facade-1",
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

describe("Runtime (facade)", () => {
  it("persists the trust record and returns {transaction, context, trustRecord}", async () => {
    const trustRecords = new InMemoryExecutionTrustRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .build(trustRecords);

    const transaction = await withTestApproval(
      createTransaction(),
      APPROVE_POLICY,
    );

    const result = await runtime.execute(transaction);

    expect(result.transaction.businessTransactionId).toBe(
      transaction.businessTransactionId,
    );
    expect(result.context).toBeDefined();
    expect(result.trustRecord).toBeDefined();

    //
    // The facade must persist the exact trust record it returns.
    //
    expect(trustRecords.created).toHaveLength(1);
    expect(trustRecords.created[0]).toBe(result.trustRecord);
  });

  it("refuses an approval when no approval verifier is configured, even with the approval signal set", async () => {
    const trustRecords = new InMemoryExecutionTrustRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(trustRecords);

    const transaction = await withTestApproval(
      createTransaction(),
      APPROVE_POLICY,
    );

    await expect(runtime.execute(transaction)).rejects.toThrow(
      /no approval verifier is configured/,
    );
    expect(trustRecords.created).toHaveLength(0);
  });

  it("refuses a caller that sets the approval signal true with no signed approval", async () => {
    const trustRecords = new InMemoryExecutionTrustRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withSignalStateVerifier(testApprovalSignalVerifier())
      .build(trustRecords);

    const transaction = createTransaction();

    await expect(
      runtime.execute({
        ...transaction,
        signals: { ...transaction.signals, humanApproved: true },
      }),
    ).rejects.toThrow(/do not match independently verified state/);
    expect(trustRecords.created).toHaveLength(0);
  });

  it("isEmpty() and size() delegate to the configured pipeline", () => {
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(new InMemoryExecutionTrustRecordRepository());

    expect(runtime.isEmpty()).toBe(true);
    expect(runtime.size()).toBe(0);
  });
});
