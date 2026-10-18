/**
 * Live check of the public sandbox (ADR-0014 step 3). Uses only what a
 * visitor has, the published demo key, and checks every step the docs
 * playground shows:
 *
 *   1. The demo key is sandbox-visitor, allowed only sandbox:receipt.
 *   2. The policy in effect is sandbox-receipt 1.0.0.
 *   3. A request with no approval is refused by the policy.
 *   4. The demo approver signs an approval for the target.
 *   5. With it, the request is approved, released to the receipt endpoint,
 *      and the signed record verifies offline with the sandbox's key.
 *   6. The same approval again is refused: an approval is used once.
 *   7. A note over 200 characters is refused, even with an approval.
 *   8. The demo approver refuses any other capability.
 *   9. A browser on the docs site may call the API; another site may not.
 *
 *   $env:PARMANA_URL = "https://parmana-sandbox.vercel.app"
 *   $env:PARMANA_API_KEY = <the sandbox-visitor key>
 *   npx tsx deploy/sandbox/check.ts --out deploy/sandbox/evidence/check-record.json
 *
 * Needs the SDK from this repository: run `npm run build` first.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  createBusinessTransaction,
  ExecutionRejectedError,
  ParmanaClient,
  verifyExecutionTrustRecordOffline,
} from "@parmana/sdk";

const CAPABILITY = "sandbox:receipt";
const DOCS_ORIGIN = "https://docs.parmanasystems.com";

function required(name: string): string {
  const value = process.env[name]?.trim();

  if (value === undefined || value === "") throw new Error(`Set ${name}.`);

  return value;
}

const outIndex = process.argv.indexOf("--out");
const out = outIndex === -1 ? undefined : process.argv[outIndex + 1];

if (out === undefined) throw new Error("Pass --out <file>.");

const url = required("PARMANA_URL").replace(/\/+$/, "");
const key = required("PARMANA_API_KEY");
const client = new ParmanaClient({
  endpoint: url,
  apiKey: key,
  timeout: 120_000,
});

let failures = 0;

function report(step: string, ok: boolean, detail: string): void {
  console.log(`${step.padEnd(28)}: ${ok ? "" : "WRONG, "}${detail}`);
  if (!ok) failures += 1;
}

async function demoApproval(capability: string, resourceId: string) {
  const response = await fetch(`${url}/sandbox/approvals`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ capability, resourceId }),
  });

  return { status: response.status, body: (await response.json()) as unknown };
}

async function refused(
  send: () => Promise<unknown>,
): Promise<string | undefined> {
  try {
    await send();
    return undefined;
  } catch (error) {
    if (error instanceof ExecutionRejectedError) return error.message;
    throw error;
  }
}

const me = await client.caller();
report(
  "1. Demo key",
  me.callerId === "sandbox-visitor" &&
    !me.unrestrictedCapabilities &&
    me.allowedCapabilities.length === 1 &&
    me.allowedCapabilities[0] === CAPABILITY,
  `${me.callerId}, allowed ${me.allowedCapabilities.join(", ")}`,
);

const inEffect = await client.policyInEffect(CAPABILITY);
report(
  "2. Policy in effect",
  inEffect.policy.name === "sandbox-receipt" &&
    inEffect.policy.version === "1.0.0",
  `${inEffect.policy.name} ${inEffect.policy.version}`,
);

const target = `sandbox-check-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const request = (note: string, signals: Record<string, unknown>) =>
  createBusinessTransaction({
    principalId: me.callerId,
    purpose: "ADR-0014 step 3: live check of the public sandbox",
    action: CAPABILITY,
    target,
    parameters: { note },
    policy: inEffect.policy,
    signals: { note, ...signals } as never,
  });

const noApproval = await refused(() =>
  client.execute(request("no approval", { receiptApproved: false })),
);
report("3. No approval", noApproval !== undefined, noApproval ?? "APPROVED");

const approval = await demoApproval(CAPABILITY, target);
report("4. Demo approval", approval.status === 201, `HTTP ${approval.status}`);

const started = Date.now();
const record = await client.execute(
  request("live check, acts on nothing", {
    receiptApproved: true,
    approvalArtifact: approval.body,
  }),
);
const execution = record.executions[0];
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
const { pem } = await client.publicKey("default");
const offline = verifyExecutionTrustRecordOffline(record, { default: pem });
report(
  "5. With the approval",
  execution?.decision.outcome === "APPROVED" && offline.valid,
  `${execution?.decision.outcome} in ${((Date.now() - started) / 1000).toFixed(1)} s, ` +
    `transaction ${record.businessTransactionId}, endpoint ${JSON.stringify(execution?.evidence)}, ` +
    `verifies offline ${offline.valid}${offline.valid ? "" : ` (${offline.errors.join("; ")})`}`,
);

const reused = await refused(() =>
  client.execute(
    request("reused approval", {
      receiptApproved: true,
      approvalArtifact: approval.body,
    }),
  ),
);
report("6. Approval reused", reused !== undefined, reused ?? "APPROVED");

const longNoteApproval = await demoApproval(CAPABILITY, target);
const longNote = await refused(() =>
  client.execute(
    request("x".repeat(201), {
      receiptApproved: true,
      approvalArtifact: longNoteApproval.body,
    }),
  ),
);
report(
  "7. Note over 200 characters",
  longNote !== undefined,
  longNote ?? "APPROVED",
);

const other = await demoApproval("paytm:refund", target);
report(
  "8. Other capability",
  other.status === 400,
  `HTTP ${other.status} ${JSON.stringify(other.body)}`,
);

async function preflight(origin: string) {
  const response = await fetch(`${url}/execute`, {
    method: "OPTIONS",
    headers: {
      Origin: origin,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });

  return {
    status: response.status,
    allow: response.headers.get("access-control-allow-origin"),
  };
}

const docs = await preflight(DOCS_ORIGIN);
const elsewhere = await preflight("https://example.com");
report(
  "9. Browser access",
  docs.status === 204 &&
    docs.allow === DOCS_ORIGIN &&
    elsewhere.status === 403 &&
    elsewhere.allow === null,
  `docs site ${docs.status} ${docs.allow}, another site ${elsewhere.status} ${elsewhere.allow}`,
);

console.log(
  failures === 0
    ? `\nAll nine behaved as required. The record is ${out}.`
    : `\n${failures} check(s) WRONG.`,
);
process.exitCode = failures === 0 ? 0 : 1;
