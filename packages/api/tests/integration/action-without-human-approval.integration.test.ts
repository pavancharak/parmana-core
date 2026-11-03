import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApplication } from "../../src/application.js";
import { createApp } from "../../src/app.js";

import { createBusinessTransaction } from "../fixtures/business-transaction.js";
import { createInspectableExecutionSystem } from "../bootstrap/createInspectableExecutionSystem.js";

/**
 * EV-04: no action is authorized without a signed approval from a trusted
 * approver for that action and resource. An agent may claim approval with
 * a plain flag, or may send no approval at all (for example after prompt
 * injection). Both must be refused, and neither may reach the connector.
 *
 * The approval the policy asks for is the signal `humanApproved` plus the
 * signed artifact `approvalArtifact` (see test-support/approvals.ts).
 */
const APPROVAL_FLAG = "humanApproved";
const APPROVAL_ARTIFACT = "approvalArtifact";

function refused(status: number): boolean {
  return status >= 400;
}

describe("Action without a human approval (HTTP boundary)", () => {
  it("authorizes the same transaction when its signed approval is present (control)", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem();
    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const response = await request(app)
      .post("/execute")
      .send(await createBusinessTransaction());

    expect(response.status).toBe(200);
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed")
        .length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("refuses an action that carries no approval at all", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem();
    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const transaction = await createBusinessTransaction();
    const { [APPROVAL_ARTIFACT]: _removed, ...signals } =
      transaction.signals as Record<string, unknown>;
    const response = await request(app)
      .post("/execute")
      .send({
        ...transaction,
        signals: { ...signals, [APPROVAL_FLAG]: false },
      });

    expect(refused(response.status)).toBe(true);
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed"),
    ).toHaveLength(0);
  });

  it("refuses an action that claims approval with a plain flag and no signed artifact", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem();
    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const transaction = await createBusinessTransaction();
    const { [APPROVAL_ARTIFACT]: _removed, ...signals } =
      transaction.signals as Record<string, unknown>;
    const response = await request(app)
      .post("/execute")
      .send({ ...transaction, signals: { ...signals, [APPROVAL_FLAG]: true } });

    expect(refused(response.status)).toBe(true);
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed"),
    ).toHaveLength(0);
  });

  it("refuses an action whose signed approval has been forged", async () => {
    const { executionSystem, auditSink } = createInspectableExecutionSystem();
    const app = createApp(createApplication(executionSystem), {
      callerAuth: "disabled",
    });

    const transaction = await createBusinessTransaction();
    const artifact = (transaction.signals as Record<string, any>)[
      APPROVAL_ARTIFACT
    ];
    // Replace the signature value. The verifier checks it against the
    // approver's public key, so a changed signature must be refused.
    const forged = {
      ...artifact,
      signature: {
        ...artifact.signature,
        value: `${String(artifact.signature.value).slice(0, -4)}AAAA`,
      },
    };
    const response = await request(app)
      .post("/execute")
      .send({
        ...transaction,
        signals: { ...transaction.signals, [APPROVAL_ARTIFACT]: forged },
      });

    expect(refused(response.status)).toBe(true);
    expect(
      auditSink.events.filter((event) => event.type === "execution.completed"),
    ).toHaveLength(0);
  });
});
