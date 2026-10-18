import crypto from "node:crypto";

import {
  ApprovalVerifier,
  StaticApprovalIssuerRegistry,
} from "@parmana/approval";
import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { BusinessTransaction } from "@parmana/shared";

//
// Tutorial 111 - Connect an Agent to Parmana
//
// Demonstrates the exact contract documented in
// docs/connectors/CONNECTING_AN_AGENT.md, end to end, through the real
// Express app (a real listening HTTP server, not a hand-rolled stand-in)
// and the real customer-refund@1.2.0 policy + paytm:refund capability +
// connector-paytm -- the same pipeline the real parmana-phinite-agent
// integration uses. The Paytm connector is registered for real, pointed
// at a hermetic MockPaytmConnectorServer, so an APPROVED scenario below
// really dispatches, not just authorizes.
//
// Since customer-refund 1.2.0 (G-75) every refund needs a signed manager
// approval for the order and amount. The manager key is made here, in
// memory, and trusted through createApplication's approvalVerifier.
//
process.env.NODE_ENV = "test";

const {
  MockPaytmConnectorServer,
  PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET,
} = await import("@parmana/connector-paytm");

const CONNECTOR_SECRET = PAYTM_CONNECTOR_TEST_MODE_PLACEHOLDER_SECRET;
const mockPaytm = new MockPaytmConnectorServer({
  sharedSecret: CONNECTOR_SECRET,
});
await mockPaytm.listen();

// These must be set before createExecutionSystem/createApp are ever
// imported -- createPaytmConnector.ts and createPaytmCredentialProvider.ts
// read them once, at module construction time.
process.env.PAYTM_CONNECTOR_URL = mockPaytm.baseUrl;
process.env.TEST_PAYTM_CONNECTOR_SHARED_SECRET = CONNECTOR_SECRET;

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");
const { hashApiKey } =
  await import("../../../packages/api/src/auth/hashApiKey.js");
const { StaticKeyAuthenticator } =
  await import("../../../packages/api/src/auth/StaticKeyAuthenticator.js");
const { InMemoryCallerAuditSink } =
  await import("../../../packages/api/src/auth/InMemoryCallerAuditSink.js");

// The exact caller shape docs/connectors/CONNECTING_AN_AGENT.md documents:
// scoped to exactly one capability, no wildcard.
const AGENT_API_KEY = "tutorial-111-refund-agent-key";
const AUTHENTICATOR = new StaticKeyAuthenticator([
  {
    callerId: "parmana-refund-agents",
    keyHash: hashApiKey(AGENT_API_KEY),
    allowedPrincipalIds: ["parmana-refund-agents"],
    allowedCapabilities: ["paytm:refund"],
  },
]);

/**
 * Builds a refund BusinessTransaction exactly matching
 * CONNECTING_AN_AGENT.md's documented request contract. `action` is
 * deliberately a parameter here -- Scenario 2 sends the exact wrong
 * value ("refund") that was the real bug found and fixed in
 * parmana-phinite-agent.
 */
function refundTransaction(overrides: {
  action?: string;
  orderId?: string;
  transactionId?: string;
  amount?: number;
  signals?: Record<string, unknown>;
}): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();
  const orderId = overrides.orderId ?? "ORD-DEMO-001";
  const transactionId = overrides.transactionId ?? "TXN-DEMO-001";
  const amount = overrides.amount ?? 500;

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-111",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "parmana-refund-agents",
      displayName: "Tutorial 111 Refund Agent",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Authorize Paytm customer refund",
      authorizedAt: now,
    },
    intent: {
      intentId,
      authorizationId,
      action: overrides.action ?? "paytm:refund",
      target: orderId,
      parameters: Object.freeze({ orderId, transactionId, amount }),
      createdAt: now,
    },
    policy: {
      name: "customer-refund",
      version: "1.2.0",
      schemaVersion: "1.0.0",
    },
    signals: overrides.signals ?? {
      refundEligible: true,
      managerApproved: false,
      fraudCheckPassed: true,
      refundAmount: amount,
    },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction;
}

console.log();
console.log("==================================================");
console.log("Tutorial 111 - Connect an Agent to Parmana");
console.log("==================================================");
console.log();
console.log("Every scenario below hits a real, listening Express server --");
console.log("the same caller-auth middleware, capability check, and policy");
console.log("engine an external agent (e.g. parmana-phinite-agent) actually");
console.log("goes through. Scenario 1's connector dispatch is also real: it");
console.log("reaches a hermetic mock Paytm connector service, not a stub.");
console.log();

const manager = crypto.generateKeyPairSync("ed25519");
const MANAGER = { approverId: "manager-priya", keyId: "manager-priya-key-1" };

const approvalVerifier = new ApprovalVerifier({
  crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  issuerRegistry: new StaticApprovalIssuerRegistry([
    { ...MANAGER, publicKey: manager.publicKey, revoked: false },
  ]),
  nonceStore: new MemoryNonceStore(),
});

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, approvalVerifier);

// The manager signs an approval for ORD-DEMO-001, up to 500.
const approval = await new ApprovalArtifactSigner().sign(
  {
    ...MANAGER,
    capability: "paytm:refund",
    resourceId: "ORD-DEMO-001",
    scope: { field: "value", comparator: "lte", value: 500 },
    ttlSeconds: 900,
  },
  manager.privateKey,
);
const auditSink = new InMemoryCallerAuditSink();
const app = createApp(application, {
  callerAuth: { authenticator: AUTHENTICATOR, auditSink },
});

const server = app.listen(0);
const address = server.address();
const port = typeof address === "object" && address !== null ? address.port : 0;
const baseUrl = `http://127.0.0.1:${port}`;

try {
  console.log(
    "Scenario 1: Well-formed request, correct capability -- APPROVED and really dispatched",
  );
  console.log("--------------------------------------------------");
  const approved = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_API_KEY}`,
    },
    body: JSON.stringify(
      refundTransaction({
        signals: {
          refundEligible: true,
          managerApproved: true,
          fraudCheckPassed: true,
          refundAmount: 500,
          approvalArtifact: JSON.parse(JSON.stringify(approval)),
        },
      }),
    ),
  });
  const approvedBody = (await approved.json()) as {
    executions?: Array<{ decision?: { outcome?: string; reason?: string } }>;
  };
  const approvedDecision = approvedBody.executions?.at(-1)?.decision;
  console.log(`Status  : ${approved.status}`);
  console.log(`Outcome : ${approvedDecision?.outcome}`);
  console.log(`Reason  : ${approvedDecision?.reason}`);
  console.log(`Connector service calls received : ${mockPaytm.calls.length}`);
  console.log();

  console.log(
    'Scenario 2: Wrong capability ("refund" instead of "paytm:refund") -- the real bug found in parmana-phinite-agent',
  );
  console.log("--------------------------------------------------");
  const wrongCapability = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_API_KEY}`,
    },
    body: JSON.stringify(refundTransaction({ action: "refund" })),
  });
  const wrongCapabilityBody = (await wrongCapability.json()) as {
    code?: string;
    error?: string;
  };
  console.log(`Status : ${wrongCapability.status}`);
  console.log(`Code   : ${wrongCapabilityBody.code}`);
  console.log();

  console.log(
    "Scenario 3: Correct capability, policy denies (no manager approval) -- a real, correct decision, not a bug",
  );
  console.log("--------------------------------------------------");
  const denied = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_API_KEY}`,
    },
    body: JSON.stringify(
      refundTransaction({
        amount: 50_000,
        signals: {
          refundEligible: true,
          managerApproved: false,
          fraudCheckPassed: true,
          refundAmount: 50_000,
        },
      }),
    ),
  });
  const deniedBody = (await denied.json()) as { code?: string; error?: string };
  console.log(`Status : ${denied.status}`);
  console.log(`Code   : ${deniedBody.code}`);
  console.log(`Reason : ${deniedBody.error}`);
  console.log();

  console.log(
    "Scenario 4: Malformed businessTransactionId -- rejected before any auth/policy logic runs",
  );
  console.log("--------------------------------------------------");
  const malformed = {
    ...refundTransaction({}),
    businessTransactionId: "not-a-uuid",
  };
  const badRequest = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${AGENT_API_KEY}`,
    },
    body: JSON.stringify(malformed),
  });
  console.log(`Status : ${badRequest.status}`);
  console.log();

  console.log(
    "Scenario 5: GET /callers/me -- the agent's own resolved identity and scope",
  );
  console.log("--------------------------------------------------");
  const callersMe = await fetch(`${baseUrl}/callers/me`, {
    headers: { Authorization: `Bearer ${AGENT_API_KEY}` },
  });
  const callersMeBody = await callersMe.json();
  console.log(JSON.stringify(callersMeBody, null, 2));
  console.log();

  console.log(
    "Scenario 6: Missing credential -- rejected before anything else runs",
  );
  console.log("--------------------------------------------------");
  const withoutKeyResponse = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(refundTransaction({})),
  });
  console.log(`Status : ${withoutKeyResponse.status}`);
  console.log();

  console.log("==================================================");
  console.log("Summary");
  console.log("==================================================");
  console.log();

  const allPassed =
    approved.status === 200 &&
    approvedDecision?.outcome === "APPROVED" &&
    mockPaytm.calls.length === 1 &&
    wrongCapability.status === 403 &&
    wrongCapabilityBody.code === "CAPABILITY_NOT_ALLOWED" &&
    denied.status === 403 &&
    deniedBody.code === "POLICY_DENIED" &&
    badRequest.status === 400 &&
    callersMe.status === 200 &&
    withoutKeyResponse.status === 401;

  if (allPassed) {
    console.log(
      "✓ Every scenario matched CONNECTING_AN_AGENT.md's documented contract:",
    );
    console.log(
      "  APPROVED really dispatched to the connector service, the exact",
    );
    console.log(
      '  capability-mismatch bug ("refund" vs "paytm:refund") was rejected',
    );
    console.log(
      "  before reaching policy, a real policy denial produced a uniform",
    );
    console.log(
      "  403 POLICY_DENIED, and structural/auth failures were rejected",
    );
    console.log("  before any of that ever ran.");
  } else {
    console.log(
      "✗ Expected every scenario above to match the documented contract.",
    );
    process.exitCode = 1;
  }

  console.log();
  console.log("Tutorial completed successfully.");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await mockPaytm.close();
}
