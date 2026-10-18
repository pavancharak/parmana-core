import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockHubSpotServer,
  HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-hubspot";

//
// Tutorial 69's sibling: a dealstage transition out of a terminal
// stage ("closedlost"), which is never on an allowed forward path.
// Same real production composition as 69; only the transaction and
// starting deal state differ.
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
      createdBy: "tutorial-70",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-70",
      displayName: "Tutorial 70",
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
      version: "1.0.0",
      schemaVersion: "1.0.0",
    },
    signals: overrides.signals,
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 70 - HubSpot Policy Denial");
console.log("==================================================");
console.log();

try {
  // closedlost is a terminal pipeline stage: no forward transition out
  // of it is ever allowed.
  mockServer.setDeal({
    id: "9002",
    properties: {
      dealstage: "closedlost",
      amount: "5000",
      pipeline: "default",
    },
  });

  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);

  const transaction = dealUpdateTransaction({
    dealId: "9002",
    dealstage: "qualifiedtobuy",
    signals: {
      currentDealStage: "closedlost",
      proposedDealStage: "qualifiedtobuy",
      dealStageChangeRequested: true,
      dealStageTransitionAllowed: false,
      amountChangeRequested: false,
      amountDeltaAbs: 0,
      amountChangeExceedsThreshold: false,
      preAuthorizedForAmountChange: false,
    },
  });

  let outcome: "APPROVED" | "REJECTED" = "APPROVED";
  let reason = "";

  try {
    const trustRecord = await application.execute(transaction);
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

  const deal = mockServer.getDeal("9002");

  console.log("HubSpot Mock Server State");
  console.log("--------------------------------------------------");
  console.log(
    `Deal 9002 dealstage : ${deal?.properties.dealstage} (unchanged)`,
  );
  console.log();

  if (outcome === "REJECTED" && deal?.properties.dealstage === "closedlost") {
    console.log(
      "✓ Deal update denied and the deal is untouched on the mock server -- no forward transition left a terminal stage.",
    );
  } else {
    console.log(
      "✗ Expected a rejected decision with the deal's dealstage unchanged.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 71 - HubSpot Signal-State Verification");
} finally {
  await mockServer.close();
}
