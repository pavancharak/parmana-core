import "dotenv/config";

import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";
import { FilePolicyRepository } from "@parmana/policy";

const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_API_BASE = "https://parmana-api-real.vercel.app";
const DEFAULT_PRIVATE_KEY_FILE = "./reviewer.step-up.private.pem";
const DEFAULT_REVIEWER_KEY_ID = "policy-reviewer-1";

function argument(args: string[], name: string, fallback?: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

/**
 * Proposes the CURRENT on-disk content for (name, version) as a fresh
 * pending policy change (as charak1987, via PROPOSER_KEY), then
 * immediately signs and submits its approval (as policy-reviewer-1,
 * via REVIEWER_KEY + the step-up private key) -- one script run, both
 * halves of maker-checker.
 *
 * Exists to correct the 2026-08-19 backfill proposals' drift: those
 * were snapshotted before this codebase added `unboundSignalReasons`
 * documentation (harmless) and, for connector-capability and
 * customer-refund specifically, before `boundSignals` was added
 * (functional -- SignalIntentBinder needs it to derive
 * paymentAmount/refundAmount from the request's own parameters rather
 * than treating them as needing independent verification). Approving
 * those stale proposals persisted the old content; this re-proposes
 * and re-approves the current, correct file content so the live
 * policy and the approval record agree, closing the gap
 * scripts/verify-policy-changes-approved.ts --full-scan surfaced.
 *
 * Usage:
 *   $env:PROPOSER_KEY = "<charak1987 bearer key>"
 *   $env:REVIEWER_KEY = "<policy-reviewer-1 bearer key>"
 *   npx tsx scripts/refresh-approved-policy-content.ts \
 *     --policy-name customer-refund --policy-version 1.0.0
 */
async function main(args = process.argv.slice(2)): Promise<void> {
  const policyName = argument(args, "--policy-name");
  const policyVersion = argument(args, "--policy-version");
  const apiBase = argument(args, "--api-base", DEFAULT_API_BASE);
  const privateKeyPath = argument(
    args,
    "--private-key-file",
    DEFAULT_PRIVATE_KEY_FILE,
  );
  const reviewerKeyId = argument(args, "--key-id", DEFAULT_REVIEWER_KEY_ID);
  const ttlSeconds = args.includes("--ttl-seconds")
    ? Number(argument(args, "--ttl-seconds"))
    : DEFAULT_TTL_SECONDS;

  const proposerKey = process.env.PROPOSER_KEY;
  const reviewerBearerKey = process.env.REVIEWER_KEY;

  if (!proposerKey) {
    throw new Error("$env:PROPOSER_KEY is not set (charak1987's bearer key).");
  }

  if (!reviewerBearerKey) {
    throw new Error(
      "$env:REVIEWER_KEY is not set (policy-reviewer-1's bearer key).",
    );
  }

  const fileRepo = new FilePolicyRepository(
    process.env.PARMANA_POLICY_DIR ?? "./policies",
  );
  const proposedContent = await fileRepo.load(policyName, policyVersion);

  console.log(
    `Proposing current file content for ${policyName}@${policyVersion}...`,
  );

  const proposeResponse = await fetch(
    `${apiBase}/policies/${policyName}/${policyVersion}/pending-changes`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${proposerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        proposedContent,
        reason:
          "Sync approval record with current file content: the 2026-08-19 " +
          "backfill proposal predated unboundSignalReasons documentation " +
          "(and, for this policy if applicable, boundSignals) being added " +
          "to the live file. No rule-logic change.",
      }),
    },
  );

  const proposeBody = (await proposeResponse.json()) as {
    pendingPolicyChangeId?: string;
    error?: string;
  };

  if (!proposeResponse.ok || !proposeBody.pendingPolicyChangeId) {
    console.log(`HTTP ${proposeResponse.status}`);
    console.log(JSON.stringify(proposeBody));
    process.exitCode = 1;
    return;
  }

  const pendingPolicyChangeId = proposeBody.pendingPolicyChangeId;
  console.log(`Proposed as ${pendingPolicyChangeId}. Signing approval...`);

  const privateKeyPem = readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);

  const signer = new PolicyChangeStepUpAuthorizationSigner();
  const stepUpAuthorization = await signer.sign(
    { pendingPolicyChangeId, action: "approve" },
    privateKey,
    reviewerKeyId,
    ttlSeconds,
  );

  const approveResponse = await fetch(
    `${apiBase}/policies/pending-changes/${pendingPolicyChangeId}/approve`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${reviewerBearerKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ stepUpAuthorization }),
    },
  );

  const approveBody = await approveResponse.text();

  console.log(`HTTP ${approveResponse.status}`);
  console.log(approveBody);

  if (!approveResponse.ok) process.exitCode = 1;
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };
