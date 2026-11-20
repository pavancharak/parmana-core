import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BusinessTrustPipeline } from "@parmana/runtime";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";
import { seedPolicyGovernanceApprovals } from "../../../../test-support/policy-governance.js";

/**
 * The HTTP contract for the 500 branch: EXECUTION_RECORD_INCOMPLETE.
 *
 * The action is released (the connector runs), and then the signed Trust
 * Record cannot be produced. The route must answer 500 with the code and the
 * identifiers an operator needs to reconcile, and must not answer 200 or
 * retry the action. This test reaches that branch through the real /execute
 * route, real policy governance, real connector release, and real error
 * mapping. The only injected fault is in the trust-record stage, which runs
 * after release. Before this file, the branch was covered only in the runtime
 * unit tests (execution-record-incomplete.test.ts), not over HTTP.
 */
describe("EXECUTION_RECORD_INCOMPLETE over HTTP (500)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("answers 500 with the code and identifiers after release, and releases only once", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(BusinessTrustPipeline.prototype, "execute").mockRejectedValue(
      new Error("simulated trust record persistence failure"),
    );

    let executorCalls = 0;
    const { executionSystem } = createInspectableExecutionSystem({
      executor: {
        async execute() {
          executorCalls += 1;
          return { status: "ok" } as never;
        },
      },
    });

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    const transaction = await createBusinessTransaction();
    await seedPolicyGovernanceApprovals(transaction);

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(500);
    expect(response.body.code).toBe("EXECUTION_RECORD_INCOMPLETE");
    expect(response.body.error).toContain(transaction.businessTransactionId);
    expect(response.body.error).toContain("simulated trust record");
    // The action ran once. A 500 here must never be answered by a second release.
    expect(executorCalls).toBe(1);
  });
});
