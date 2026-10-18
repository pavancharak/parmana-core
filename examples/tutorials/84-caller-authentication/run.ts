import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";
import {
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// Caller authentication is the layer in front of nearly every route,
// entirely separate from policy evaluation and gateway attestation
// (both of which run later, only once a caller has already been
// authenticated). This tutorial exercises the real Express middleware
// through a real listening HTTP server -- not a hand-rolled stand-in
// -- proving valid/missing/invalid credentials, per-caller scoping,
// key rotation/revocation, and that the raw key never appears in the
// audit trail.
//
process.env.NODE_ENV = "test";

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

const CALLER_A_KEY = "tutorial-84-caller-a-key";
const CALLER_B_KEY = "tutorial-84-caller-b-key";
const CALLER_C_KEY = "tutorial-84-caller-c-key";
const CALLER_D_KEY = "tutorial-84-caller-d-key";

async function vendorPaymentTransaction(): Promise<BusinessTransaction> {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const intentId = crypto.randomUUID();
  const now = new Date();

  // A person approved this payment (a demo approver).
  return withDemoApproval({
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-84",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-84",
      displayName: "Tutorial 84",
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
      // test:fixture-execute (not payments:execute/vendor-payment, removed
      // per docs/VERIFICATION-GAPS.md G-27) -- see
      // packages/api/tests/fixtures/business-transaction.ts for the same
      // pattern.
      action: "test:fixture-execute",
      target: "vendor://payments",
      parameters: Object.freeze({ paymentId: "payment-001", amount: 1000 }),
      createdAt: now,
    },
    policy: {
      name: "vendor-payment",
      version: "2.1.0",
      schemaVersion: "1.0.0",
    },
    signals: {
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 1000,
      riskScore: 10,
      vendorId: "vendor://payments",
    },
    status: "RECEIVED",
    createdAt: now,
  } as unknown as BusinessTransaction);
}

async function startServer(
  authenticator: InstanceType<typeof StaticKeyAuthenticator>,
  auditSink: InstanceType<typeof InMemoryCallerAuditSink>,
) {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(
    executionSystem,
    demoApprovalVerifier(),
  );
  const app = createApp(application, {
    callerAuth: { authenticator, auditSink },
  });

  return new Promise<{ baseUrl: string; close: () => Promise<void> }>(
    (resolve) => {
      const server = app.listen(0, () => {
        const address = server.address();
        const port =
          typeof address === "object" && address !== null ? address.port : 0;
        resolve({
          baseUrl: `http://127.0.0.1:${port}`,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    },
  );
}

console.log();
console.log("==================================================");
console.log("Tutorial 84 - Caller Authentication");
console.log("==================================================");
console.log();

const auditSink = new InMemoryCallerAuditSink();
const authenticator = new StaticKeyAuthenticator([
  {
    callerId: "caller-a",
    keyHash: hashApiKey(CALLER_A_KEY),
    allowedPrincipalIds: ["tutorial-84"],
    allowedCapabilities: ["test:fixture-execute"],
  },
  {
    callerId: "caller-b",
    keyHash: hashApiKey(CALLER_B_KEY),
    allowedPrincipalIds: ["tutorial-84"],
    allowedCapabilities: ["test:fixture-execute"],
  },
  // Allowed to assert the "tutorial-84" principal, but not to invoke
  // test:fixture-execute -- passes the principal check, fails the
  // capability check that runs right after it (Scenario 6).
  {
    callerId: "caller-c",
    keyHash: hashApiKey(CALLER_C_KEY),
    allowedPrincipalIds: ["tutorial-84"],
    allowedCapabilities: ["some-other-capability"],
  },
  // Allowed to invoke test:fixture-execute, but not to assert the
  // "tutorial-84" principal -- fails the principal check, which runs
  // before the capability check, so it never even reaches it (Scenario 7).
  {
    callerId: "caller-d",
    keyHash: hashApiKey(CALLER_D_KEY),
    allowedPrincipalIds: ["some-other-principal"],
    allowedCapabilities: ["test:fixture-execute"],
  },
]);

const { baseUrl, close } = await startServer(authenticator, auditSink);

try {
  console.log("Scenario 1: A valid credential reaches the route handler");
  console.log("--------------------------------------------------");
  const valid = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CALLER_A_KEY}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Status : ${valid.status}`);
  console.log();

  console.log(
    "Scenario 2: A missing credential is rejected before anything else runs",
  );
  console.log("--------------------------------------------------");
  const missing = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Status : ${missing.status}`);
  console.log();

  console.log("Scenario 3: An invalid credential is rejected");
  console.log("--------------------------------------------------");
  const invalid = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-a-real-key",
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Status : ${invalid.status}`);
  console.log();

  console.log(
    "Scenario 4: GET /health requires no credential; GET /policies does",
  );
  console.log("--------------------------------------------------");
  const health = await fetch(`${baseUrl}/health`);
  const policies = await fetch(`${baseUrl}/policies`);
  console.log(`GET /health   -> ${health.status}`);
  console.log(`GET /policies -> ${policies.status}`);
  console.log();

  console.log(
    "Scenario 5: Key rotation -- old key works during rotation, is rejected after revocation",
  );
  console.log("--------------------------------------------------");
  const oldKey = "tutorial-84-orchestrator-old-key";
  const newKey = "tutorial-84-orchestrator-new-key";

  const duringRotation = new StaticKeyAuthenticator([
    {
      callerId: "orchestrator-1",
      keyHash: hashApiKey(oldKey),
      allowedPrincipalIds: ["tutorial-84"],
      allowedCapabilities: ["test:fixture-execute"],
    },
    {
      callerId: "orchestrator-1",
      keyHash: hashApiKey(newKey),
      allowedPrincipalIds: ["tutorial-84"],
      allowedCapabilities: ["test:fixture-execute"],
    },
  ]);
  const rotationServer = await startServer(
    duringRotation,
    new InMemoryCallerAuditSink(),
  );
  const stillWorks = await fetch(`${rotationServer.baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${oldKey}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Old key during rotation -> ${stillWorks.status}`);
  await rotationServer.close();

  const afterRevocation = new StaticKeyAuthenticator([
    {
      callerId: "orchestrator-1",
      keyHash: hashApiKey(newKey),
      allowedPrincipalIds: ["tutorial-84"],
      allowedCapabilities: ["test:fixture-execute"],
    },
  ]);
  const revokedServer = await startServer(
    afterRevocation,
    new InMemoryCallerAuditSink(),
  );
  const revokedRejected = await fetch(`${revokedServer.baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${oldKey}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  const newKeyWorks = await fetch(`${revokedServer.baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${newKey}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Old key after revocation -> ${revokedRejected.status}`);
  console.log(`New key after rotation   -> ${newKeyWorks.status}`);
  await revokedServer.close();
  console.log();

  console.log(
    "Scenario 6: A caller allowed to assert this principal but not invoke this capability triggers caller.capability_denied",
  );
  console.log("--------------------------------------------------");
  const capabilityDenied = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CALLER_C_KEY}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Status : ${capabilityDenied.status}`);
  console.log();

  console.log(
    "Scenario 7: A caller allowed to invoke this capability but not assert this principal triggers caller.principal_denied",
  );
  console.log("--------------------------------------------------");
  const principalDenied = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CALLER_D_KEY}`,
    },
    body: JSON.stringify(await vendorPaymentTransaction()),
  });
  console.log(`Status : ${principalDenied.status}`);
  console.log();

  console.log("Audit trail: identity recorded, raw keys never appear");
  console.log("--------------------------------------------------");
  console.log(`Events recorded : ${auditSink.events.length}`);
  for (const event of auditSink.events) {
    console.log(
      `  ${event.type} on ${event.route} -- callerId=${event.callerId ?? "(none)"} reason=${event.reason ?? "(n/a)"}`,
    );
  }
  const serialized = JSON.stringify(auditSink.events);
  const rawKeyLeaked =
    serialized.includes(CALLER_A_KEY) ||
    serialized.includes(CALLER_B_KEY) ||
    serialized.includes(CALLER_C_KEY) ||
    serialized.includes(CALLER_D_KEY);
  console.log(`Raw key ever appears in audit trail : ${rawKeyLeaked}`);
  console.log();

  const capabilityDeniedAudited = auditSink.events.some(
    (event) => event.type === "caller.capability_denied",
  );
  const principalDeniedAudited = auditSink.events.some(
    (event) => event.type === "caller.principal_denied",
  );

  const allPassed =
    valid.status === 200 &&
    missing.status === 401 &&
    invalid.status === 401 &&
    health.status === 200 &&
    policies.status === 401 &&
    stillWorks.status === 200 &&
    revokedRejected.status === 401 &&
    newKeyWorks.status === 200 &&
    capabilityDenied.status === 403 &&
    principalDenied.status === 403 &&
    capabilityDeniedAudited &&
    principalDeniedAudited &&
    rawKeyLeaked === false;

  if (allPassed) {
    console.log(
      "✓ Authentication gates every route but /health as expected, key rotation works, capability/principal scoping is enforced and audited, and the raw key never appears in the audit trail.",
    );
  } else {
    console.log(
      "✗ Expected every scenario above to match caller-auth's real, documented behavior.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 86 - Gateway Attestation");
} finally {
  await close();
}
