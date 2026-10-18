import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ExecutionIntentCrypto, VerificationCrypto } from "@parmana/crypto";

import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  ConnectorNotRegisteredError,
  ExecutionIntent,
  ExecutionTrustRecord,
  StoredExecutionIntent,
  TransactionMetadata,
} from "@parmana/shared";

import {
  FilePolicyRepository,
  PolicyEngine,
  PolicyRouter,
  SignalIntentBinder,
} from "@parmana/policy";

import {
  MemoryExecutionIntentRepository,
  MemoryExecutionTrustRecordRepository,
} from "@parmana/storage";

import { BusinessTrustPipeline } from "../../src/BusinessTrustPipeline.js";
import { DecisionBuilder } from "../../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../../src/ExecutionBuilder.js";
import { ExecutionGate } from "../../src/ExecutionGate.js";
import { ExecutionIntentBuilder } from "../../src/ExecutionIntentBuilder.js";
import { ExecutionIntentFinalizer } from "../../src/ExecutionIntentFinalizer.js";
import { ExecutionIntentService } from "../../src/ExecutionIntentService.js";
import { Runtime } from "../../src/Runtime.js";
import { RuntimeAuthorizationSigner } from "../../src/RuntimeAuthorizationSigner.js";
import { RuntimeEngine } from "../../src/RuntimeEngine.js";
import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import { ExecutionOutcomeUnknownError } from "../../src/errors/ExecutionOutcomeUnknownError.js";
import type { RuntimeComponent } from "../../src/RuntimeComponent.js";
import { ExecutionIntentNotFinalizableError } from "../../src/errors/ExecutionIntentNotFinalizableError.js";
import { ExecutionIntentNotFoundError } from "../../src/errors/ExecutionIntentNotFoundError.js";
import { ExecutionIntentNotResolvableError } from "../../src/errors/ExecutionIntentNotResolvableError.js";
import { ExecutionIntentResolutionInvalidError } from "../../src/errors/ExecutionIntentResolutionInvalidError.js";
import { ExecutionIntentUnavailableError } from "../../src/errors/ExecutionIntentUnavailableError.js";
import { ExecutionRecordIncompleteError } from "../../src/errors/ExecutionRecordIncompleteError.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * ADR-0012 (docs/VERIFICATION-GAPS.md G-52 and G-53): a signed Execution Intent
 * is stored BEFORE an action is released, so an action that was released always
 * has signed evidence behind it, and a missing Trust Record can be rebuilt
 * without calling the connector again.
 */
const policyRepository = new FilePolicyRepository(
  path.resolve(import.meta.dirname, "../../../../policies"),
);

const TX = "tx-adr0012";

function transaction(): Promise<BusinessTransaction> {
  return withTestApproval({
    businessTransactionId: TX,
    metadata: { executionMode: "SYNC" } as unknown as TransactionMetadata,
    authority: {} as Authority,
    authorization: {} as Authorization,
    intent: {
      intentId: "intent-adr0012",
      authorizationId: "authorization-adr0012",
      action: "payments:execute",
      target: "vendor://payments",
      // A distinctive value, so a test can prove it never reaches the intent.
      parameters: { amount: 100, reference: "invoice-987654" },
      createdAt: new Date(),
    },
    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },
    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 100,
      riskScore: 10,
      vendorId: "vendor://payments",
    },
    status: BusinessTransactionStatus.RECEIVED,
    createdAt: new Date(),
  });
}

/**
 * Stands in for the connector release. Counts how many times the action was
 * released, and records what the intent looked like at the moment of release.
 */
class ReleaseProbe implements RuntimeComponent {
  calls = 0;

  intentAtRelease: StoredExecutionIntent | null | undefined;

  constructor(
    private readonly intents: MemoryExecutionIntentRepository,
    private readonly failWith?: Error,
  ) {}

  async execute<T>(context: T): Promise<T> {
    this.calls += 1;

    this.intentAtRelease = await this.intents.findByTransactionId(TX);

    if (this.failWith) {
      throw this.failWith;
    }

    return context;
  }
}

/** A trust record store whose write can be made to fail. */
class FlakyTrustRecords extends MemoryExecutionTrustRecordRepository {
  failCreate = false;

  override async create(
    record: ExecutionTrustRecord,
  ): Promise<ExecutionTrustRecord> {
    if (this.failCreate) {
      throw new Error("database unavailable");
    }

    return super.create(record);
  }
}

function setup(
  options: {
    releaseFailsWith?: Error;
    intentService?: (
      repository: MemoryExecutionIntentRepository,
    ) => ExecutionIntentService;
  } = {},
) {
  const repository = new MemoryExecutionIntentRepository();
  const service =
    options.intentService?.(repository) ??
    new ExecutionIntentService(repository);
  const trustRecords = new FlakyTrustRecords();
  const release = new ReleaseProbe(repository, options.releaseFailsWith);

  const engine = new RuntimeEngine(
    new RuntimePipeline([release as unknown as RuntimeComponent]),
    new PolicyRouter(policyRepository),
    new PolicyEngine(),
    new SignalIntentBinder(),
    new DecisionBuilder(),
    new ExecutionGate(),
    new ExecutionBuilder(),
    new BusinessTrustPipeline(),
    new RuntimeAuthorizationSigner(),
    120,
    undefined,
    undefined,
    undefined,
    testApprovalSignalVerifier(),
    undefined,
    undefined,
    undefined,
    undefined,
    service,
  );

  return {
    repository,
    service,
    trustRecords,
    release,
    runtime: new Runtime(engine, trustRecords, service),
    finalizer: new ExecutionIntentFinalizer(service, trustRecords),
  };
}

describe("ADR-0012: the intent is signed and stored before release", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("has a signed intent stored at the moment the connector is called", async () => {
    const { runtime, release } = setup();

    await runtime.execute(await transaction());

    const seen = release.intentAtRelease;

    expect(release.calls).toBe(1);
    expect(seen).not.toBeNull();
    expect(seen?.status.state).toBe("PREPARED");
    expect(seen?.releasedContext).toBeUndefined();
    expect(seen?.intent.businessTransactionId).toBe(TX);
    expect(await new ExecutionIntentCrypto().verify(seen!.intent)).toBe(true);
  });

  it("binds the intent to the signed authorization and the policy in force", async () => {
    const { runtime, repository, trustRecords } = setup();

    await runtime.execute(await transaction());

    const stored = await repository.findByTransactionId(TX);
    const record = await trustRecords.findByTransactionId(TX);
    const payload = record!.authorization!.payload;

    expect(stored!.intent).toMatchObject({
      authorizationId: payload.authorizationId,
      decisionId: payload.decisionId,
      policyName: payload.policyName,
      policyVersion: payload.policyVersion,
      policyContentHash: payload.policyContentHash,
      signalsHash: payload.signalsHash,
      businessTransactionHash: payload.businessTransactionHash,
      action: "payments:execute",
      target: "vendor://payments",
    });
  });

  it("never puts the raw parameters or any execution result in the intent", async () => {
    const { runtime, repository } = setup();

    await runtime.execute(await transaction());

    const serialized = JSON.stringify(
      (await repository.findByTransactionId(TX))!.intent,
    );

    expect(serialized).not.toContain("987654");
    expect(serialized).not.toContain("executions");
    expect(serialized).not.toContain("evidence");
  });

  it("refuses with 503 and never releases when the intent cannot be stored", async () => {
    const { runtime, release, repository } = setup();

    vi.spyOn(repository, "create").mockRejectedValue(
      new Error("database unavailable"),
    );

    const error = await runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentUnavailableError);
    expect((error as ExecutionIntentUnavailableError).status).toBe(503);
    expect((error as ExecutionIntentUnavailableError).code).toBe(
      "EXECUTION_INTENT_UNAVAILABLE",
    );
    expect((error as Error).message).toContain("Nothing was executed");
    expect((error as Error).message).toContain("database unavailable");
    expect(release.calls).toBe(0);
  });

  it("refuses with 503 and never releases when the intent cannot be signed", async () => {
    const failingBuilder = {
      async build(): Promise<ExecutionIntent> {
        throw new Error("KMS unreachable");
      },
    } as unknown as ExecutionIntentBuilder;

    const { runtime, release } = setup({
      intentService: (repository) =>
        new ExecutionIntentService(repository, failingBuilder),
    });

    const error = await runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentUnavailableError);
    expect(release.calls).toBe(0);
  });

  it("does not change behavior when no intent service is configured", async () => {
    const release = new ReleaseProbe(new MemoryExecutionIntentRepository());
    const trustRecords = new FlakyTrustRecords();
    const engine = new RuntimeEngine(
      new RuntimePipeline([release as unknown as RuntimeComponent]),
      new PolicyRouter(policyRepository),
      new PolicyEngine(),
      new SignalIntentBinder(),
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      new BusinessTrustPipeline(),
      new RuntimeAuthorizationSigner(),
      120,
      [],
      undefined,
      undefined,
      testApprovalSignalVerifier(),
    );

    const result = await new Runtime(engine, trustRecords).execute(
      await transaction(),
    );

    expect(release.calls).toBe(1);
    expect(result.trustRecord.businessTransactionId).toBe(TX);
    expect(release.intentAtRelease).toBeNull();
  });
});

describe("ADR-0012: intent status through the lifecycle", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ends FINALIZED, marked INLINE, with the trust record id, on the normal path", async () => {
    const { runtime, repository } = setup();

    const result = await runtime.execute(await transaction());

    const stored = await repository.findByTransactionId(TX);

    expect(stored!.status.state).toBe("FINALIZED");
    expect(stored!.status.finalizationMode).toBe("INLINE");
    expect(stored!.status.trustRecordId).toBe(result.trustRecord.trustRecordId);
    expect(stored!.status.releasedAt).toBeInstanceOf(Date);
  });

  it("marks the intent ERRORED, not 'not released', when the release stage raises an error", async () => {
    const { runtime, repository, release } = setup({
      releaseFailsWith: new Error("connector timed out"),
    });

    const error = await runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    // G-63: the caller is told what the intent records: outcome unknown.
    expect(error).toBeInstanceOf(ExecutionOutcomeUnknownError);
    expect((error as ExecutionOutcomeUnknownError).status).toBe(502);
    expect((error as ExecutionOutcomeUnknownError).code).toBe(
      "EXECUTION_OUTCOME_UNKNOWN",
    );
    expect((error as ExecutionOutcomeUnknownError).businessTransactionId).toBe(
      TX,
    );
    expect((error as Error).message).not.toContain("connector timed out");
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(release.calls).toBe(1);

    const stored = await repository.findByTransactionId(TX);

    expect(stored!.status.state).toBe("ERRORED");
    expect(stored!.status.failureReason).toBe("connector timed out");
    expect(stored!.releasedContext).toBeUndefined();
  });

  it("passes a release error that already has a typed response through unchanged (G-63)", async () => {
    const typed = new ConnectorNotRegisteredError("paytm:refund");
    const { runtime, repository } = setup({ releaseFailsWith: typed });

    const error = await runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(error).toBe(typed);

    const stored = await repository.findByTransactionId(TX);
    expect(stored!.status.state).toBe("ERRORED");
  });

  it("still returns the record, and logs at critical severity, when a status update fails after release", async () => {
    const errorLog = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { runtime, repository } = setup();

    vi.spyOn(repository, "markFinalized").mockRejectedValue(
      new Error("status write failed"),
    );

    const result = await runtime.execute(await transaction());

    expect(result.trustRecord.businessTransactionId).toBe(TX);

    const logged = errorLog.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find(
        (entry) => entry.event === "execution_intent_mark_finalized_failed",
      );

    expect(logged).toMatchObject({
      severity: "critical",
      businessTransactionId: TX,
    });
  });
});

describe("ADR-0012: repairing a missing Trust Record (G-53)", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function releaseWithRecordFailure() {
    const harness = setup();

    harness.trustRecords.failCreate = true;

    const error = await harness.runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionRecordIncompleteError);

    harness.trustRecords.failCreate = false;

    return harness;
  }

  it("keeps a signed intent, in state RELEASED with the saved context, when the record cannot be stored", async () => {
    const { repository, trustRecords } = await releaseWithRecordFailure();

    const stored = await repository.findByTransactionId(TX);

    expect(stored!.status.state).toBe("RELEASED");
    expect(stored!.releasedContext).toBeDefined();
    expect(await new ExecutionIntentCrypto().verify(stored!.intent)).toBe(true);
    expect(await trustRecords.findByTransactionId(TX)).toBeNull();
  });

  it("rebuilds a signed, verifiable record WITHOUT releasing the action again", async () => {
    const { finalizer, release, repository, trustRecords } =
      await releaseWithRecordFailure();

    expect(release.calls).toBe(1);

    const result = await finalizer.finalize(TX);

    expect(result.outcome).toBe("FINALIZED");
    expect(release.calls).toBe(1);

    const record = await trustRecords.findByTransactionId(TX);

    expect(record!.businessTransactionId).toBe(TX);
    expect(await new VerificationCrypto().verify(record!)).toBe(true);

    const stored = await repository.findByTransactionId(TX);

    expect(stored!.status.state).toBe("FINALIZED");
    expect(stored!.status.finalizationMode).toBe("REPAIRED");
    expect(stored!.status.trustRecordId).toBe(record!.trustRecordId);
  });

  it("is idempotent: a second finalize returns the same record and builds nothing", async () => {
    const { finalizer, release, trustRecords } =
      await releaseWithRecordFailure();

    const first = await finalizer.finalize(TX);

    const createSpy = vi.spyOn(trustRecords, "create");

    const second = await finalizer.finalize(TX);

    expect(first.outcome).toBe("FINALIZED");
    expect(second.outcome).toBe("ALREADY_FINALIZED");
    expect(second.trustRecord.trustRecordId).toBe(
      first.trustRecord.trustRecordId,
    );
    expect(createSpy).not.toHaveBeenCalled();
    expect(release.calls).toBe(1);
  });

  it("returns the existing record, and fixes the intent status, when the record was stored but the status update was lost", async () => {
    const { runtime, repository, finalizer } = setup();

    vi.spyOn(repository, "markFinalized").mockRejectedValueOnce(
      new Error("status write failed"),
    );

    const result = await runtime.execute(await transaction());

    expect((await repository.findByTransactionId(TX))!.status.state).toBe(
      "RELEASED",
    );

    const repaired = await finalizer.finalize(TX);

    expect(repaired.outcome).toBe("ALREADY_FINALIZED");
    expect(repaired.trustRecord.trustRecordId).toBe(
      result.trustRecord.trustRecordId,
    );

    const stored = await repository.findByTransactionId(TX);

    expect(stored!.status.state).toBe("FINALIZED");
    expect(stored!.status.finalizationMode).toBe("INLINE");
  });

  it("treats a record that appears while it is working as already finalized", async () => {
    const { finalizer, trustRecords, runtime } =
      await releaseWithRecordFailure();

    void runtime;

    const winner = { trustRecordId: "rec-winner", businessTransactionId: TX };
    const find = vi
      .spyOn(trustRecords, "findByTransactionId")
      .mockResolvedValueOnce(null)
      .mockResolvedValue(winner as unknown as ExecutionTrustRecord);

    vi.spyOn(trustRecords, "create").mockRejectedValue(
      new Error("duplicate key"),
    );

    const result = await finalizer.finalize(TX);

    expect(find).toHaveBeenCalled();
    expect(result.outcome).toBe("ALREADY_FINALIZED");
    expect(result.trustRecord.trustRecordId).toBe("rec-winner");
  });

  it("refuses with 409 when no execution result was saved, and changes nothing", async () => {
    const { runtime, repository, finalizer, trustRecords } = setup();

    vi.spyOn(repository, "markReleased").mockRejectedValue(
      new Error("status write failed"),
    );

    trustRecords.failCreate = true;

    await runtime.execute(await transaction()).catch(() => undefined);

    trustRecords.failCreate = false;

    expect((await repository.findByTransactionId(TX))!.status.state).toBe(
      "PREPARED",
    );

    const error = await finalizer.finalize(TX).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentNotFinalizableError);
    expect((error as ExecutionIntentNotFinalizableError).status).toBe(409);
    expect((error as ExecutionIntentNotFinalizableError).code).toBe(
      "EXECUTION_INTENT_RESULT_NOT_RECORDED",
    );
    expect(await trustRecords.findByTransactionId(TX)).toBeNull();
  });

  it("refuses with 404 when there is no intent for the transaction", async () => {
    const { finalizer } = setup();

    const error = await finalizer.finalize("unknown").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentNotFoundError);
    expect((error as ExecutionIntentNotFoundError).status).toBe(404);
    expect((error as ExecutionIntentNotFoundError).code).toBe(
      "EXECUTION_INTENT_NOT_FOUND",
    );
  });
});

describe("ADR-0012: intent verification", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function storedIntent(): Promise<ExecutionIntent> {
    const { runtime, repository } = setup();

    await runtime.execute(await transaction());

    return (await repository.findByTransactionId(TX))!.intent;
  }

  it("verifies an untouched intent, including after a JSON round trip", async () => {
    const intent = await storedIntent();

    const roundTripped = JSON.parse(JSON.stringify(intent)) as ExecutionIntent;

    expect(await new ExecutionIntentCrypto().verify(roundTripped)).toBe(true);
  });

  it.each([
    ["the action", { action: "payments:refund" }],
    ["the target", { target: "vendor://elsewhere" }],
    ["the authorization", { authorizationId: "another-authorization" }],
    ["the hash of the executable content", { businessTransactionHash: "00" }],
    ["the policy version", { policyVersion: "9.9.9" }],
  ])("rejects an intent whose %s was altered", async (_label, change) => {
    const intent = await storedIntent();

    const tampered = JSON.parse(
      JSON.stringify({ ...intent, ...change }),
    ) as ExecutionIntent;

    expect(await new ExecutionIntentCrypto().verify(tampered)).toBe(false);
  });

  it("rejects an intent whose signature was replaced", async () => {
    const intent = await storedIntent();

    const tampered = JSON.parse(
      JSON.stringify({
        ...intent,
        signature: { ...intent.signature, value: "AAAA" },
      }),
    ) as ExecutionIntent;

    expect(await new ExecutionIntentCrypto().verify(tampered)).toBe(false);
  });
});

describe("G-54: closing an intent that was reconciled by hand", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const found = {
    resolution: "NOT_EXECUTED",
    note: "Checked the connector. No refund exists for this order.",
    resolvedBy: "operator-1",
  };

  async function erroredIntent() {
    const harness = setup({
      releaseFailsWith: new Error("connector timed out"),
    });

    await harness.runtime.execute(await transaction()).catch(() => undefined);

    return harness;
  }

  async function preparedIntent() {
    const harness = setup();

    vi.spyOn(harness.repository, "markReleased").mockRejectedValue(
      new Error("status write failed"),
    );
    harness.trustRecords.failCreate = true;

    await harness.runtime.execute(await transaction()).catch(() => undefined);

    harness.trustRecords.failCreate = false;

    return harness;
  }

  it("closes an ERRORED intent, records who and why, and never calls the connector", async () => {
    const { service, repository, release } = await erroredIntent();

    expect((await repository.findByTransactionId(TX))?.status.state).toBe(
      "ERRORED",
    );

    const result = await service.resolve(TX, found);

    expect(result.outcome).toBe("RESOLVED");
    expect(result.stored.status).toMatchObject({
      state: "RESOLVED",
      resolution: "NOT_EXECUTED",
      resolutionNote: found.note,
      resolvedBy: "operator-1",
      failureReason: "connector timed out",
    });
    expect(result.stored.status.resolvedAt).toBeInstanceOf(Date);
    expect(release.calls).toBe(1);
  });

  it("closes a PREPARED intent whose execution result was never saved", async () => {
    const { service } = await preparedIntent();

    const result = await service.resolve(TX, {
      ...found,
      resolution: "EXECUTED",
    });

    expect(result.outcome).toBe("RESOLVED");
    expect(result.stored.status.resolution).toBe("EXECUTED");
  });

  it("removes the resolved intent from the unfinalized list", async () => {
    const { service } = await erroredIntent();

    expect(await service.listUnfinalized(10)).toHaveLength(1);

    await service.resolve(TX, found);

    expect(await service.listUnfinalized(10)).toHaveLength(0);
  });

  it("is idempotent: a second resolve changes nothing and keeps the first statement", async () => {
    const { service } = await erroredIntent();

    await service.resolve(TX, found);

    const again = await service.resolve(TX, {
      resolution: "EXECUTED",
      note: "A different note.",
      resolvedBy: "operator-2",
    });

    expect(again.outcome).toBe("ALREADY_RESOLVED");
    expect(again.stored.status).toMatchObject({
      resolution: "NOT_EXECUTED",
      resolutionNote: found.note,
      resolvedBy: "operator-1",
    });
  });

  it("treats a lost race as already resolved, and reports the winner", async () => {
    const { service, repository } = await erroredIntent();
    const realMarkResolved = repository.markResolved.bind(repository);

    vi.spyOn(repository, "markResolved").mockImplementation(async (id) => {
      await realMarkResolved(id, {
        resolution: "EXECUTED",
        note: "The other operator won.",
        resolvedBy: "operator-2",
        resolvedAt: new Date(),
      });

      return false;
    });

    const result = await service.resolve(TX, found);

    expect(result.outcome).toBe("ALREADY_RESOLVED");
    expect(result.stored.status.resolvedBy).toBe("operator-2");
  });

  it("refuses a RELEASED intent and points to finalize", async () => {
    const harness = setup();

    harness.trustRecords.failCreate = true;
    await harness.runtime.execute(await transaction()).catch(() => undefined);

    const error = await harness.service
      .resolve(TX, found)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentNotResolvableError);
    expect((error as ExecutionIntentNotResolvableError).status).toBe(409);
    expect((error as ExecutionIntentNotResolvableError).code).toBe(
      "EXECUTION_INTENT_NOT_RESOLVABLE",
    );
    expect((error as Error).message).toContain("finalize");
    expect(
      (await harness.repository.findByTransactionId(TX))?.status.state,
    ).toBe("RELEASED");
  });

  it("refuses a FINALIZED intent", async () => {
    const { runtime, service } = setup();

    await runtime.execute(await transaction());

    const error = await service.resolve(TX, found).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentNotResolvableError);
    expect((error as Error).message).toContain("already complete");
  });

  it("refuses an unknown transaction with 404", async () => {
    const { service } = setup();

    const error = await service
      .resolve("unknown", found)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentNotFoundError);
  });

  it.each([
    ["a missing resolution", { note: "n" }],
    ["an unknown resolution", { resolution: "MAYBE", note: "n" }],
    ["a missing note", { resolution: "NOT_EXECUTED" }],
    ["a blank note", { resolution: "NOT_EXECUTED", note: "   " }],
    ["a note that is not text", { resolution: "NOT_EXECUTED", note: 5 }],
    [
      "a note over the limit",
      { resolution: "NOT_EXECUTED", note: "x".repeat(2001) },
    ],
  ])("rejects %s with 400 and changes nothing", async (_label, input) => {
    const { service, repository } = await erroredIntent();

    const error = await service.resolve(TX, input).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ExecutionIntentResolutionInvalidError);
    expect((error as ExecutionIntentResolutionInvalidError).status).toBe(400);
    expect((error as ExecutionIntentResolutionInvalidError).code).toBe(
      "EXECUTION_INTENT_RESOLUTION_INVALID",
    );
    expect((await repository.findByTransactionId(TX))?.status.state).toBe(
      "ERRORED",
    );
  });

  it("accepts a note of exactly the limit and trims surrounding space", async () => {
    const { service } = await erroredIntent();

    const result = await service.resolve(TX, {
      resolution: "NOT_EXECUTED",
      note: `  ${"x".repeat(2000)}  `,
    });

    expect(result.stored.status.resolutionNote).toHaveLength(2000);
  });
});
