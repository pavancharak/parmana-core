/**
 * The agent's side of the Razorpay refund demo. Sends one refund request
 * for razorpay:refund and says whether the answer is what the rules
 * require for that case:
 *
 *   --case approved     a fresh manager approval for this payment and
 *                       amount, within the grant: APPROVED, refunded once
 *                       in Razorpay test mode, the record verifies offline
 *   --case no-approval  no signed approval: refused by the policy
 *   --case over-limit   a valid approval, but the amount is above the
 *                       agent's grant: refused, NOT_AUTHORIZED. A manager's
 *                       signature cannot lift the agent's limit.
 *   --case replay       the approval saved by the approved case, sent
 *                       again with a new request: refused, used once
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the agent's key, read hidden>
 *   npx tsx examples/razorpay-refund/send.ts --case approved --payment pay_XXXX --amount 100 `
 *     --approver-key-file <approver>.private.pem --approver-id <id> --approver-key-id <key id> `
 *     --save-approval approval.json --out record-approved.json
 *
 * Amounts are in paise: 100 is ₹1. It never prints a key. It needs the
 * SDK from this repository: run `npm run build` first.
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  createBusinessTransaction,
  ExecutionRejectedError,
  ParmanaClient,
  signApproval,
  verifyExecutionTrustRecordOffline,
} from "@parmana/sdk";

const CAPABILITY = "razorpay:refund";

type Case = "approved" | "no-approval" | "over-limit" | "replay";

const EXPECTED: Record<Case, "APPROVED" | "REFUSED"> = {
  approved: "APPROVED",
  "no-approval": "REFUSED",
  "over-limit": "REFUSED",
  replay: "REFUSED",
};

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value === undefined || value.startsWith("--") ? undefined : value;
}

function required(name: string): string {
  const value = option(name);

  if (value === undefined) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function env(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Set ${name}.`);
  }

  return value;
}

function approvalFor(which: Case, payment: string, amount: number): unknown {
  if (which === "no-approval") {
    return undefined;
  }

  if (which === "replay") {
    return JSON.parse(readFileSync(required("--approval-file"), "utf8"));
  }

  const approval = signApproval({
    privateKeyPem: readFileSync(required("--approver-key-file"), "utf8"),
    approverId: required("--approver-id"),
    keyId: required("--approver-key-id"),
    capability: CAPABILITY,
    resourceId: payment,
    maxAmount: amount,
    ttlSeconds: 900,
  });

  const save = option("--save-approval");

  if (save !== undefined) {
    writeFileSync(save, `${JSON.stringify(approval, null, 2)}\n`);
  }

  return approval;
}

async function main(): Promise<void> {
  const which = required("--case") as Case;

  if (!(which in EXPECTED)) {
    throw new Error(
      `--case must be one of ${Object.keys(EXPECTED).join(", ")}.`,
    );
  }

  const payment = required("--payment");
  const amount = Number(required("--amount"));
  const out = required("--out");

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(
      "--amount must be a positive whole number of paise (100 is ₹1).",
    );
  }

  // An approved request in production took 24 to 32 seconds (G-84).
  const parmana = new ParmanaClient({
    endpoint: env("PARMANA_URL").replace(/\/+$/, ""),
    apiKey: env("PARMANA_API_KEY"),
    timeout: 120_000,
  });

  const me = await parmana.caller();
  const inEffect = await parmana.policyInEffect(CAPABILITY);
  console.log(`Agent             : ${me.callerId}`);
  console.log(
    `Policy in effect  : ${inEffect.policy.name} ${inEffect.policy.version}`,
  );

  const approval = approvalFor(which, payment, amount);
  const transaction = createBusinessTransaction({
    principalId: me.callerId,
    purpose: `Razorpay refund demo: ${which}`,
    action: CAPABILITY,
    target: payment,
    parameters: { amount },
    policy: inEffect.policy,
    signals: {
      refundAmount: amount,
      managerApproved: approval !== undefined,
      ...(approval !== undefined ? { approvalArtifact: approval } : {}),
    } as never,
  });

  console.log(
    `Case              : ${which}, payment ${payment}, ${amount} paise (₹${(amount / 100).toFixed(2)})`,
  );
  console.log(`Transaction       : ${transaction.businessTransactionId}`);

  let outcome: "APPROVED" | "REFUSED";
  const started = Date.now();

  try {
    const record = await parmana.execute(transaction);
    outcome = "APPROVED";
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);

    const evidence = record.executions[0]?.evidence as
      { result?: Record<string, unknown>; success?: boolean } | undefined;
    console.log(
      `Razorpay answered : ${JSON.stringify(evidence?.result ?? evidence)}`,
    );

    const { pem } = await parmana.publicKey("default");
    const offline = verifyExecutionTrustRecordOffline(record, { default: pem });
    console.log(
      `Verifies offline  : ${offline.valid}${offline.valid ? "" : ` ${offline.errors.join("; ")}`}`,
    );

    if (!offline.valid) {
      process.exitCode = 1;
    }
  } catch (error) {
    if (!(error instanceof ExecutionRejectedError)) {
      throw error;
    }

    outcome = "REFUSED";
    const refusal = await parmana.refusalRecord(
      transaction.businessTransactionId,
    );
    const assessment = (
      refusal.decision as { assessment?: { authority?: { status?: string } } }
    ).assessment;
    console.log(
      `Refused by        : ${refusal.decision.matchedRuleId}: ${refusal.decision.reason}`,
    );
    console.log(
      `Authority         : ${assessment?.authority?.status ?? "not recorded"}`,
    );
    writeFileSync(out, `${JSON.stringify(refusal, null, 2)}\n`);
  }

  console.log(
    `Answer            : ${outcome} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  console.log(`Record saved to   : ${out}`);

  const passed = outcome === EXPECTED[which];
  console.log(
    passed
      ? `PASS: ${which} behaved as required.`
      : `FAIL: ${which} expected ${EXPECTED[which]}.`,
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
