import { demoApprovalVerifier } from "../../shared/helpers/demo-approval.js";
//
// Found by adversarial testing: malformed JSON and oversized request
// bodies both fell through express.json()'s error into the generic
// 500 branch of the error handler -- indistinguishable from a server
// crash, even though every case still failed closed (nothing ever
// executed). This is a response-clarity fix: a caller sending a typo'd
// request should see a diagnosable 400, not the same 500 a real crash
// would produce.
//
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");

console.log();
console.log("==================================================");
console.log("Tutorial 88 - Malformed Request Handling");
console.log("==================================================");
console.log();

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, demoApprovalVerifier());
const app = createApp(application, { callerAuth: "disabled" });

const server = app.listen(0);
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

try {
  console.log("Scenario 1: Malformed JSON (a truncated/typo'd body)");
  console.log("--------------------------------------------------");
  const malformed = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: '{"businessTransactionId": "not-closed',
  });
  const malformedBody = await malformed.json();
  console.log(`Status : ${malformed.status}`);
  console.log(`Error  : ${malformedBody.error}`);
  console.log();

  console.log(
    "Scenario 2: An oversized request body (over express.json()'s default 100kb limit)",
  );
  console.log("--------------------------------------------------");
  const oversizedPayload = JSON.stringify({
    businessTransactionId: "00000000-0000-4000-8000-000000000000",
    padding: "A".repeat(200 * 1024),
  });
  const oversized = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: oversizedPayload,
  });
  const oversizedBody = await oversized.json();
  console.log(`Payload size : ${Buffer.byteLength(oversizedPayload)} bytes`);
  console.log(`Status       : ${oversized.status}`);
  console.log(`Error        : ${oversizedBody.error}`);
  console.log();

  console.log(
    "Control: a well-formed, reasonably-sized request still reaches the route handler normally",
  );
  console.log("--------------------------------------------------");
  const now = new Date();
  const wellFormedTransaction = {
    businessTransactionId: "00000000-0000-4000-8000-000000000000",
    metadata: {
      businessTransactionId: "00000000-0000-4000-8000-000000000000",
      createdBy: "tutorial-88",
      createdAt: now,
    },
    authority: {
      authorityId: "authority-1",
      authorityType: "SERVICE",
      principalId: "tutorial-88",
      displayName: "Tutorial 88",
      issuedAt: now,
    },
    authorization: {
      authorizationId: "authorization-1",
      authorityId: "authority-1",
      purpose: "Tutorial",
      authorizedAt: now,
    },
    intent: {
      intentId: "intent-1",
      authorizationId: "authorization-1",
      // test:fixture-execute (not payments:execute/vendor-payment, removed
      // per docs/VERIFICATION-GAPS.md G-27) -- see
      // packages/api/tests/fixtures/business-transaction.ts for the same
      // pattern.
      action: "test:fixture-execute",
      target: "vendor://payments",
      parameters: { paymentId: "payment-001", amount: 1000 },
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
  };
  const wellFormed = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(wellFormedTransaction),
  });
  console.log(
    `Status : ${wellFormed.status} (a real, well-formed transaction -- never a body-parsing error)`,
  );
  console.log();

  const allPassed =
    malformed.status === 400 &&
    malformedBody.error === "Malformed JSON body." &&
    oversized.status === 413 &&
    oversizedBody.error === "Payload too large." &&
    wellFormed.status !== 500 &&
    wellFormed.status !== 400 &&
    wellFormed.status !== 413;

  if (allPassed) {
    console.log(
      "✓ Malformed JSON returns a specific 400, an oversized body returns a specific 413 -- neither is the generic 500 a real crash would produce.",
    );
  } else {
    console.log(
      "✗ Expected malformed JSON -> 400, oversized body -> 413, both with named error messages.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 89 - Readiness Probe");
} finally {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
