import "dotenv/config";

import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";

const DEFAULT_TTL_SECONDS = 120;
const DEFAULT_API_BASE = "https://parmana-api-real.vercel.app";
const DEFAULT_PRIVATE_KEY_FILE = "./reviewer.step-up.private.pem";
const DEFAULT_KEY_ID = "policy-reviewer-1";

function argument(args: string[], name: string, fallback?: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

function parseAction(value: string): "approve" | "reject" {
  if (value !== "approve" && value !== "reject") {
    throw new Error('--action must be "approve" or "reject".');
  }

  return value;
}

/**
 * Signs a PolicyChangeStepUpAuthorization and immediately submits the
 * approve/reject request in the same process -- collapses what was a
 * three-step, multi-tool relay (sign script -> paste envelope into a
 * hand-built curl body -> run curl) into one invocation, so the 120s
 * envelope TTL is never at risk from copy/paste or shell-quoting
 * round-trips. Reuses the same signer scripts/sign-policy-change-step-up.ts
 * uses; never prints the bearer key or private key.
 *
 * Usage:
 *   REVIEWER_KEY=<bearer key> npx tsx scripts/local-review-action.ts \
 *     --pending-policy-change-id <id> \
 *     --action approve|reject \
 *     [--rejection-reason "..."] \
 *     [--private-key-file ./reviewer.step-up.private.pem] \
 *     [--key-id policy-reviewer-1] \
 *     [--api-base https://parmana-api-real.vercel.app]
 */
async function main(args = process.argv.slice(2)): Promise<void> {
  const pendingPolicyChangeId = argument(args, "--pending-policy-change-id");
  const action = parseAction(argument(args, "--action"));
  const privateKeyPath = argument(
    args,
    "--private-key-file",
    DEFAULT_PRIVATE_KEY_FILE,
  );
  const keyId = argument(args, "--key-id", DEFAULT_KEY_ID);
  const apiBase = argument(args, "--api-base", DEFAULT_API_BASE);
  const ttlSeconds = args.includes("--ttl-seconds")
    ? Number(argument(args, "--ttl-seconds"))
    : DEFAULT_TTL_SECONDS;

  const rejectionReason = args.includes("--rejection-reason")
    ? argument(args, "--rejection-reason")
    : undefined;

  if (action === "reject" && !rejectionReason) {
    throw new Error("--rejection-reason is required when --action reject");
  }

  const bearerKey = process.env.REVIEWER_KEY;

  if (!bearerKey) {
    throw new Error(
      "REVIEWER_KEY environment variable is not set. Run:\n" +
        '  $env:REVIEWER_KEY = "your bearer key"\n' +
        "in this same PowerShell window before running this script.",
    );
  }

  const privateKeyPem = readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);

  const signer = new PolicyChangeStepUpAuthorizationSigner();
  const stepUpAuthorization = await signer.sign(
    { pendingPolicyChangeId, action },
    privateKey,
    keyId,
    ttlSeconds,
  );

  const body: Record<string, unknown> = { stepUpAuthorization };
  if (rejectionReason) body.rejectionReason = rejectionReason;

  const url = `${apiBase}/policies/pending-changes/${pendingPolicyChangeId}/${action}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearerKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await response.text();

  console.log(`HTTP ${response.status}`);
  console.log(responseBody);

  if (!response.ok) process.exitCode = 1;
}

if (process.env.VITEST === undefined) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { main };
