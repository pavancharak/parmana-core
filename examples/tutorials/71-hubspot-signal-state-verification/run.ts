import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockHubSpotServer,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-hubspot";
import {
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// The HubSpot sibling of Tutorial 65: a caller can declare any
// currentDealStage it likes -- HubSpotSignalStateVerifier independently
// fetches the real deal from HubSpot and rejects any request whose
// declared facts disagree with it.
//
process.env.NODE_ENV = "test";

const TOKEN = HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN;

const mockServer = new MockHubSpotServer({ token: TOKEN });
await mockServer.listen();

process.env.HUBSPOT_BASE_URL = mockServer.baseUrl;
process.env.TEST_HUBSPOT_PRIVATE_APP_TOKEN = TOKEN;

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");

function dealUpdateTransaction(overrides: {
  dealId: string;
  dealstage?: string;
  amount?: number;
  signals: Record<string, unknown>;
}): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-71",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-71",
      displayName: "Tutorial 71",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: "hubspot:deal-update",
      target: `hubspot://deals/${overrides.dealId}`,
      parameters: Object.freeze({
        dealId: overrides.dealId,
        ...(overrides.dealstage !== undefined
          ? { dealstage: overrides.dealstage }
          : {}),
        ...(overrides.amount !== undefined ? { amount: overrides.amount } : {}),
      }),
      createdAt: now,
    },
    policy: {
      name: "hubspot-deal-update",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    },
    signals: overrides.signals,
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 71 - HubSpot Signal-State Verification");
console.log("==================================================");
console.log();

try {
  // The real deal on (mock) HubSpot is already closedlost -- terminal,
  // no forward transition is ever allowed out of it.
  mockServer.setDeal({
    id: "9004",
    properties: {
      dealstage: "closedlost",
      amount: "5000",
      pipeline: "default",
    },
  });

  const executionSystem = await createExecutionSystem();
  const application = createApplication(
    executionSystem,
    demoApprovalVerifier(),
  );

  // The caller declares signals as if the deal were still at an early,
  // non-terminal stage -- so the proposed forward transition looks
  // allowed on paper, even though it isn't against the real deal.
  const transaction = dealUpdateTransaction({
    dealId: "9004",
    dealstage: "qualifiedtobuy",
    signals: {
      currentDealStage: "appointmentscheduled",
      proposedDealStage: "qualifiedtobuy",
      dealStageChangeRequested: true,
      dealStageTransitionAllowed: true,
      amountChangeRequested: false,
      amountDeltaAbs: 0,
      amountChangeExceedsThreshold: false,
      preAuthorizedForAmountChange: false,
    },
  });

  let outcome: "APPROVED" | "REJECTED" = "APPROVED";
  let reason = "";

  try {
    const trustRecord = await application.execute(
      await withDemoApproval(transaction),
    );
    const decision = trustRecord.executions.at(-1)?.decision;
    outcome = (decision?.outcome as "APPROVED" | "REJECTED") ?? "REJECTED";
    reason = decision?.reason ?? "";
  } catch (error) {
    outcome = "REJECTED";
    reason = error instanceof Error ? error.message : String(error);
  }

  console.log("Decision");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${outcome}`);
  console.log(`Reason  : ${reason}`);
  console.log();

  const deal = mockServer.getDeal("9004");

  console.log("HubSpot Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Real dealstage (independently fetched) : closedlost`);
  console.log(`Caller-declared currentDealStage        : appointmentscheduled`);
  console.log(
    `Deal 9004 dealstage (unchanged)          : ${deal?.properties.dealstage}`,
  );
  console.log();

  if (
    outcome === "REJECTED" &&
    reason.includes("currentDealStage") &&
    deal?.properties.dealstage === "closedlost"
  ) {
    console.log(
      "✓ The caller's declared currentDealStage was rejected against the independently verified real state.",
    );
  } else {
    console.log("✗ Expected a rejection naming the currentDealStage mismatch.");
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 72 - HubSpot Approval Artifact");
} finally {
  await mockServer.close();
}
