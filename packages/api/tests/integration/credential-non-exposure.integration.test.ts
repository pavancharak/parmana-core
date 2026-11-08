import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * EV-10: a connector's credential never reaches the caller, the decision
 * or the evidence.
 *
 * The connector receives the real credential value from the session
 * credential vault. This test records that value, then checks the HTTP
 * response body and every audit event for it. The credential must be
 * present where the connector needs it, and absent everywhere a caller or
 * an auditor can read.
 */
const SECRET = "test-inspectable-token";

describe("Credential non-exposure (HTTP boundary)", () => {
  it("gives the connector the credential, and keeps it out of the response and the audit evidence", async () => {
    let seenByConnector: unknown;

    const { executionSystem, auditSink } = createInspectableExecutionSystem({
      executor: {
        async execute(executableContent, credential) {
          seenByConnector = credential.value;
          return {
            ...executableContent,
            success: true,
            executedAt: new Date(),
            metadata: {},
          };
        },
      },
    });

    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    // Sanity: the connector did receive the secret, so the check below is
    // meaningful rather than vacuous.
    expect(JSON.stringify(seenByConnector)).toContain(SECRET);

    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(JSON.stringify(auditSink.events)).not.toContain(SECRET);
  });

  it("keeps the credential out of the response and the evidence when the connector fails", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem({
      executor: {
        async execute() {
          throw new Error("simulated downstream connector failure");
        },
      },
    });

    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(JSON.stringify(auditSink.events)).not.toContain(SECRET);
  });
});
