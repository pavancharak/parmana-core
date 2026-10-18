/**
 * The agent's side of the live check (ADR-0013 step 6). Sends three
 * requests for livecheck:receipt to a Parmana server and says, for each,
 * whether it behaved as the rules require:
 *
 *   1. With no approval: refused by the policy (403 POLICY_DENIED).
 *   2. With a signed approval for the target: approved, released to the
 *      registered endpoint, and the signed record verifies offline with
 *      the server's public key alone.
 *   3. The same approval again: refused, an approval is used once.
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the agent key, read with Read-Host -AsSecureString>
 *   npx tsx examples/live-checks/external-connector/send.ts --approval approval.json --target live-check-1 --out record.json
 *
 * With --verify <businessTransactionId> --out record.json it sends nothing:
 * it fetches that record and verifies it offline.
 *
 * It needs the SDK from this repository (policyInEffect is not published
 * yet): run `npm run build` first. It never prints the key.
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  createBusinessTransaction,
  ExecutionRejectedError,
  ParmanaClient,
  verifyExecutionTrustRecordOffline,
} from "@parmana/sdk";

const CAPABILITY = "livecheck:receipt";

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];

  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (value === undefined || value === "") {
    throw new Error(`Set ${name}.`);
  }

  return value;
}

/**
 * Sends nothing: fetches one transaction's record, saves it and verifies
 * it offline. For a request whose answer was lost, for example to a
 * timeout.
 */
async function verifyOnly(
  client: ParmanaClient,
  businessTransactionId: string,
  out: string,
): Promise<void> {
  const record = await client.trustRecord(businessTransactionId);
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);

  const execution = record.executions[0];
  console.log(`Transaction          : ${record.businessTransactionId}`);
  console.log(`Decision             : ${execution?.decision.outcome}`);
  console.log(`Endpoint answered    : ${JSON.stringify(execution?.evidence)}`);
  console.log(`Record saved to      : ${out}`);

  const { pem } = await client.publicKey("default");
  const offline = verifyExecutionTrustRecordOffline(record, { default: pem });
  console.log(
    `Verifies offline     : ${offline.valid}${offline.valid ? "" : ` ${offline.errors.join("; ")}`}`,
  );
  process.exitCode = offline.valid ? 0 : 1;
}

async function main(): Promise<void> {
  const endpoint = required("PARMANA_URL").replace(/\/+$/, "");
  const out = argument("--out");

  // An approved request in production took longer than the SDK's default
  // 30 seconds on 2026-10-01; wait up to two minutes.
  const client = new ParmanaClient({
    endpoint,
    apiKey: required("PARMANA_API_KEY"),
    timeout: 120_000,
  });

  if (process.argv.includes("--verify")) {
    await verifyOnly(client, argument("--verify"), out);
    return;
  }

  const approval: unknown = JSON.parse(
    readFileSync(argument("--approval"), "utf8"),
  );
  const target = argument("--target");
  let failures = 0;

  const me = await client.caller();
  console.log(`Caller               : ${me.callerId}`);

  if (
    !me.unrestrictedCapabilities &&
    !me.allowedCapabilities.includes(CAPABILITY)
  ) {
    throw new Error(
      `This key may not use ${CAPABILITY}. Add it to the key's allowedCapabilities first.`,
    );
  }

  const inEffect = await client.policyInEffect(CAPABILITY);
  console.log(
    `Policy in effect     : ${inEffect.policy.name} ${inEffect.policy.version}`,
  );

  const request = (signals: Record<string, unknown>) =>
    createBusinessTransaction({
      principalId: me.callerId,
      purpose: "ADR-0013 step 6: live check of an external connector",
      action: CAPABILITY,
      target,
      parameters: { note: "live check, acts on nothing" },
      policy: inEffect.policy,
      signals: signals as never,
    });

  // 1. No approval.
  try {
    await client.execute(request({ receiptApproved: false }));
    console.log("1. No approval       : APPROVED, which is WRONG");
    failures += 1;
  } catch (error) {
    if (!(error instanceof ExecutionRejectedError)) throw error;
    console.log(
      `1. No approval       : refused, as required (${error.message})`,
    );
  }

  // 2. With the signed approval.
  const started = Date.now();
  const record = await client.execute(
    request({ receiptApproved: true, approvalArtifact: approval }),
  );
  const execution = record.executions[0];
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);

  console.log(
    `2. With approval     : ${execution?.decision.outcome} (${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );
  console.log(`   Transaction       : ${record.businessTransactionId}`);
  console.log(`   Endpoint answered : ${JSON.stringify(execution?.evidence)}`);
  console.log(`   Record saved to   : ${out}`);

  const { pem } = await client.publicKey("default");
  const offline = verifyExecutionTrustRecordOffline(record, { default: pem });
  console.log(
    `   Verifies offline  : ${offline.valid}${offline.valid ? "" : ` ${offline.errors.join("; ")}`}`,
  );

  if (!offline.valid) failures += 1;

  // 3. The same approval again.
  try {
    await client.execute(
      request({ receiptApproved: true, approvalArtifact: approval }),
    );
    console.log("3. Approval reused   : APPROVED, which is WRONG");
    failures += 1;
  } catch (error) {
    if (!(error instanceof ExecutionRejectedError)) throw error;
    console.log(
      `3. Approval reused   : refused, as required (${error.message})`,
    );
  }

  console.log(
    failures === 0
      ? "\nAll three behaved as required."
      : `\n${failures} check(s) FAILED.`,
  );
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
