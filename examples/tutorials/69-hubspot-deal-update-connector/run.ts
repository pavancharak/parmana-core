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
// The HubSpot sibling of Tutorial 63: approve + execute a real deal
// update through the same production composition
// (createExecutionSystem + createApplication), pointed at a hermetic
// MockHubSpotServer via the HUBSPOT_BASE_URL test seam instead of
// HubSpot's live API.
//
process.env.NODE_ENV = "test";

const TOKEN = HUBSPOT_TEST_MODE_PLACEHOLDER_TOKEN;

const mockServer = new MockHubSpotServer({ token: TOKEN });
await mockServer.listen();

process.env.HUBSPOT_BASE_URL = mockServer.baseUrl;
// .env sets TEST_HUBSPOT_PRIVATE_APP_TOKEN to an empty string (a
// documented placeholder for the live-credential test suite), not
// leaves it unset -- createHubSpotCredentialProvider.ts's `?? HUBSPOT_
// TEST_MODE_PLACEHOLDER_TOKEN` fallback only triggers on undefined, not
// "". Without this override the connector would authenticate with an
// empty-string token and this mock server -- constructed with the real
// placeholder -- would reject every request. The now-removed Razorpay
// connector had the identical gotcha for its own test token.
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
      createdBy: "tutorial-69",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-69",
      displayName: "Tutorial 69",
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
console.log("Tutorial 69 - HubSpot Deal Update Connector");
console.log("==================================================");
console.log();

try {
  mockServer.setDeal({
    id: "9001",
    properties: {
      dealstage: "appointmentscheduled",
      amount: "5000",
      pipeline: "default",
    },
  });

  const executionSystem = await createExecutionSystem();
  const application = createApplication(
    executionSystem,
    demoApprovalVerifier(),
  );

  const transaction = dealUpdateTransaction({
    dealId: "9001",
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

  const trustRecord = await application.execute(
    await withDemoApproval(transaction),
  );
  const decision = trustRecord.executions.at(-1)?.decision;

  console.log("Decision");
  console.log("--------------------------------------------------");
  console.log(`Outcome : ${decision?.outcome}`);
  console.log(`Reason  : ${decision?.reason}`);
  console.log();

  // The strongest proof this went through the real connector end to
  // end: the deal actually moved on the (mock) HubSpot server.
  const deal = mockServer.getDeal("9001");

  console.log("HubSpot Mock Server State");
  console.log("--------------------------------------------------");
  console.log(`Deal 9001 dealstage : ${deal?.properties.dealstage}`);
  console.log();

  if (
    decision?.outcome === "APPROVED" &&
    deal?.properties.dealstage === "qualifiedtobuy"
  ) {
    console.log(
      "✓ Deal update authorized and executed against the real connector.",
    );
  } else {
    console.log(
      "✗ Expected an approved decision with the deal moved to qualifiedtobuy.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 70 - HubSpot Policy Denial");
} finally {
  await mockServer.close();
}
