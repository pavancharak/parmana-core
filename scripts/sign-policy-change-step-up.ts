import "dotenv/config";

import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";

import { PolicyChangeStepUpAuthorizationSigner } from "@parmana/crypto";

const DEFAULT_TTL_SECONDS = 120;

function argument(args: string[], name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
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
 * Signs a PolicyChangeStepUpAuthorization envelope for POST
 * /policies/pending-changes/:id/approve or .../reject (Policy
 * Governance, maker-checker, Layer 4).
 *
 * Run by a human checker on their own machine, against the private
 * key generate-api-key.ts's --generate-step-up-key flag produced for
 * them -- this script never talks to the API itself, it only prints
 * the signed envelope JSON for the checker to paste into their
 * request body's "stepUpAuthorization" field alongside their existing
 * bearer token. Keeping signing and HTTP submission as separate steps
 * means this script never needs the checker's bearer token at all.
 *
 * Usage:
 *   npx tsx scripts/sign-policy-change-step-up.ts \
 *     --private-key-file ./checker.step-up.private.pem \
 *     --key-id checker-1 \
 *     --pending-policy-change-id <id> \
 *     --action approve
 */
function main(args = process.argv.slice(2)): void {
  const privateKeyPath = argument(args, "--private-key-file");
  const keyId = argument(args, "--key-id");
  const pendingPolicyChangeId = argument(args, "--pending-policy-change-id");
  const action = parseAction(argument(args, "--action"));

  const ttlSeconds = args.includes("--ttl-seconds")
    ? Number(argument(args, "--ttl-seconds"))
    : DEFAULT_TTL_SECONDS;

  const privateKeyPem = readFileSync(privateKeyPath, "utf8");
  const privateKey = createPrivateKey(privateKeyPem);

  const signer = new PolicyChangeStepUpAuthorizationSigner();

  signer
    .sign({ pendingPolicyChangeId, action }, privateKey, keyId, ttlSeconds)
    .then((envelope) => {
      console.log();
      console.log(`Signed step-up authorization (expires in ${ttlSeconds}s)`);
      console.log("--------------------------------");
      console.log(
        'Paste this into the request body\'s "stepUpAuthorization" field:',
      );
      console.log(JSON.stringify(envelope));
      console.log();
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}

if (process.env.VITEST === undefined) {
  main();
}

export { main };
