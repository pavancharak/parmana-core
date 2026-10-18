/**
 * The agent's side of the authority grant live check (RFC-0023 phase 3).
 * Sends one request for livecheck:grant, with a fresh signed approval for
 * its own target, and says whether the answer is what the rules require
 * for that case:
 *
 *   --case no-grant   no grant for this caller: refused, authority-not-authorized
 *   --case within     a grant in force and the amount within its limit:
 *                     APPROVED, released to the check endpoint, the grant
 *                     named in the signed record, the record verifies offline
 *   --case over       the amount above the grant's limit: refused, NOT_AUTHORIZED
 *   --case revoked    after the grant is revoked: refused, authority-not-authorized
 *
 * Every request carries a valid signed approval, so a refusal shows the
 * grant decides it: a signed approval cannot cure missing authority.
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the livecheck-agent key, read hidden>
 *   npx tsx examples/live-checks/authority-grant/send.ts --case within --amount 50 `
 *     --approver-key-file <approver>.private.pem --approver-id manager-pavan --approver-key-id manager-pavan-key-1 `
 *     --out examples/live-checks/authority-grant/record-within.json
 *
 * It never prints a key. It needs the SDK from this repository: run
 * `npm run build` first.
 */

import { readFileSync, writeFileSync } from "node:fs";

import {
  createBusinessTransaction,
  ExecutionRejectedError,
  ParmanaClient,
  signApproval,
  verifyExecutionTrustRecordOffline,
} from "@parmana/sdk";

const CAPABILITY = "livecheck:grant";

type Case = "no-grant" | "within" | "over" | "revoked";

/** What each case must produce. */
const EXPECTED: Record<
  Case,
  { outcome: "APPROVED" | "REFUSED"; authority: string }
> = {
  "no-grant": { outcome: "REFUSED", authority: "NOT_AUTHORIZED" },
  within: { outcome: "APPROVED", authority: "AUTHORIZED" },
  over: { outcome: "REFUSED", authority: "NOT_AUTHORIZED" },
  revoked: { outcome: "REFUSED", authority: "NOT_AUTHORIZED" },
};

interface Assessment {
  readonly authority?: {
    readonly status?: string;
    readonly reason?: string;
    readonly grant?: Record<string, unknown>;
  };
}

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
  const which = required("--case") as Case;

  if (!(which in EXPECTED)) {
    throw new Error(
      `--case must be one of ${Object.keys(EXPECTED).join(", ")}.`,
    );
  }

  const amount = Number(required("--amount"));
  const out = required("--out");
  const expected = EXPECTED[which];

  // An approved request in production took 24 to 32 seconds (G-84).
  const parmana = new ParmanaClient({
    endpoint: env("PARMANA_URL").replace(/\/+$/, ""),
    apiKey: env("PARMANA_API_KEY"),
    timeout: 120_000,
  });

  const me = await parmana.caller();
  console.log(`Caller            : ${me.callerId}`);

  const inEffect = await parmana.policyInEffect(CAPABILITY);
  const grantRequired = inEffect.authorityGrantRequired;
  console.log(
    `Policy in effect  : ${inEffect.policy.name} ${inEffect.policy.version}, grant required: ${grantRequired === true}`,
  );

  if (grantRequired !== true) {
    throw new Error(
      `${CAPABILITY} is not under a policy with requireAuthorityGrant. Stage 2 is not approved.`,
    );
  }

  const target = `live-check-grant-${which}-${Date.now()}`;
  const approval = signApproval({
    privateKeyPem: readFileSync(required("--approver-key-file"), "utf8"),
    approverId: required("--approver-id"),
    keyId: required("--approver-key-id"),
    capability: CAPABILITY,
    resourceId: target,
  });

  const transaction = createBusinessTransaction({
    principalId: me.callerId,
    purpose: `RFC-0023 phase 3 live check: ${which}`,
    action: CAPABILITY,
    target,
    parameters: { amount, note: "live check, acts on nothing" },
    policy: inEffect.policy,
    signals: {
      amount,
      releaseApproved: true,
      approvalArtifact: approval,
    } as never,
  });

  console.log(`Case              : ${which}, amount ${amount}`);
  console.log(`Transaction       : ${transaction.businessTransactionId}`);

  let outcome: "APPROVED" | "REFUSED";
  let assessment: Assessment | undefined;
  let detail: string;

  const started = Date.now();

  try {
    const record = await parmana.execute(transaction);
    const execution = record.executions[0];
    outcome = "APPROVED";
    assessment = (execution?.decision as { assessment?: Assessment })
      .assessment;
    detail = `endpoint answered ${JSON.stringify(execution?.evidence)}`;
    writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);

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
    assessment = (refusal.decision as { assessment?: Assessment }).assessment;
    detail = `rule ${refusal.decision.matchedRuleId}: ${refusal.decision.reason}`;
    writeFileSync(out, `${JSON.stringify(refusal, null, 2)}\n`);
  }

  const authority = assessment?.authority;
  console.log(
    `Answer            : ${outcome} in ${((Date.now() - started) / 1000).toFixed(1)} s, ${detail}`,
  );
  console.log(
    `Authority         : ${authority?.status} (${authority?.reason ?? "no reason"})`,
  );

  if (authority?.grant !== undefined) {
    console.log(`Grant checked     : ${JSON.stringify(authority.grant)}`);
  }

  console.log(`Record saved to   : ${out}`);

  const passed =
    outcome === expected.outcome &&
    authority?.status === expected.authority &&
    (which !== "within" || authority?.grant !== undefined);

  console.log(
    passed
      ? `\nAs required: ${expected.outcome}, authority ${expected.authority}.`
      : `\nWRONG: required ${expected.outcome} with authority ${expected.authority}${which === "within" ? " and the grant in the record" : ""}.`,
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
