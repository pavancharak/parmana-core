/**
 * Command-line runner for the refund agent (agent.ts). One refund request
 * per run, in Razorpay test mode through the endpoint Parmana releases to.
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the agent's key, read hidden>
 *   npx tsx examples/razorpay-refund-agent/send.ts --payment pay_XXXX --amount 100 `
 *     --approval-file approval.json --out record.json
 *
 * --approval-file is a manager's signed approval (see examples/razorpay-refund
 * for how it is made). Without it the request is sent without approval and
 * Parmana refuses it. Amounts are in paise. The key is never printed.
 * Run `npm run build` first: it needs the SDK in typescript/dist.
 */

import { readFileSync, writeFileSync } from "node:fs";

import { ParmanaClient, verifyExecutionTrustRecordOffline } from "@parmana/sdk";

import { requestRefund } from "./agent.js";

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

async function main(): Promise<void> {
  const paymentId = required("--payment");
  const amountPaise = Number(required("--amount"));
  const out = required("--out");
  const approvalFile = option("--approval-file");

  const approval =
    approvalFile === undefined
      ? undefined
      : JSON.parse(readFileSync(approvalFile, "utf8"));

  const parmana = new ParmanaClient({
    endpoint: env("PARMANA_URL").replace(/\/+$/, ""),
    apiKey: env("PARMANA_API_KEY"),
    // An approved request in production took 24 to 32 seconds (G-84).
    timeout: 120_000,
  });

  const started = Date.now();
  const decision = await requestRefund(parmana, {
    paymentId,
    amountPaise,
    approval,
  });

  writeFileSync(out, `${JSON.stringify(decision.record, null, 2)}\n`);

  console.log(`Transaction       : ${decision.businessTransactionId}`);

  if (decision.status === "REFUSED") {
    console.log(`Refused by        : ${decision.rule}: ${decision.reason}`);
  } else {
    const evidence = decision.record.executions[0]?.evidence as
      { result?: Record<string, unknown> } | undefined;
    console.log(
      `Razorpay answered : ${JSON.stringify(evidence?.result ?? evidence)}`,
    );

    const { pem } = await parmana.publicKey("default");
    const offline = verifyExecutionTrustRecordOffline(decision.record, {
      default: pem,
    });
    console.log(
      `Verifies offline  : ${offline.valid}${offline.valid ? "" : ` ${offline.errors.join("; ")}`}`,
    );

    if (!offline.valid) {
      process.exitCode = 1;
    }
  }

  console.log(
    `Answer            : ${decision.status} in ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );
  console.log(`Record saved to   : ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
