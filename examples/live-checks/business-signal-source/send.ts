/**
 * The agent's side of the business signal source live check (RFC-0023
 * phases 2 and 4). Sends one request for livecheck:signal, with a fresh
 * signed approval for its own target, and says whether the answer is
 * what the rules require for that case:
 *
 *   --case paid      INV-LC-PAID, the agent declares nothing: APPROVED, a
 *                    Trusted Signal from livecheck-erp with
 *                    sourceProofVerified true in the signed record, the
 *                    release carries it as a condition, verifies offline
 *   --case unpaid    INV-LC-UNPAID: refused; the source answered false, so
 *                    validation is VALID and the policy refuses
 *   --case mismatch  INV-LC-UNPAID, the agent claims invoicePaid true:
 *                    refused, INVALID (the source says false)
 *   --case unknown   INV-LC-NONE: refused, MISSING_DATA (not_found)
 *
 *   $env:PARMANA_URL = "https://parmana-api-real.vercel.app"
 *   $env:PARMANA_API_KEY = <the livecheck-agent key, read hidden>
 *   npx tsx examples/live-checks/business-signal-source/send.ts --case paid `
 *     --approver-key-file <approver>.private.pem --approver-id manager-pavan --approver-key-id manager-pavan-key-1 `
 *     --out examples/live-checks/business-signal-source/record-paid.json
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

const CAPABILITY = "livecheck:signal";

type Case = "paid" | "unpaid" | "mismatch" | "unknown";

const CASES: Record<
  Case,
  {
    readonly invoiceId: string;
    readonly agentClaims?: boolean;
    readonly outcome: "APPROVED" | "REFUSED";
    readonly validation: string;
  }
> = {
  paid: { invoiceId: "INV-LC-PAID", outcome: "APPROVED", validation: "VALID" },
  unpaid: {
    invoiceId: "INV-LC-UNPAID",
    outcome: "REFUSED",
    validation: "VALID",
  },
  mismatch: {
    invoiceId: "INV-LC-UNPAID",
    agentClaims: true,
    outcome: "REFUSED",
    validation: "INVALID",
  },
  unknown: {
    invoiceId: "INV-LC-NONE",
    outcome: "REFUSED",
    validation: "MISSING_DATA",
  },
};

interface TrustedSignalView {
  readonly source?: string;
  readonly subject?: string;
  readonly observedValue?: unknown;
  readonly validUntil?: string;
  readonly integrityProof?: { readonly sourceProofVerified?: boolean };
}

interface Assessment {
  readonly businessValidation?: {
    readonly status?: string;
    readonly reason?: string;
    readonly signals?: readonly TrustedSignalView[];
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
  const spec = CASES[which];

  if (spec === undefined) {
    throw new Error(`--case must be one of ${Object.keys(CASES).join(", ")}.`);
  }

  const out = required("--out");

  // An approved request in production took 24 to 32 seconds (G-84).
  const parmana = new ParmanaClient({
    endpoint: env("PARMANA_URL").replace(/\/+$/, ""),
    apiKey: env("PARMANA_API_KEY"),
    timeout: 120_000,
  });

  const me = await parmana.caller();
  console.log(`Caller            : ${me.callerId}`);

  const inEffect = await parmana.policyInEffect(CAPABILITY);
  const sourced = inEffect.signals.sourced;
  console.log(
    `Policy in effect  : ${inEffect.policy.name} ${inEffect.policy.version}, sourced: ${JSON.stringify(sourced ?? {})}`,
  );

  if (sourced?.invoicePaid === undefined) {
    throw new Error(
      `${CAPABILITY} is not under a policy that sources invoicePaid. Stage 3 is not approved.`,
    );
  }

  const target = `live-check-signal-${which}-${Date.now()}`;
  const approval = signApproval({
    privateKeyPem: readFileSync(required("--approver-key-file"), "utf8"),
    approverId: required("--approver-id"),
    keyId: required("--approver-key-id"),
    capability: CAPABILITY,
    resourceId: target,
  });

  const transaction = createBusinessTransaction({
    principalId: me.callerId,
    purpose: `RFC-0023 business signal source live check: ${which}`,
    action: CAPABILITY,
    target,
    parameters: {
      invoiceId: spec.invoiceId,
      note: "live check, acts on nothing",
    },
    policy: inEffect.policy,
    signals: {
      releaseApproved: true,
      approvalArtifact: approval,
      ...(spec.agentClaims !== undefined && { invoicePaid: spec.agentClaims }),
    } as never,
  });

  console.log(
    `Case              : ${which}, invoice ${spec.invoiceId}${spec.agentClaims === undefined ? "" : `, agent claims invoicePaid ${spec.agentClaims}`}`,
  );
  console.log(`Transaction       : ${transaction.businessTransactionId}`);

  let outcome: "APPROVED" | "REFUSED";
  let assessment: Assessment | undefined;
  let detail: string;
  let verified = true;

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
    verified = offline.valid;
    console.log(
      `Verifies offline  : ${offline.valid}${offline.valid ? "" : ` ${offline.errors.join("; ")}`}`,
    );
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

  const validation = assessment?.businessValidation;
  const signal = validation?.signals?.[0];

  console.log(
    `Answer            : ${outcome} in ${((Date.now() - started) / 1000).toFixed(1)} s, ${detail}`,
  );
  console.log(
    `Validation        : ${validation?.status} (${validation?.reason ?? "no reason"})`,
  );

  if (signal !== undefined) {
    console.log(
      `Trusted Signal    : ${signal.source} says ${signal.subject} = ${JSON.stringify(signal.observedValue)}, valid until ${signal.validUntil}, source proof verified: ${signal.integrityProof?.sourceProofVerified}`,
    );
  }

  console.log(`Record saved to   : ${out}`);

  const passed =
    outcome === spec.outcome &&
    validation?.status === spec.validation &&
    verified &&
    (which !== "paid" ||
      (signal?.source === "livecheck-erp" &&
        signal.observedValue === true &&
        signal.integrityProof?.sourceProofVerified === true));

  console.log(
    passed
      ? `\nAs required: ${spec.outcome}, validation ${spec.validation}.`
      : `\nWRONG: required ${spec.outcome} with validation ${spec.validation}${which === "paid" ? ", a verified Trusted Signal from livecheck-erp saying true, and an offline verification" : ""}.`,
  );

  if (!passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
