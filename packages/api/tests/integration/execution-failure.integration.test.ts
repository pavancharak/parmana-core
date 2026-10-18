import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * Phase 2D — restored.
 *
 * Previously `describe.skip`, with the stated reason "the current
 * RuntimeFactory always creates a DefaultExecutionSystem internally,
 * making it impossible to inject a failing implementation." That
 * blocker is gone — `RuntimeFactory.create()` now requires an
 * `ExecutionSystem` as a constructor argument rather than building one
 * itself — but restoring this test required more than deleting `.skip`:
 * the original assertions (`response.body.execution.status === "FAILED"`,
 * `response.body.error` containing `"Execution System"`) never matched
 * any response shape this API actually produces. `errorHandler`
 * (packages/api/src/middleware/error-handler.ts) maps an unrecognized
 * thrown error to a generic `{ error: "Internal Server Error" }` 500,
 * by design, specifically so internal failure detail is never leaked to
 * a caller — confirmed empirically before rewriting this file, not
 * assumed. See the Phase 2D execution failure testing record (in git history)
 * for the full investigation.
 *
 * Since G-63 a connector failure no longer reaches errorHandler
 * unrecognized: RuntimeEngine turns it into 502 EXECUTION_OUTCOME_UNKNOWN,
 * which carries the transaction's identifiers, matching the ERRORED
 * Execution Intent, and still never the cause's own message.
 *
 * Uses createInspectableExecutionSystem (already used by
 * credential-isolation.integration.test.ts and others) to inject a
 * connector executor that deterministically throws, through the real
 * ExecutionGateway / ExecutionControlService / SessionCredentialSecureConnector
 * chain — not the shared ../test-app.js singleton, which has no
 * mechanism to inject a failing implementation at all.
 *
 * credential-isolation.integration.test.ts already proves the
 * credential-issue-then-destroy guarantee for this same failure shape;
 * this file's distinct job is the HTTP response contract and the
 * evidentiary absence (no Trust Record, no Receipt, no fabricated
 * success) — properties nothing else in the suite currently asserts.
 */
describe("Execution Failure", () => {
  it("marks execution as failed, with no fabricated success and no evidentiary artifacts, when the connector executor throws", async () => {
    let executorCalls = 0;

    const { executionSystem, auditSink } = createInspectableExecutionSystem({
      executor: {
        async execute() {
          executorCalls += 1;
          throw new Error("simulated downstream connector failure");
        },
      },
    });

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    const transaction = await createBusinessTransaction();

    const response = await request(app).post("/execute").send(transaction);

    //
    // Deterministic failure, not a fabricated success. Since G-63 the
    // response says what the ERRORED Execution Intent records: the action
    // was released and its outcome is unknown, with the identifiers needed
    // to reconcile it. Before G-63 this was a bare 500 with no identifiers.
    //
    expect(response.status).toBe(502);
    expect(response.body.code).toBe("EXECUTION_OUTCOME_UNKNOWN");
    // RFC-0023 phase 4: never reported as failed, the action may have run.
    expect(response.body.executionStatus).toBe("EXECUTION_UNKNOWN");
    expect(response.body.error).toContain(transaction.businessTransactionId);
    expect(response.body.error).toContain("Do not retry as a new transaction");

    // The real failure reason must never reach the caller (error-handler.ts's
    // documented no-leak design) — confirms this isn't accidentally exposing
    // internals rather than genuinely failing closed.
    expect(JSON.stringify(response.body)).not.toContain(
      "simulated downstream connector failure",
    );

    //
    // No partial execution: the connector was reached exactly once (proving
    // the failure happened where intended, at the connector, not earlier for
    // an unrelated reason) and nothing after it could have produced a second,
    // divergent outcome.
    //
    expect(executorCalls).toBe(1);

    //
    // No Trust Record: BusinessTrustPipeline.execute() is only reached after
    // RuntimePipeline.execute() returns successfully; the thrown error
    // propagates out of RuntimeEngine.execute() before that point, so
    // Runtime.execute() never calls trustRecords.create().
    //
    const trustRecordResponse = await request(app).get(
      `/trust-records/${transaction.businessTransactionId}`,
    );
    expect(trustRecordResponse.status).toBe(404);
    expect(trustRecordResponse.body).toEqual({
      error: "Execution Trust Record not found.",
    });

    //
    // No Receipt: ReceiptService.generate() is only reached after a
    // successfully persisted Trust Record exists to generate one from.
    //
    const receiptResponse = await request(app).get(
      `/receipt/latest/${transaction.businessTransactionId}`,
    );
    expect(receiptResponse.status).toBe(404);

    //
    // Not a policy rejection: this transaction was approved and authorized
    // (SignalIntentBinder/PolicyEngine both passed) — it failed downstream,
    // at the connector, after authorization. No Refusal Record should exist
    // for it, distinguishing this failure path from the one
    // refusal-record.integration.test.ts covers.
    //
    const refusalResponse = await request(app).get(
      `/refusal/${transaction.businessTransactionId}`,
    );
    expect(refusalResponse.status).toBe(404);
    expect(refusalResponse.body).toEqual({
      error: "Refusal Record not found.",
    });

    //
    // The failure is still evidenced in the audit trail even though no
    // Trust Record exists — full credential-issue-then-destroy proof for
    // this same failure shape already lives in
    // credential-isolation.integration.test.ts; this only re-confirms the
    // audit event fires, not silently swallowed.
    //
    const rejectedEvents = auditSink.events.filter(
      (event) => event.type === "execution.rejected",
    );
    expect(rejectedEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("fails deterministically across repeated attempts against the same failing connector (not flaky)", async () => {
    const { executionSystem } = createInspectableExecutionSystem({
      executor: {
        async execute() {
          throw new Error("simulated downstream connector failure");
        },
      },
    });

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post("/execute")
        .send(await createBusinessTransaction());

      expect(response.status).toBe(502);
      expect(response.body.code).toBe("EXECUTION_OUTCOME_UNKNOWN");
    }
  });
});
