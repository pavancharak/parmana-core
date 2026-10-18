import crypto from "node:crypto";

import type { BusinessTransaction } from "@parmana/shared";

//
// docs/CLAIMS.md 2.19: a caller-authentication event (accepted or
// rejected) that fails to be recorded fails the request. middleware/
// caller-auth.ts wraps every CallerAuditSink.record() call via
// recordCallerAuditEvent -- on success the request proceeds exactly as
// before; on failure the request is rejected with AuditUnavailableError
// (503, code AUDIT_UNAVAILABLE), never proceeding unaudited. This
// tutorial wires in an audit sink that always throws, and shows both
// the rejected-credential path and the successful-credential path each
// independently fail closed the same way.
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

const CALLER_KEY = "tutorial-101-caller-key";

class FailingCallerAuditSink {
  public attempts = 0;

  async record(): Promise<void> {
    this.attempts += 1;
    throw new Error("simulated audit-storage outage");
  }
}

function vendorPaymentTransaction(): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: {
      businessTransactionId,
      correlationId: crypto.randomUUID(),
      createdBy: "tutorial-101",
      createdAt: now,
    },
    authority: {
      authorityId,
      authorityType: "SERVICE",
      principalId: "tutorial-101",
      displayName: "Tutorial 101",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId: crypto.randomUUID(),
      authorizationId,
      action: "test:fixture-execute",
      target: "vendor://payments",
      parameters: Object.freeze({ paymentId: "payment-001", amount: 1000 }),
      createdAt: now,
    },
    policy: {
      name: "vendor-payment",
      version: "2.0.0",
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
  } as unknown as BusinessTransaction;
}

async function startServer(auditSink: FailingCallerAuditSink) {
  const executionSystem = await createExecutionSystem();
  const application = createApplication(executionSystem);
  const authenticator = new StaticKeyAuthenticator([
    {
      callerId: "caller-101",
      keyHash: hashApiKey(CALLER_KEY),
      allowedPrincipalIds: ["tutorial-101"],
      allowedCapabilities: ["test:fixture-execute"],
    },
  ]);
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
console.log("Tutorial 101 - Fail-Closed Caller-Authentication Audit Writes");
console.log("==================================================");
console.log();

const auditSink = new FailingCallerAuditSink();
const { baseUrl, close } = await startServer(auditSink);

try {
  console.log(
    "Scenario 1: A missing credential -- audit write fails, request fails closed at 503, not 401",
  );
  console.log("--------------------------------------------------");
  const missing = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(vendorPaymentTransaction()),
  });
  const missingBody = await missing.json();
  console.log(`Status : ${missing.status}`);
  console.log(`Code   : ${missingBody.code}`);
  console.log();

  console.log(
    "Scenario 2: A valid credential -- audit write ALSO fails, so even a well-authenticated request fails closed at 503, not 200",
  );
  console.log("--------------------------------------------------");
  const valid = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CALLER_KEY}`,
    },
    body: JSON.stringify(vendorPaymentTransaction()),
  });
  const validBody = await valid.json();
  console.log(`Status : ${valid.status}`);
  console.log(`Code   : ${validBody.code}`);
  console.log();

  console.log(
    `Audit sink was called ${auditSink.attempts} times (once per request), no retry attempted either time.`,
  );
  console.log();

  const allPassed =
    missing.status === 503 &&
    missingBody.code === "AUDIT_UNAVAILABLE" &&
    valid.status === 503 &&
    validBody.code === "AUDIT_UNAVAILABLE" &&
    auditSink.attempts === 2;

  if (allPassed) {
    console.log(
      "✓ Both the rejected and the accepted caller-authentication outcome fail the request when the audit write itself fails -- an action never executes without an audit record, and there is no retry to mask it.",
    );
  } else {
    console.log(
      "✗ Expected every audit-write failure to surface as 503 AUDIT_UNAVAILABLE, on both the reject and accept paths.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log(
    "Next: Tutorial 102 - Distinguishable HTTP Status for Policy Denial and Replay",
  );
} finally {
  await close();
}
