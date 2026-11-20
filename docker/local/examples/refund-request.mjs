// Prints a complete POST /execute request body for an `erp:invoice-pay` under
// the shipped `payment-refund` policy, with fresh UUIDs, for trying the self
// hosted deployment. Runs inside the API image, so the host needs only
// Docker:
//
//   docker compose run --rm --no-deps --entrypoint node setup \
//     /app/docker/local/examples/refund-request.mjs \
//     --amount 500 > refund.json
//
// Options:
//   --amount <number>                 refund amount (required)
//   --order-id <id>                   the order (default: a new one). A
//                                     manager approval is for one order, so
//                                     pass the order the approval names.
//   --approval-file <path>            a signed manager approval, the JSON
//                                     printed by scripts/sign-approval.ts.
//                                     Sets managerApproved to true and sends
//                                     the approval in signals.approvalArtifact.
//   --manager-approved true|false     the managerApproved signal without an
//                                     approval (default false). true without
//                                     --approval-file is refused, which is
//                                     useful to see.
//   --principal-id <id>               who the request acts for (default
//                                     local-operator). An API key may only
//                                     act for its own caller ID unless it
//                                     lists other principal IDs.
//
// With the shipped payment-refund 1.0.0 policy, a refund needs two things:
// the payment source confirms the payment is refundable (a signal this
// script does not send; Parmana asks the source itself), and a signed
// manager approval covering this exact amount (G-75). The script sends only
// managerApproved and refundAmount, so the policy cannot approve from the
// caller's claims alone.

import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
  console.error(`[refund-request] ${message}`);
  process.exit(1);
}

const amount = Number(option("--amount"));
if (!Number.isFinite(amount) || amount <= 0) {
  fail("--amount must be a positive number.");
}

const managerApprovedOption = option("--manager-approved") ?? "false";
if (managerApprovedOption !== "true" && managerApprovedOption !== "false") {
  fail("--manager-approved must be true or false.");
}

const approvalFile = option("--approval-file");
let approvalArtifact;
if (approvalFile !== undefined) {
  try {
    approvalArtifact = JSON.parse(readFileSync(approvalFile, "utf8"));
  } catch (error) {
    fail(`--approval-file could not be read as JSON: ${error.message}`);
  }
}

const principalId = option("--principal-id") ?? "local-operator";

const businessTransactionId = randomUUID();
const authorityId = randomUUID();
const authorizationId = randomUUID();
const orderId =
  option("--order-id") ?? `order-${businessTransactionId.slice(0, 8)}`;
const now = new Date().toISOString();

const request = {
  businessTransactionId,
  metadata: {
    businessTransactionId,
    correlationId: randomUUID(),
    createdBy: principalId,
    createdAt: now,
  },
  authority: {
    authorityId,
    authorityType: "USER",
    principalId,
    displayName: principalId,
    issuedAt: now,
  },
  authorization: {
    authorizationId,
    authorityId,
    purpose: "Customer refund",
    authorizedAt: now,
  },
  intent: {
    intentId: randomUUID(),
    authorizationId,
    action: "erp:invoice-pay",
    target: `erp://invoices/${orderId}`,
    parameters: { orderId, transactionId: `txn-${orderId}`, amount },
    createdAt: now,
  },
  policy: { name: "payment-refund", version: "1.0.0", schemaVersion: "1.0.0" },
  signals: {
    managerApproved:
      approvalArtifact !== undefined || managerApprovedOption === "true",
    refundAmount: amount,
    ...(approvalArtifact !== undefined ? { approvalArtifact } : {}),
  },
};

console.log(JSON.stringify(request, null, 2));
