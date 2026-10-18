import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  MockSlackServer,
  SLACK_TEST_MODE_PLACEHOLDER_TOKEN,
} from "@parmana/connector-slack";
import {
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Tutorial 112 - Slack Connector
//
// A brand-new connector (slack:post-message), built from scratch
// following docs/connectors/BUILDING_A_CONNECTOR.md's exact pattern:
// same production composition (createExecutionSystem + createApplication)
// as HubSpot's own tutorials (69/70), pointed at a hermetic
// MockSlackServer instead of Slack's live API. This is a REAL
// implementation, not a stub -- it makes a real HTTP call with a real
// deny-by-default parameter allowlist, and correctly treats Slack's own
// documented quirk (every response is HTTP 200; failure is signaled
// only by the JSON body's `ok: false`) rather than trusting the HTTP
// status alone.
//
process.env.NODE_ENV = "test";

const TOKEN = SLACK_TEST_MODE_PLACEHOLDER_TOKEN;

const mockSlack = new MockSlackServer({ botToken: TOKEN });
await mockSlack.listen();

// These must be set before createExecutionSystem is ever imported --
// createSlackConnector.ts and createSlackCredentialProvider.ts read
// them once, at module construction time.
process.env.SLACK_BASE_URL = mockSlack.baseUrl;
process.env.TEST_SLACK_BOT_TOKEN = TOKEN;

// G-76: the server posts only to channels on its own allowlist. The
// caller's channelAuthorized is not trusted.
process.env.SLACK_ALLOWED_CHANNEL_IDS = "C0123456789";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");

function postMessageTransaction(overrides: {
  channel: string;
  text?: string;
  signals: Record<string, unknown>;
}): Promise<BusinessTransaction> {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  // A person approved posting to this channel (a demo approver, see
  // examples/shared/helpers/demo-approval.ts). No agent action runs
  // without a signed human approval.
  return withDemoApproval({
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-112",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-112",
      displayName: "Tutorial 112",
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
      action: "slack:post-message",
      target: overrides.channel,
      parameters: Object.freeze({
        channel: overrides.channel,
        text: overrides.text ?? "Deployment succeeded.",
      }),
      createdAt: now,
    },
    policy: {
      name: "slack-post-message",
      version: "1.1.0",
      schemaVersion: "1.0.0",
    },
    signals: overrides.signals,
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction);
}

console.log();
console.log("==================================================");
console.log("Tutorial 112 - Slack Connector");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, demoApprovalVerifier());

try {
  console.log(
    "Scenario 1: Content approved and channel authorized -- APPROVED and really posted",
  );
  console.log("--------------------------------------------------");

  const approvedTransaction = await postMessageTransaction({
    channel: "C0123456789",
    text: "Deployment succeeded.",
    signals: {
      contentApproved: true,
      channelAuthorized: true,
      channelId: "C0123456789",
    },
  });

  let approvedOutcome: "APPROVED" | "REJECTED" = "REJECTED";
  let approvedReason = "";
  try {
    const trustRecord = await application.execute(approvedTransaction);
    const decision = trustRecord.executions.at(-1)?.decision;
    approvedOutcome =
      (decision?.outcome as "APPROVED" | "REJECTED") ?? "REJECTED";
    approvedReason = decision?.reason ?? "";
  } catch (error) {
    approvedReason = error instanceof Error ? error.message : String(error);
  }

  console.log(`Outcome : ${approvedOutcome}`);
  console.log(`Reason  : ${approvedReason}`);
  console.log(`Slack mock server received : ${mockSlack.calls.length} call(s)`);
  console.log(`  channel : ${mockSlack.calls[0]?.channel}`);
  console.log(`  text    : ${mockSlack.calls[0]?.text}`);
  console.log();

  console.log(
    "Scenario 2: Content not approved -- REJECTED, and Slack is never called",
  );
  console.log("--------------------------------------------------");

  const deniedTransaction = await postMessageTransaction({
    channel: "C0123456789",
    signals: {
      contentApproved: false,
      channelAuthorized: true,
      channelId: "C0123456789",
    },
  });

  let deniedOutcome: "APPROVED" | "REJECTED" = "APPROVED";
  let deniedReason = "";
  try {
    const trustRecord = await application.execute(deniedTransaction);
    const decision = trustRecord.executions.at(-1)?.decision;
    deniedOutcome =
      (decision?.outcome as "APPROVED" | "REJECTED") ?? "REJECTED";
    deniedReason = decision?.reason ?? "";
  } catch (error) {
    deniedOutcome = "REJECTED";
    deniedReason = error instanceof Error ? error.message : String(error);
  }

  console.log(`Outcome : ${deniedOutcome}`);
  console.log(`Reason  : ${deniedReason}`);
  console.log(
    `Slack mock server total calls (unchanged from Scenario 1) : ${mockSlack.calls.length}`,
  );
  console.log();

  console.log(
    "Scenario 3: channelId signal does not match intent.target -- rejected before policy even runs",
  );
  console.log("--------------------------------------------------");

  const mismatchedTransaction = await postMessageTransaction({
    channel: "C0123456789",
    signals: {
      contentApproved: true,
      channelAuthorized: true,
      channelId: "C_DIFFERENT_CHANNEL",
    },
  });

  let mismatchReason = "";
  try {
    await application.execute(mismatchedTransaction);
  } catch (error) {
    mismatchReason = error instanceof Error ? error.message : String(error);
  }

  console.log(`Rejected : ${mismatchReason}`);
  console.log(
    `Slack mock server total calls (unchanged) : ${mockSlack.calls.length}`,
  );
  console.log();

  console.log(
    "Scenario 4: agent declares channelAuthorized for a channel not on the server's allowlist -- REJECTED (G-76)",
  );
  console.log("--------------------------------------------------");

  let notAllowedReason = "";
  try {
    await application.execute(
      await postMessageTransaction({
        channel: "C_NOT_ON_ALLOWLIST",
        text: "Here is the customer list...",
        signals: {
          contentApproved: true,
          channelAuthorized: true,
          channelId: "C_NOT_ON_ALLOWLIST",
        },
      }),
    );
  } catch (error) {
    notAllowedReason = error instanceof Error ? error.message : String(error);
  }

  console.log(`Rejected : ${notAllowedReason}`);
  console.log(
    `Slack mock server total calls (unchanged) : ${mockSlack.calls.length}`,
  );
  console.log();

  console.log("==================================================");
  console.log("Summary");
  console.log("==================================================");
  console.log();

  const allPassed =
    approvedOutcome === "APPROVED" &&
    mockSlack.calls.length === 1 &&
    mockSlack.calls[0]?.channel === "C0123456789" &&
    deniedOutcome === "REJECTED" &&
    mismatchReason.length > 0 &&
    notAllowedReason.includes("channelAuthorized");

  if (allPassed) {
    console.log(
      "✓ The new Slack connector authorized and really posted a message when approved,",
    );
    console.log(
      "  was rejected by policy without ever calling Slack when content wasn't approved,",
    );
    console.log(
      "  and SignalIntentBinder caught a channelId/target mismatch before policy evaluation",
    );
    console.log(
      "  even ran -- the same protections HubSpot/Paytm's own connectors get for free.",
    );
    console.log(
      "  A channel off the server's allowlist was refused whatever the agent declared.",
    );
  } else {
    console.log(
      "✗ Expected every scenario above to match the documented connector contract.",
    );
    process.exitCode = 1;
  }

  console.log();
  console.log("Tutorial completed successfully.");
} finally {
  await mockSlack.close();
}
