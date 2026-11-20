/**
 * Governed quickstart, limits. Shows how Parmana enforces a transaction limit
 * with the public @parmana/sdk, against the server from ../start-server.sh after
 * setup.mjs and typescript/governed-flow.ts (which approves vendor-payment@2.1.0).
 *
 * Set GOVERNED_POLICY_VERSION to the policy version in effect (default 2.1.0; see declare-then-execute.ts).
 *
 * Each case is a transaction that should be refused. The script prints the SDK
 * error class, the HTTP status and the server's code or message for each.
 *
 *   npx tsx docs/developer-portal/examples/governed-quickstart/typescript/limits.ts
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  ParmanaClient,
  ParmanaError,
  createBusinessTransaction,
  signApproval,
} from "@parmana/sdk";

const configDir =
  process.env.GOVERNED_CONFIG_DIR ??
  join(homedir(), ".parmana", "governed-quickstart");
const endpoint = process.env.PARMANA_ENDPOINT ?? "http://localhost:3000";
const rawKeys = JSON.parse(
  readFileSync(join(configDir, "raw-keys.json"), "utf8"),
) as { demo: string };
const approverPrivatePem = readFileSync(
  join(configDir, "local-test-approver__local-test-approver-key-1.private.pem"),
  "utf8",
);
const POLICY_VERSION = process.env.GOVERNED_POLICY_VERSION ?? "2.1.0";
const demo = new ParmanaClient({ endpoint, apiKey: rawKeys.demo });

type Case = {
  name: string;
  amount: number;
  approvedUpTo: number;
  riskScore: number;
  paymentAmount?: number;
};

const cases: Case[] = [
  // The approval covers 1000, but the transaction asks for 5000.
  {
    name: "amount above the human approval",
    amount: 5000,
    approvedUpTo: 1000,
    riskScore: 5,
  },
  // The policy rejects a risk score above 20, whatever the approval says.
  {
    name: "risk score above the policy limit",
    amount: 1000,
    approvedUpTo: 1000,
    riskScore: 25,
  },
  // The bound signal paymentAmount must equal parameters.amount.
  {
    name: "bound paymentAmount differs from amount",
    amount: 1000,
    approvedUpTo: 1000,
    riskScore: 5,
    paymentAmount: 999,
  },
];

async function run(c: Case): Promise<void> {
  const approval = signApproval({
    privateKeyPem: approverPrivatePem,
    approverId: "local-test-approver",
    keyId: "local-test-approver-key-1",
    capability: "test:fixture-execute",
    resourceId: "vendor://payments",
    maxAmount: c.approvedUpTo,
  });
  const transaction = createBusinessTransaction({
    principalId: "demo",
    purpose: `Limit case: ${c.name}`,
    action: "test:fixture-execute",
    target: "vendor://payments",
    parameters: { amount: c.amount, currency: "USD" },
    policy: {
      name: "vendor-payment",
      version: POLICY_VERSION,
      schemaVersion: "1.0.0",
    },
    signals: {
      humanApproved: true,
      approvalArtifact: approval,
      vendorVerified: true,
      invoiceVerified: true,
      paymentApproved: true,
      sufficientFunds: true,
      paymentAmount: c.paymentAmount ?? c.amount,
      riskScore: c.riskScore,
      vendorId: "vendor://payments",
    },
  });
  try {
    const record = await demo.execute(transaction);
    console.log(`UNEXPECTED: ${c.name} was approved (${record.trustRecordId})`);
    process.exitCode = 1;
  } catch (error) {
    if (error instanceof ParmanaError) {
      const e = error as ParmanaError & {
        statusCode?: number;
        serverCode?: string;
      };
      console.log(`refused: ${c.name}`);
      console.log(
        `   ${error.constructor.name} HTTP ${e.statusCode ?? "?"}${e.serverCode ? ` code=${e.serverCode}` : ""}`,
      );
      console.log(`   ${error.message}`);
    } else {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  for (const c of cases) await run(c);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
