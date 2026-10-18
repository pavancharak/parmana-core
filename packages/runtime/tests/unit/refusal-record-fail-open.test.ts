import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  AuthorityType,
  BusinessTransactionStatus,
  type BusinessTransaction,
  type ExecutionTrustRecordRepository,
  type RefusalRecord,
  type RefusalRecordRepository,
} from "@parmana/shared";

import {
  PolicyAction,
  type Policy,
  type PolicyRepository,
} from "@parmana/policy";

import { RuntimeBuilder } from "../../src/RuntimeBuilder.js";
import { RuntimeError } from "../../src/errors/RuntimeError.js";

//
// Hermetic key material, matching runtime.test.ts's own convention.
//
let keyDir: string;
let previousKeyDir: string | undefined;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), "parmana-refusal-fail-open-keys-"));

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

class NullExecutionTrustRecordRepository implements ExecutionTrustRecordRepository {
  async create<T>(record: T): Promise<T> {
    return record;
  }
  async findByTransactionId(): Promise<null> {
    return null;
  }
  async appendExecution(): Promise<void> {}
  async replaceExecution(): Promise<void> {}
  async appendOverride(): Promise<void> {}
  async appendVerification(): Promise<void> {}
  async appendReceipt(): Promise<void> {}
}

/**
 * The dependency under test: every call throws. Stands in for a
 * storage outage, a signing failure, anything -- RFC-0021 §6 requires
 * the REJECT to be identical regardless of which failure this is.
 */
class ThrowingRefusalRecordRepository implements RefusalRecordRepository {
  public createCallCount = 0;

  async create(): Promise<RefusalRecord> {
    this.createCallCount++;
    throw new Error("simulated refusal-record storage outage");
  }

  async findByTransactionId(): Promise<null> {
    return null;
  }
}

const REJECT_POLICY: Policy = {
  policyId: "payment-approval",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  rules: [
    {
      id: "reject-all",
      condition: { always: true },
      outcome: {
        action: PolicyAction.REJECT,
        reason: "rejected for test",
      },
    },
  ],
};

class FixedPolicyRepository implements PolicyRepository {
  async load(): Promise<Policy> {
    return REJECT_POLICY;
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
    businessTransactionId: "txn-fail-open-1",

    metadata: {
      businessTransactionId: "txn-fail-open-1",
      submittedBy: "caller-1",
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

describe("RFC-0021 fail-open guarantee: Refusal Record write failure never blocks the REJECT", () => {
  it("throws the identical RuntimeError (message, status, code) whether or not the Refusal Record write succeeds", async () => {
    const throwingRefusalRecords = new ThrowingRefusalRecordRepository();

    const runtimeWithFailingWrite = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(new NullExecutionTrustRecordRepository(), throwingRefusalRecords);

    const runtimeWithNoRefusalRepository = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(new NullExecutionTrustRecordRepository());

    let caughtWithFailingWrite: unknown;
    let caughtWithNoRepository: unknown;

    try {
      await runtimeWithFailingWrite.execute(createTransaction());
    } catch (error) {
      caughtWithFailingWrite = error;
    }

    try {
      await runtimeWithNoRefusalRepository.execute(createTransaction());
    } catch (error) {
      caughtWithNoRepository = error;
    }

    // The write was actually attempted (and actually failed) --
    // otherwise this test would prove nothing about fail-OPEN, only
    // that the code path is never reached.
    expect(throwingRefusalRecords.createCallCount).toBe(1);

    // Both scenarios -- storage configured but failing, and storage
    // not configured at all -- must produce byte-for-byte identical
    // rejection behavior, and identical to what this codebase's own
    // pre-existing "rejected transaction produces no authorization"
    // test (execution-authorization-wiring.test.ts) already asserts
    // for the case with no Refusal Record feature involved at all.
    for (const caught of [caughtWithFailingWrite, caughtWithNoRepository]) {
      expect(caught).toBeInstanceOf(RuntimeError);
      expect((caught as RuntimeError).message).toContain("rejected for test");
      expect((caught as RuntimeError).status).toBe(403);
      expect((caught as RuntimeError).code).toBe("POLICY_DENIED");
    }
  });

  it("does not delay the throw noticeably (the failed write does not retry or hang)", async () => {
    const throwingRefusalRecords = new ThrowingRefusalRecordRepository();

    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .build(new NullExecutionTrustRecordRepository(), throwingRefusalRecords);

    const startedAt = Date.now();

    await expect(runtime.execute(createTransaction())).rejects.toBeInstanceOf(
      RuntimeError,
    );

    expect(Date.now() - startedAt).toBeLessThan(1000);
  });
});
