import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * HTTP-level proof of the credential-isolation guarantee.
 *
 * packages/execution-control/tests/unit/session-credential-secure-connector.test.ts
 * already proves "a session credential is issued and destroyed exactly
 * once per execution" by calling SessionCredentialSecureConnector.execute()
 * directly. This test proves the SAME guarantee holds through a real
 * POST /execute HTTP request against the real Express app, using the
 * real ExecutionGateway / SessionCredentialExecutionControl /
 * ExecutionControlService / SessionCredentialSecureConnector chain — the
 * library-level guarantee, converted into a boundary-level one.
 *
 * Each test builds its own inspectable execution system (see
 * ../bootstrap/createInspectableExecutionSystem.ts) rather than importing
 * the shared ../test-app.js singleton, because this test needs a direct
 * reference to the audit sink and session credential vault, which the real
 * production bootstrap chain does not expose.
 */
describe("Credential Isolation (HTTP boundary)", () => {
  it("issues and destroys exactly one session credential for a successful /execute request", async () => {
    const { executionSystem, auditSink, sessionCredentialVault } =
      createInspectableExecutionSystem();

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    const transaction = await createBusinessTransaction();

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBe(200);

    // Two layers each record their own "execution.completed" event for
    // one request — ExecutionControlService.execute() and
    // SessionCredentialSecureConnector.execute() both audit independently
    // (confirmed here, not previously covered by any test). Only the
    // connector-level one carries credentialId, so filter on that rather
    // than assume a single event per type.
    const completedEvents = auditSink.events.filter(
      (event) => event.type === "execution.completed",
    );
    expect(completedEvents.length).toBeGreaterThanOrEqual(1);

    const credentialBearingEvents = completedEvents.filter(
      (event) => event.credentialId !== undefined,
    );
    expect(credentialBearingEvents).toHaveLength(1);

    const rejectedEvents = auditSink.events.filter(
      (event) => event.type === "execution.rejected",
    );
    expect(rejectedEvents).toHaveLength(0);

    // Proof of destruction: the same session credential ID can never be
    // consumed again. consume() checks `revoked` before `used`, and
    // SessionCredentialSecureConnector.execute() always revokes in a
    // finally block, so this must fail with "has been revoked" — not
    // "has already been used" — if destruction genuinely happened.
    const credentialId = credentialBearingEvents[0]!.credentialId!;

    await expect(sessionCredentialVault.consume(credentialId)).rejects.toThrow(
      /has been revoked/,
    );
  });

  it("still issues and destroys the session credential when the connector executor fails", async () => {
    const { executionSystem, auditSink, sessionCredentialVault } =
      createInspectableExecutionSystem({
        executor: {
          async execute() {
            throw new Error("simulated downstream connector failure");
          },
        },
      });

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    const transaction = await createBusinessTransaction();

    const response = await request(app).post("/execute").send(transaction);

    expect(response.status).toBeGreaterThanOrEqual(400);

    // Same double-audit pattern as the success case: both layers record
    // "execution.rejected" independently. Filter to the connector-level
    // event (the one carrying credentialId) to check the specific
    // failure message and prove issuance happened before the failure.
    const rejectedEvents = auditSink.events.filter(
      (event) => event.type === "execution.rejected",
    );
    expect(rejectedEvents.length).toBeGreaterThanOrEqual(1);

    const credentialBearingEvents = rejectedEvents.filter(
      (event) => event.credentialId !== undefined,
    );
    expect(credentialBearingEvents).toHaveLength(1);
    expect(credentialBearingEvents[0]?.reason).toContain(
      "simulated downstream connector failure",
    );

    // Even on a downstream failure, the credential was issued (this is
    // what distinguishes this case from the spoofed-attestation case
    // below, where issuance never happens at all) and still destroyed.
    const credentialId = credentialBearingEvents[0]?.credentialId;
    expect(credentialId).toBeDefined();

    await expect(sessionCredentialVault.consume(credentialId!)).rejects.toThrow(
      /has been revoked/,
    );
  });

  it("issues zero session credentials when the gateway attestation is spoofed", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem({
      signAttestationWithWrongKey: true,
    });

    const application = createApplication(executionSystem);
    const app = createApp(application, { callerAuth: "disabled" });

    const transaction = await createBusinessTransaction();

    const response = await request(app).post("/execute").send(transaction);

    // The attestation is rejected inside SessionCredentialExecutionControl,
    // which runs before ExecutionControlService.execute() (the sole
    // caller of GatewaySessionStore.create()) is ever reached, so no
    // session and no session credential are ever created.
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(auditSink.events).toHaveLength(0);
  });
});
