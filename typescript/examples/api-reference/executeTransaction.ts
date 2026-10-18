import { createBusinessTransaction, ParmanaClient } from "@parmana/sdk";
import { readFileSync } from "node:fs";

const client = new ParmanaClient({
  endpoint: "https://parmana-api-real.vercel.app",
  apiKey: process.env.PARMANA_API_KEY!,
});

const inEffect = await client.policyInEffect("paytm:refund");

// The signed approval the approver sent, for this order and up to this amount.
const approval = JSON.parse(readFileSync("approval.json", "utf8"));

const transaction = createBusinessTransaction({
  principalId: (await client.caller()).callerId,
  purpose: "Refund order ORD-1042",
  action: "paytm:refund",
  target: "ORD-1042",
  parameters: { orderId: "ORD-1042", transactionId: "TXN-9", amount: 750 },
  policy: inEffect.policy,
  signals: {
    refundEligible: true,
    fraudCheckPassed: true,
    refundAmount: 750,
    managerApproved: true,
    approvalArtifact: approval,
  },
});

const record = await client.execute(transaction);

console.log(
  record.businessTransactionId,
  record.executions[0]?.decision.outcome,
);
