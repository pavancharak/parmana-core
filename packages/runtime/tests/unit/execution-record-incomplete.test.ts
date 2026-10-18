import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  Authority,
  Authorization,
  BusinessTransaction,
  BusinessTransactionStatus,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  TransactionMetadata,
} from "@parmana/shared";

import {
  FilePolicyRepository,
  PolicyEngine,
  PolicyRouter,
  SignalIntentBinder,
} from "@parmana/policy";

import { BusinessTrustPipeline } from "../../src/BusinessTrustPipeline.js";
import { DecisionBuilder } from "../../src/DecisionBuilder.js";
import { ExecutionBuilder } from "../../src/ExecutionBuilder.js";
import { ExecutionGate } from "../../src/ExecutionGate.js";
import { Runtime } from "../../src/Runtime.js";
import { RuntimeAuthorizationSigner } from "../../src/RuntimeAuthorizationSigner.js";
import { RuntimeEngine } from "../../src/RuntimeEngine.js";
import { RuntimePipeline } from "../../src/RuntimePipeline.js";
import type { RuntimeComponent } from "../../src/RuntimeComponent.js";
import type { SigningReadiness } from "../../src/SigningReadiness.js";
import { ExecutionRecordIncompleteError } from "../../src/errors/ExecutionRecordIncompleteError.js";
import { SigningUnavailableError } from "../../src/errors/SigningUnavailableError.js";

import {
  testApprovalSignalVerifier,
  withTestApproval,
} from "../../../../test-support/approvals.js";

/**
 * G-52 (docs/VERIFICATION-GAPS.md): an action must not be released when the
 * evidence signing path is down, and a failure to produce the record AFTER
 * release must say so explicitly instead of surfacing a generic error.
 */
const policyRepository = new FilePolicyRepository(
  path.resolve(import.meta.dirname, "../../../../policies"),
);

function transaction(): Promise<BusinessTransaction> {
  return withTestApproval({
    businessTransactionId: "tx-g52",
    metadata: { executionMode: "SYNC" } as unknown as TransactionMetadata,
    authority: {} as Authority,
    authorization: {} as Authorization,
    intent: {
      intentId: "intent-g52",
      authorizationId: "authorization-g52",
      action: "payments:execute",
      target: "vendor://payments",
      parameters: { amount: 100 },
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
 * Stands in for the connector release: counts how many times the
 * pipeline (where the gateway releases the action) actually ran.
 */
class ReleaseCounter implements RuntimeComponent {
  calls = 0;

  async execute<T>(context: T): Promise<T> {
    this.calls += 1;
    return context;
  }
}

function engineWith(
  release: ReleaseCounter,
  trustPipeline: BusinessTrustPipeline,
  signingReadiness?: SigningReadiness,
): RuntimeEngine {
  return new RuntimeEngine(
    new RuntimePipeline([release as unknown as RuntimeComponent]),
    new PolicyRouter(policyRepository),
    new PolicyEngine(),
    new SignalIntentBinder(),
    new DecisionBuilder(),
    new ExecutionGate(),
    new ExecutionBuilder(),
    trustPipeline,
    new RuntimeAuthorizationSigner(),
    120,
    undefined,
    undefined,
    undefined,
    testApprovalSignalVerifier(),
    undefined,
    undefined,
    undefined,
    signingReadiness,
  );
}

describe("G-52: signing readiness before release", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("refuses with 503 and never releases the action when signing is not ready", async () => {
    const release = new ReleaseCounter();
    const engine = engineWith(release, new BusinessTrustPipeline(), {
      async assertReady() {
        throw new SigningUnavailableError(new Error("KMS unreachable"));
      },
    });

    const error = await engine
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SigningUnavailableError);
    expect((error as SigningUnavailableError).status).toBe(503);
    expect(release.calls).toBe(0);
  });

  it("releases and returns a record when signing is ready", async () => {
    const release = new ReleaseCounter();
    const assertReady = vi.fn().mockResolvedValue(undefined);
    const engine = engineWith(release, new BusinessTrustPipeline(), {
      assertReady,
    });

    const result = await engine.execute(await transaction());

    expect(assertReady).toHaveBeenCalledTimes(1);
    expect(release.calls).toBe(1);
    expect(result.trustRecord.businessTransactionId).toBe("tx-g52");
  });

  it("does not check readiness at all when none is configured (unchanged behavior)", async () => {
    const release = new ReleaseCounter();
    const engine = engineWith(release, new BusinessTrustPipeline());

    const result = await engine.execute(await transaction());

    expect(release.calls).toBe(1);
    expect(result.trustRecord).toBeDefined();
  });
});

describe("G-52: failure after the action was released", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reports EXECUTION_RECORD_INCOMPLETE with the identifiers, and logs it at critical severity", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {
      /* captured */
    });
    const release = new ReleaseCounter();
    const failingTrustPipeline = {
      async execute() {
        throw new Error("Member must have length less than or equal to 4096");
      },
    } as unknown as BusinessTrustPipeline;
    const engine = engineWith(release, failingTrustPipeline);

    const error = await engine
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(release.calls).toBe(1);
    expect(error).toBeInstanceOf(ExecutionRecordIncompleteError);

    const incomplete = error as ExecutionRecordIncompleteError;
    expect(incomplete.status).toBe(500);
    expect(incomplete.code).toBe("EXECUTION_RECORD_INCOMPLETE");
    expect(incomplete.businessTransactionId).toBe("tx-g52");
    expect(incomplete.authorizationId).toBeDefined();
    expect(incomplete.message).toContain("tx-g52");
    expect(incomplete.message).toContain("Do not retry as a new transaction");
    expect(incomplete.message).toContain("4096");

    const logged = errorLog.mock.calls
      .map((call) => call[0] as Record<string, unknown>)
      .find((entry) => entry.event === "execution_released_record_failed");

    expect(logged).toMatchObject({
      severity: "critical",
      businessTransactionId: "tx-g52",
    });
  });

  it("reports EXECUTION_RECORD_INCOMPLETE when the signed record cannot be persisted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const release = new ReleaseCounter();
    const engine = engineWith(release, new BusinessTrustPipeline());

    const failingRepository = {
      async create(): Promise<ExecutionTrustRecord> {
        throw new Error("database unavailable");
      },
    } as unknown as ExecutionTrustRecordRepository;

    const runtime = new Runtime(engine, failingRepository);

    const error = await runtime
      .execute(await transaction())
      .catch((e: unknown) => e);

    expect(release.calls).toBe(1);
    expect(error).toBeInstanceOf(ExecutionRecordIncompleteError);
    expect(
      (error as ExecutionRecordIncompleteError).businessTransactionId,
    ).toBe("tx-g52");
    expect((error as ExecutionRecordIncompleteError).message).toContain(
      "database unavailable",
    );
  });

  it("does not reclassify a failure BEFORE release as a released action", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const release = new ReleaseCounter();
    const engine = engineWith(release, new BusinessTrustPipeline());

    const rejected: BusinessTransaction = {
      ...(await transaction()),
      signals: { ...(await transaction()).signals, paymentApproved: false },
    };

    const error = await engine.execute(rejected).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(ExecutionRecordIncompleteError);
    expect(release.calls).toBe(0);
  });
});
