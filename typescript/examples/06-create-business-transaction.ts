import { pathToFileURL } from "node:url";

import {
  createBusinessTransaction,
  HttpTransport,
  ParmanaClient,
} from "@parmana/sdk";

/**
 * The same POST /execute flow as 02-execute.ts, built with
 * createBusinessTransaction() instead of writing out all five nested
 * objects and keeping three id pairs in sync by hand. Compare this
 * file to 02-execute.ts directly -- the difference is the entire
 * point: every "X must match Y" 400 response documented in
 * docs/site/guides/end-to-end-paytm-flow.mdx came from hand-building a request
 * and getting one of those pairs wrong. This function makes that
 * class of mistake structurally impossible.
 *
 * Targets test:fixture-execute, the same NODE_ENV=test-only capability
 * 02-execute.ts uses, so this example is hermetic and runs against any
 * local server with no external connector configured. To see this
 * reach a real business system (Paytm, staging), swap `action`,
 * `target`, `parameters`, and `policy` for the real paytm:refund shape
 * -- see docs/site/guides/end-to-end-paytm-flow.mdx /
 * docs/site/guides/end-to-end-paytm-flow.mdx for the complete, verified-live
 * version of exactly that, including every real error message you'd
 * hit along the way and why.
 */
export async function runCreateBusinessTransactionExample(
  endpoint = "http://localhost:3000",
  approvalArtifact: unknown = readApprovalArtifact(),
) {
  const client = new ParmanaClient({
    endpoint,
    transport: new HttpTransport({ endpoint }),
  });

  const transaction = createBusinessTransaction({
    principalId: "alice@example.com",
    displayName: "Alice",
    purpose: "Vendor payment approval",
    action: "test:fixture-execute",
    target: "vendor/vendor-123",
    parameters: {
      amount: 100,
      currency: "USD",
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
      // exactly equals `target` above, checked before policy evaluation
      // ever runs (docs/VERIFICATION-GAPS.md G-24).
      vendorId: "vendor/vendor-123",
    },
    sourceSystem: "typescript-sdk-example",
    submittedBy: "demo-user",
  });

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
  const trustRecord = await runCreateBusinessTransactionExample(
    process.env.PARMANA_EXAMPLE_ENDPOINT,
  );

  console.log(JSON.stringify(trustRecord, null, 2));
}
