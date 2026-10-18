import { pathToFileURL } from "node:url";

import {
  BusinessTransaction,
  HttpTransport,
  ParmanaClient,
} from "@parmana/sdk";

/**
 * Constructs a ParmanaClient, submits a Business Transaction through
 * POST /execute, and returns the resulting Execution Trust Record.
 * Exported (rather than only run as a top-level script) so
 * typescript/test/integration/examples.integration.test.ts can prove
 * this exact example actually works against a real running server,
 * not just that it compiles.
 */
export async function runExecuteExample(
  endpoint = "http://localhost:3000",
  approvalArtifact: unknown = readApprovalArtifact(),
) {
  const client = new ParmanaClient({
    endpoint,

    transport: new HttpTransport({
      endpoint,
    }),
  });

  const businessTransactionId = crypto.randomUUID();

  const transaction: BusinessTransaction = {
    businessTransactionId,

    metadata: {
      businessTransactionId,

      correlationId: "corr-001",

      sourceSystem: "typescript-sdk-example",

      submittedBy: "demo-user",

      submittedAt: new Date(),
    },

    authority: {
      authorityId: "authority-001",

      authorityType: "USER",

      principalId: "alice@example.com",

      displayName: "Alice",

      issuedAt: new Date(),
    },

    authorization: {
      authorizationId: "authorization-001",

      authorityId: "authority-001",

      purpose: "Vendor payment approval",

      issuedAt: new Date(),
    },

    intent: {
      intentId: "intent-001",

      authorizationId: "authorization-001",

      // test:fixture-execute, not TransferFunds/payments:execute: the
      // capability this example originally targeted was never
      // registered by any connector in this repository (a NODE_ENV=test
      // -only generic fixture connector plays that zero-external
      // -dependency role instead, see
      // createTestFixtureConnector.ts and docs/VERIFICATION-GAPS.md
      // G-27) -- so this example, never covered by any test or build
      // (excluded from typescript/tsconfig.json's own include list),
      // had never actually been run against a real server before this
      // pass proved it.
      action: "test:fixture-execute",

      target: "vendor/vendor-123",

      parameters: {
        amount: 100,
        currency: "USD",
      },

      createdAt: new Date(),
    },

    policy: {
      name: "vendor-payment",

      version: "2.1.0",

      schemaVersion: "1.0.0",
    },

    signals: {
      // No agent action is authorized without a signed human approval.
      // A trusted approver signs one for this target and amount (for
      // example through the approval email), and the agent attaches it
      // here. Without it, POST /execute refuses the transaction.
      humanApproved: true,
      approvalArtifact: approvalArtifact as never,
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: 100,
      riskScore: 5,
      // vendor-payment@2.1.0 declares boundSignals: vendorId -> target;
      // SignalIntentBinder rejects this transaction unless this signal
      // exactly equals intent.target, checked before policy evaluation
      // ever runs (docs/VERIFICATION-GAPS.md G-24).
      vendorId: "vendor/vendor-123",
    },

    status: "RECEIVED",

    createdAt: new Date(),
  };

  return client.execute(transaction);
}

/**
 * The signed approval, as JSON, from PARMANA_APPROVAL_ARTIFACT when run
 * as a script.
 */
function readApprovalArtifact(): unknown {
  const raw = process.env.PARMANA_APPROVAL_ARTIFACT;

  return raw === undefined ? undefined : JSON.parse(raw);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const trustRecord = await runExecuteExample(
    process.env.PARMANA_EXAMPLE_ENDPOINT,
  );

  console.log(JSON.stringify(trustRecord, null, 2));
}
