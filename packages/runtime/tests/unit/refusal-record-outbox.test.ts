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
  type RefusalRecordOutboxEntry,
  type RefusalRecordOutboxRepository,
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
  async appendVerification(): Promise<void> {}
  async appendReceipt(): Promise<void> {}
}

/**
 * The dependency under test: every call throws. Stands in for a
 * storage outage, a signing failure, anything -- RFC-0021 §6 requires
 * the REJECT to be identical regardless of which failure this is.
 */

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

/** Fails while `failing` is true; otherwise stores records by transaction. */
class ToggleRefusalRecordRepository implements RefusalRecordRepository {
  public failing = true;
  public createCalls = 0;
  public readonly stored = new Map<string, RefusalRecord>();

  async create(record: RefusalRecord): Promise<RefusalRecord> {
    this.createCalls++;
    if (this.failing) {
      throw new Error("simulated refusal-record storage outage");
    }
    this.stored.set(record.businessTransactionId, record);
    return record;
  }

  async findByTransactionId(id: string): Promise<RefusalRecord | null> {
    return this.stored.get(id) ?? null;
  }
}

class MapRefusalRecordOutbox implements RefusalRecordOutboxRepository {
  public failingEnqueue = false;
  public readonly entries = new Map<string, RefusalRecordOutboxEntry>();
  public readonly delivered = new Set<string>();

  async enqueue(entry: RefusalRecordOutboxEntry): Promise<void> {
    if (this.failingEnqueue) {
      throw new Error("simulated outbox outage");
    }
    if (!this.entries.has(entry.businessTransactionId)) {
      this.entries.set(entry.businessTransactionId, entry);
    }
  }

  async listPending(limit: number): Promise<RefusalRecordOutboxEntry[]> {
    return [...this.entries.values()]
      .filter((entry) => !this.delivered.has(entry.businessTransactionId))
      .slice(0, limit);
  }

  async markDelivered(id: string): Promise<void> {
    this.delivered.add(id);
  }

  async recordFailure(id: string, error: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry !== undefined) {
      this.entries.set(id, {
        ...entry,
        attempts: entry.attempts + 1,
        lastError: error,
      });
    }
  }

  pending(): number {
    return [...this.entries.keys()].filter((id) => !this.delivered.has(id))
      .length;
  }
}

describe("RFC-0021 refusal outbox: a refusal's record is written later when storage failed", () => {
  it("saves the refusal inputs when the record write fails, and the refusal still stands", async () => {
    const refusals = new ToggleRefusalRecordRepository();
    const outbox = new MapRefusalRecordOutbox();
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outbox)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    let caught: unknown;
    try {
      await runtime.execute(createTransaction());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RuntimeError);
    expect((caught as RuntimeError).code).toBe("POLICY_DENIED");
    expect(outbox.pending()).toBe(1);
    expect(outbox.entries.get("txn-fail-open-1")?.decision.outcome).toBe(
      "REJECTED",
    );
  });

  it("writes the pending record once storage recovers, and does not duplicate it", async () => {
    const refusals = new ToggleRefusalRecordRepository();
    const outbox = new MapRefusalRecordOutbox();
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outbox)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    await runtime.execute(createTransaction()).catch(() => undefined);
    refusals.failing = false;

    const first = await runtime.drainRefusalOutbox();
    expect(first).toEqual({ delivered: 1, failed: 0 });
    expect(refusals.stored.has("txn-fail-open-1")).toBe(true);
    expect(outbox.pending()).toBe(0);

    // Running the drain again builds nothing: the entry is delivered.
    const callsAfterFirst = refusals.createCalls;
    const second = await runtime.drainRefusalOutbox();
    expect(second).toEqual({ delivered: 0, failed: 0 });
    expect(refusals.createCalls).toBe(callsAfterFirst);
  });

  it("marks an entry delivered without writing again when its record already exists", async () => {
    const refusals = new ToggleRefusalRecordRepository();
    const outbox = new MapRefusalRecordOutbox();
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outbox)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    await runtime.execute(createTransaction()).catch(() => undefined);

    // An earlier attempt stored the record, then failed before marking it.
    refusals.failing = false;
    const existing = await runtime.drainRefusalOutbox();
    expect(existing.delivered).toBe(1);

    const outboxAgain = new MapRefusalRecordOutbox();
    outboxAgain.entries.set(
      "txn-fail-open-1",
      outbox.entries.get("txn-fail-open-1") as RefusalRecordOutboxEntry,
    );
    const runtimeAgain = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outboxAgain)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    const createsBefore = refusals.createCalls;
    expect(await runtimeAgain.drainRefusalOutbox()).toEqual({
      delivered: 1,
      failed: 0,
    });
    expect(refusals.createCalls).toBe(createsBefore);
  });

  it("keeps a failed entry pending, with its attempt counted and error recorded", async () => {
    const refusals = new ToggleRefusalRecordRepository();
    const outbox = new MapRefusalRecordOutbox();
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outbox)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    await runtime.execute(createTransaction()).catch(() => undefined);

    expect(await runtime.drainRefusalOutbox()).toEqual({
      delivered: 0,
      failed: 1,
    });
    expect(outbox.pending()).toBe(1);
    const entry = outbox.entries.get("txn-fail-open-1");
    expect(entry?.attempts).toBe(1);
    expect(entry?.lastError).toContain("storage outage");
  });

  it("still refuses when the outbox itself cannot be written, with the same rejection", async () => {
    const refusals = new ToggleRefusalRecordRepository();
    const outbox = new MapRefusalRecordOutbox();
    outbox.failingEnqueue = true;
    const runtime = new RuntimeBuilder()
      .withPolicyRepository(new FixedPolicyRepository())
      .withRefusalRecordOutbox(outbox)
      .build(new NullExecutionTrustRecordRepository(), refusals);

    let caught: unknown;
    try {
      await runtime.execute(createTransaction());
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RuntimeError);
    expect((caught as RuntimeError).code).toBe("POLICY_DENIED");
    expect(outbox.pending()).toBe(0);
  });
});
