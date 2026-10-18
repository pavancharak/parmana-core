import crypto from "node:crypto";

import { FileKeyProvider } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import { ExecutionGateway, type Connector } from "@parmana/execution-gateway";
import { FilePolicyRepository } from "@parmana/policy";
import { RuntimeBuilder } from "@parmana/runtime";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";
import {
  NonceAlreadyConsumedError,
  type ExecutionResult,
  type BusinessTransaction,
} from "@parmana/shared";
import {
  demoApprovalSignalVerifier,
  demoApprovalVerifier,
  withDemoApproval,
} from "../../shared/helpers/demo-approval.js";

//
// docs/CLAIMS.md 2.21: a policy REJECTED decision surfaces as HTTP 403
// with code POLICY_DENIED. An execution request whose authorization has
// already been consumed -- every other Gateway check passed, only nonce
// consumption failed -- surfaces as HTTP 409 with code
// NONCE_ALREADY_CONSUMED. Both are distinguishable from a genuine,
// unexpected server error, which remains plain HTTP 500 with no code at
// all. This tutorial produces all three, side by side.
//
// Scope, precisely (2.21's own caveat): the 409 path is reachable today
// only by a receiving system calling ExecutionGateway.execute() directly
// with an already-consumed authorization -- not through Parmana's own
// POST /execute, where a resubmitted businessTransactionId is rejected
// by DuplicateBusinessTransactionError (2.20) before the Gateway is ever
// reached. So the 403 scenario below goes through a real HTTP server;
// the 409 and 500 scenarios exercise ExecutionGateway directly, exactly
// the "receiving system" role a downstream connector plays.
//

function rejectingTransaction(): BusinessTransaction {
  const businessTransactionId = crypto.randomUUID();
  const authorityId = crypto.randomUUID();
  const authorizationId = crypto.randomUUID();
  const now = new Date();

  return {
    businessTransactionId,
    metadata: { businessTransactionId },
    authority: {
      authorityId,
      authorityType: "SERVICE" as never,
      principalId: "tutorial-102",
      issuedAt: now,
    },
    authorization: {
      authorizationId,
      authorityId,
      purpose: "tutorial",
      issuedAt: now,
    },
    intent: {
      intentId: crypto.randomUUID(),
      authorizationId,
      action: "release-payment",
      target: "vendor",
      parameters: { vendorId: "VENDOR-1001", amount: 25000 },
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
      sufficientFunds: false,
      paymentAmount: 25000,
      riskScore: 12,
      vendorId: "vendor",
    },
    status: "RECEIVED" as never,
    createdAt: now,
  };
}

class RecordingConnector implements Connector {
  async execute(): Promise<ExecutionResult> {
    return {
      businessTransactionId: "tutorial-102",
      action: "release-payment",
      target: "vendor",
      parameters: { amount: 25000 },
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

console.log();
console.log("==================================================");
console.log("Tutorial 102 - Distinguishable HTTP Status");
console.log("==================================================");
console.log();

console.log(
  "Scenario 1: A policy REJECTED decision -- real HTTP server, POST /execute",
);
console.log("--------------------------------------------------");

// Required before bootstrapping: without it, createConnectorRegistry
// tries to reach real backing infrastructure (Supabase, HubSpot) instead
// of falling back to in-memory/test doubles, leaving sockets stuck
// "connecting" forever and the process never exiting.
process.env.NODE_ENV = "test";

const { createExecutionSystem } =
  await import("../../../packages/api/src/bootstrap/createExecutionSystem.js");
const { createApplication } =
  await import("../../../packages/api/src/application.js");
const { createApp } = await import("../../../packages/api/src/app.js");

const executionSystem = await createExecutionSystem();
const application = createApplication(executionSystem, demoApprovalVerifier());
const app = createApp(application, { callerAuth: "disabled" });

const server = await new Promise<import("node:http").Server>((resolve) => {
  const s = app.listen(0, () => resolve(s));
});
const address = server.address();
const baseUrl = `http://127.0.0.1:${typeof address === "object" && address !== null ? address.port : 0}`;

let policyDeniedStatus: number;
let policyDeniedCode: string | undefined;
try {
  const response = await fetch(`${baseUrl}/execute`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rejectingTransaction()),
  });
  const body = await response.json();
  policyDeniedStatus = response.status;
  policyDeniedCode = body.code;
  console.log(`Status : ${policyDeniedStatus}`);
  console.log(`Code   : ${policyDeniedCode}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log();

console.log(
  "Scenario 2: A replayed authorization -- ExecutionGateway.execute() called directly, twice",
);
console.log("--------------------------------------------------");

const runtime = new RuntimeBuilder()
  .withSignalStateVerifier(demoApprovalSignalVerifier())
  .withPolicyRepository(new FilePolicyRepository("policies"))
  .build(new MemoryExecutionTrustRecordRepository());

const approvedTransaction = {
  businessTransactionId: "22222222-2222-4222-8222-222222222299",
  policy: { name: "vendor-payment", version: "2.1.0" },
  intent: {
    action: "release-payment",
    target: "vendor",
    parameters: { vendorId: "VENDOR-1001", amount: 25000 },
  },
  signals: {
    vendorVerified: true,
    invoiceVerified: true,
    paymentApproved: true,
    sufficientFunds: true,
    paymentAmount: 25000,
    riskScore: 12,
    vendorId: "vendor",
  },
};

const { context } = await runtime.execute(
  await withDemoApproval(approvedTransaction as never),
);
if (!context.authorization)
  throw new Error("Execution Authorization was not generated.");

const publicKey = await new FileKeyProvider().getPublicKey(
  context.authorization.keyId,
);

const gateway = new ExecutionGateway({
  // Legacy fixture: predates fail-closed policy binding.
  allowUnverifiedPolicy: true,
  publicKey,
  nonceStore: new MemoryNonceStore(),
  connector: new RecordingConnector(),
});

const gatewayRequest = {
  businessTransactionId: approvedTransaction.businessTransactionId,
  action: approvedTransaction.intent.action,
  target: approvedTransaction.intent.target,
  parameters: approvedTransaction.intent.parameters,
  authorization: context.authorization,
};

await gateway.execute(gatewayRequest);
console.log("First execute() : succeeded.");

let replayStatus: number | undefined;
let replayCode: string | undefined;
try {
  await gateway.execute(gatewayRequest);
  console.log("✗ Expected the second execute() to be rejected.");
} catch (error) {
  replayStatus = (error as { status?: number }).status;
  replayCode = (error as { code?: string }).code;
  console.log(
    `Second execute() -> ${error instanceof NonceAlreadyConsumedError ? "NonceAlreadyConsumedError" : "unexpected error type"}`,
  );
  console.log(`Status : ${replayStatus}`);
  console.log(`Code   : ${replayCode}`);
}
console.log();

console.log(
  "Scenario 3: A genuine unexpected failure -- tampered content, still plain uncoded 500",
);
console.log("--------------------------------------------------");

const tampered = {
  ...gatewayRequest,
  parameters: { ...gatewayRequest.parameters, amount: 999999 },
};

let tamperedIsCoded = true;
try {
  await new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    connector: new RecordingConnector(),
  }).execute(tampered);
  console.log("✗ Expected the tampered request to be rejected.");
} catch (error) {
  tamperedIsCoded = (error as { code?: string }).code !== undefined;
  console.log(
    `Tampered execute() -> ${error instanceof Error ? error.message : String(error)}`,
  );
  console.log(
    `Has a .code (like POLICY_DENIED/NONCE_ALREADY_CONSUMED)? ${tamperedIsCoded}`,
  );
}
console.log();

const allPassed =
  policyDeniedStatus === 403 &&
  policyDeniedCode === "POLICY_DENIED" &&
  replayStatus === 409 &&
  replayCode === "NONCE_ALREADY_CONSUMED" &&
  tamperedIsCoded === false;

if (allPassed) {
  console.log(
    "✓ Policy denial (403/POLICY_DENIED), authorization replay (409/NONCE_ALREADY_CONSUMED), and a genuine content mismatch (plain, uncoded error) are all distinguishable from each other.",
  );
} else {
  console.log(
    "✗ Expected each of the three failure shapes above to be distinguishable as documented.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 103 - Policy Governance (Maker-Checker)");
