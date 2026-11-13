import path from "node:path";

import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { FilePolicyRepository } from "@parmana/policy";
import { RuntimeFactory } from "@parmana/runtime";
import { CachedSigningReadiness } from "@parmana/runtime";
import type { ExecutionResult } from "@parmana/shared";
import {
  MemoryBusinessTransactionRepository,
  MemoryExecutionIntentRepository,
  MemoryExecutionTrustRecordRepository,
  MemoryRefusalRecordRepository,
} from "@parmana/storage";

import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { testApprovalSignalVerifier } from "../../../../test-support/approvals.js";

/**
 * Infrastructure fault injection at the HTTP boundary.
 *
 * Each test wires the real Runtime, with real in-memory repositories, but
 * makes one piece of infrastructure fail on purpose: the business transaction
 * store, the execution intent store, or the signing path. It then checks the
 * property that matters for each failure:
 *
 *   - a failure before release never calls the connector;
 *   - a failure never produces a success response;
 *   - retrying after recovery releases the action exactly once.
 *
 * Failures after release are covered by execution-intents.integration.test.ts.
 */

const POLICY_DIRECTORY = path.resolve(
  import.meta.dirname,
  "../../../../policies",
);

let previousIntentsCheck: string | undefined;
let previousSigningCheck: string | undefined;

beforeAll(() => {
  previousIntentsCheck = process.env.EXECUTION_INTENTS_CHECK;
  previousSigningCheck = process.env.SIGNING_READINESS_CHECK;
  process.env.EXECUTION_INTENTS_CHECK = "true";
  process.env.SIGNING_READINESS_CHECK = "true";
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();

  if (previousIntentsCheck === undefined) {
    delete process.env.EXECUTION_INTENTS_CHECK;
  } else {
    process.env.EXECUTION_INTENTS_CHECK = previousIntentsCheck;
  }

  if (previousSigningCheck === undefined) {
    delete process.env.SIGNING_READINESS_CHECK;
  } else {
    process.env.SIGNING_READINESS_CHECK = previousSigningCheck;
  }
});

class SwitchableTransactions extends MemoryBusinessTransactionRepository {
  failing = false;

  override async create(
    transaction: Parameters<MemoryBusinessTransactionRepository["create"]>[0],
  ) {
    if (this.failing) {
      throw new Error("transaction store unavailable");
    }

    return super.create(transaction);
  }
}

class SwitchableIntents extends MemoryExecutionIntentRepository {
  failing = false;

  override async create(
    intent: Parameters<MemoryExecutionIntentRepository["create"]>[0],
  ) {
    if (this.failing) {
      throw new Error("intent store unavailable");
    }

    return super.create(intent);
  }
}

interface FaultyApp {
  readonly app: ReturnType<typeof createApp>;
  readonly transactions: SwitchableTransactions;
  readonly intents: SwitchableIntents;
  readonly trustRecords: MemoryExecutionTrustRecordRepository;
  readonly connectorCalls: () => number;
  readonly signing: { failing: boolean };
}

function buildFaultyApp(): FaultyApp {
  let connectorCalls = 0;

  const { executionSystem } = createInspectableExecutionSystem({
    executor: {
      async execute(executableContent): Promise<ExecutionResult> {
        connectorCalls += 1;

        return {
          ...executableContent,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    },
  });

  const transactions = new SwitchableTransactions();
  const intents = new SwitchableIntents();
  const trustRecords = new MemoryExecutionTrustRecordRepository();
  const signing = { failing: false };

  // The production class, with a probe that fails on demand. A zero TTL
  // means every request probes again, so recovery is seen at once.
  const signingReadiness = new CachedSigningReadiness(async () => {
    if (signing.failing) {
      throw new Error("signing key unavailable");
    }
  }, 0);

  const application = RuntimeFactory.create(
    transactions,
    trustRecords,
    new FilePolicyRepository(POLICY_DIRECTORY),
    executionSystem,
    new MemoryRefusalRecordRepository(),
    testApprovalSignalVerifier(),
    undefined,
    undefined,
    signingReadiness,
    intents,
  );

  return {
    app: createApp(application, { callerAuth: "disabled" }),
    transactions,
    intents,
    trustRecords,
    signing,
    connectorCalls: () => connectorCalls,
  };
}

describe("Fault injection (HTTP): failures before release", () => {
  it("refuses, and never calls the connector, when the business transaction store fails", async () => {
    const faulty = buildFaultyApp();
    const transaction = await createBusinessTransaction();

    faulty.transactions.failing = true;

    const response = await request(faulty.app)
      .post("/execute")
      .send(transaction);

    expect(response.status).toBeGreaterThanOrEqual(500);
    expect(response.status).not.toBe(200);
    expect(faulty.connectorCalls()).toBe(0);
    expect(JSON.stringify(response.body)).not.toContain(
      "transaction store unavailable",
    );

    const record = await request(faulty.app).get(
      `/trust-records/${transaction.businessTransactionId}`,
    );

    expect(record.status).toBe(404);
  });

  it("releases exactly once when the same transaction is retried after the store recovers", async () => {
    const faulty = buildFaultyApp();
    const transaction = await createBusinessTransaction();

    faulty.transactions.failing = true;

    const failed = await request(faulty.app).post("/execute").send(transaction);

    expect(failed.status).not.toBe(200);
    expect(faulty.connectorCalls()).toBe(0);

    faulty.transactions.failing = false;

    const retried = await request(faulty.app)
      .post("/execute")
      .send(transaction);

    expect(retried.status).toBe(200);
    expect(faulty.connectorCalls()).toBe(1);

    //
    // A further retry of the same transaction must not release it again.
    //
    const again = await request(faulty.app).post("/execute").send(transaction);

    expect(again.status).not.toBe(500);
    expect(faulty.connectorCalls()).toBe(1);
  });

  it("answers 503 EXECUTION_INTENT_UNAVAILABLE, and never calls the connector, when the intent store fails", async () => {
    const faulty = buildFaultyApp();
    const transaction = await createBusinessTransaction();

    faulty.intents.failing = true;

    const response = await request(faulty.app)
      .post("/execute")
      .send(transaction);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("EXECUTION_INTENT_UNAVAILABLE");
    expect(faulty.connectorCalls()).toBe(0);
  });

  it("answers 503 SIGNING_UNAVAILABLE, and never calls the connector, when signing is not ready", async () => {
    const faulty = buildFaultyApp();
    const transaction = await createBusinessTransaction();

    faulty.signing.failing = true;

    const response = await request(faulty.app)
      .post("/execute")
      .send(transaction);

    expect(response.status).toBe(503);
    expect(response.body.code).toBe("SIGNING_UNAVAILABLE");
    expect(faulty.connectorCalls()).toBe(0);
  });

  // Known gap: SigningUnavailableError appends the cause's message to the
  // response, so the internal error text reaches the caller. it.fails
  // records this as a known defect. When the response stops carrying the
  // cause, this test starts failing: delete the .fails then.
  it.fails(
    "does not return the internal cause of a signing failure to the caller (known gap)",
    async () => {
      const faulty = buildFaultyApp();
      const transaction = await createBusinessTransaction();

      faulty.signing.failing = true;

      const response = await request(faulty.app)
        .post("/execute")
        .send(transaction);

      expect(JSON.stringify(response.body)).not.toContain(
        "signing key unavailable",
      );
    },
  );

  it("refuses a retry of the same transaction id after a signing refusal, and releases a new id once signing recovers", async () => {
    const faulty = buildFaultyApp();
    const transaction = await createBusinessTransaction();

    faulty.signing.failing = true;

    const refused = await request(faulty.app)
      .post("/execute")
      .send(transaction);

    expect(refused.status).toBe(503);
    expect(faulty.connectorCalls()).toBe(0);

    faulty.signing.failing = false;

    //
    // The refused transaction was already recorded as received, so the
    // same id is a duplicate. SigningUnavailableError says the caller
    // retries with a new businessTransactionId. Nothing is released twice.
    //
    const sameId = await request(faulty.app).post("/execute").send(transaction);

    expect(sameId.status).toBe(409);
    expect(faulty.connectorCalls()).toBe(0);

    const fresh = await createBusinessTransaction();

    const executed = await request(faulty.app).post("/execute").send(fresh);

    expect(executed.status).toBe(200);
    expect(faulty.connectorCalls()).toBe(1);
  });
});
