import { readFileSync } from "node:fs";

import type { ExecutionIntent } from "@parmana/shared";
import { verifyExecutionIntentOffline } from "@parmana/crypto";

/**
 * Offline verifier CLI for an Execution Intent (ADR-0012). No network call, no
 * database, no PARMANA_KEY_DIR: everything it needs is the two files below.
 *
 * Usage:
 *   npx tsx scripts/verify-execution-intent.ts <intent.json> <keyId>=<public-key.pem> [<keyId>=<public-key.pem> ...]
 *
 * Example, verifying the intent from GET /execution-intents/:id (the "intent"
 * field of the response, saved to intent.json) against the key from GET
 * /keys/default:
 *   npx tsx scripts/verify-execution-intent.ts intent.json default=default.public.pem
 *
 * Exit code 0 means the hash and signature are valid. 1 means they are not.
 * 2 means the arguments were wrong.
 */

const [intentPath, ...keyArgs] = process.argv.slice(2);

if (!intentPath || keyArgs.length === 0) {
  console.error(
    "Usage: verify-execution-intent.ts <intent.json> <keyId>=<public-key.pem> [...]",
  );
  process.exit(2);
}

const intent = JSON.parse(readFileSync(intentPath, "utf8")) as ExecutionIntent;

const publicKeys: Record<string, string> = {};

for (const arg of keyArgs) {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex === -1) {
    console.error(`Malformed key argument (expected keyId=path.pem): ${arg}`);
    process.exit(2);
  }

  publicKeys[arg.slice(0, separatorIndex)] = readFileSync(
    arg.slice(separatorIndex + 1),
    "utf8",
  );
}

const result = await verifyExecutionIntentOffline(intent, publicKeys);

console.log(JSON.stringify(result, null, 2));

process.exit(result.valid ? 0 : 1);
