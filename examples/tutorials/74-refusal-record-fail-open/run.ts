import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
import { RuntimeBuilder, RuntimeError } from "@parmana/runtime";

//
// RFC-0021's Refusal Record write is durable EVIDENCE, not a GATE: a
// storage outage while writing it must never block, delay, or change
// the actual REJECT the caller receives. This tutorial proves it by
// running the identical rejecting transaction through two runtimes --
// one whose Refusal Record repository always throws, one with no
// repository configured at all -- and showing both produce the exact
// same rejection.
//
console.log();
console.log("==================================================");
console.log("Tutorial 74 - Refusal Record Fail-Open");
console.log("==================================================");
console.log();

const keyDir = mkdtempSync(join(tmpdir(), "parmana-tutorial-74-keys-"));
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({ format: "pem", type: "spki" }),
);
process.env.PARMANA_KEY_DIR = keyDir;

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
  async appendSettlementConfirmation(): Promise<void> {}
}

// Stands in for a storage outage, a signing failure -- anything.
// RFC-0021 requires the REJECT to be identical no matter which
// failure this is.
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
  policyId: "tutorial-74-policy",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  rules: [
    {
      id: "reject-all",
      condition: { always: true },
      outcome: { action: PolicyAction.REJECT, reason: "rejected for tutorial" },
    },
  ],
};

class FixedPolicyRepository implements PolicyRepository {
  async load(): Promise<Policy> {
    return REJECT_POLICY;
  }
}

function createTransaction(): BusinessTransaction {
  const fixedDate = new Date();
  return {
    businessTransactionId: "txn-tutorial-74",
    metadata: {
      businessTransactionId: "txn-tutorial-74",
      submittedBy: "tutorial-74",
    },
    authority: {
      authorityId: "authority-1",
      authorityType: AuthorityType.SERVICE,
      principalId: "svc-1",
      issuedAt: fixedDate,
    },
    authorization: {
      authorizationId: "authorization-1",
      authorityId: "authority-1",
      purpose: "tutorial",
      issuedAt: fixedDate,
    },
    intent: {
      intentId: "intent-1",
      authorizationId: "authorization-1",
      action: "PAY",
      target: "vendor/1",
      parameters: { amount: 100 },
      createdAt: fixedDate,
    },
    policy: {
      name: "tutorial-74-policy",
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: { amount: 100 },
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: fixedDate,
  };
}

try {
  const throwingRefusalRecords = new ThrowingRefusalRecordRepository();

  const runtimeWithFailingWrite = new RuntimeBuilder()
    .withPolicyRepository(new FixedPolicyRepository())
    .build(new NullExecutionTrustRecordRepository(), throwingRefusalRecords);

  const runtimeWithNoRepository = new RuntimeBuilder()
    .withPolicyRepository(new FixedPolicyRepository())
    .build(new NullExecutionTrustRecordRepository());

  console.log(
    "Scenario 1: Refusal Record repository configured, but every write throws",
  );
  console.log("--------------------------------------------------");

  let caughtWithFailingWrite: unknown;
  const startedAt = Date.now();
  try {
    await runtimeWithFailingWrite.execute(createTransaction());
  } catch (error) {
    caughtWithFailingWrite = error;
  }
  const elapsedMs = Date.now() - startedAt;

  console.log(
    `Threw RuntimeError        : ${caughtWithFailingWrite instanceof RuntimeError}`,
  );
  console.log(
    `status / code             : ${(caughtWithFailingWrite as RuntimeError)?.status} / ${(caughtWithFailingWrite as RuntimeError)?.code}`,
  );
  console.log(
    `Write was actually attempted (createCallCount) : ${throwingRefusalRecords.createCallCount}`,
  );
  console.log(
    `Time to reject            : ${elapsedMs}ms (no retry loop, no hang)`,
  );
  console.log();

  console.log("Scenario 2: No Refusal Record repository configured at all");
  console.log("--------------------------------------------------");

  let caughtWithNoRepository: unknown;
  try {
    await runtimeWithNoRepository.execute(createTransaction());
  } catch (error) {
    caughtWithNoRepository = error;
  }

  console.log(
    `Threw RuntimeError        : ${caughtWithNoRepository instanceof RuntimeError}`,
  );
  console.log(
    `status / code             : ${(caughtWithNoRepository as RuntimeError)?.status} / ${(caughtWithNoRepository as RuntimeError)?.code}`,
  );
  console.log();

  const bothIdentical =
    caughtWithFailingWrite instanceof RuntimeError &&
    caughtWithNoRepository instanceof RuntimeError &&
    caughtWithFailingWrite.message === caughtWithNoRepository.message &&
    caughtWithFailingWrite.status === caughtWithNoRepository.status &&
    caughtWithFailingWrite.code === caughtWithNoRepository.code &&
    throwingRefusalRecords.createCallCount === 1 &&
    elapsedMs < 1000;

  if (bothIdentical) {
    console.log(
      "✓ Both scenarios produced byte-for-byte identical rejections -- the failed write never blocked, delayed, or changed the REJECT.",
    );
  } else {
    console.log(
      "✗ Expected identical rejection behavior regardless of whether the Refusal Record write succeeded.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 75 - Signed Audit Events");
} finally {
  delete process.env.PARMANA_KEY_DIR;
  rmSync(keyDir, { recursive: true, force: true });
}
