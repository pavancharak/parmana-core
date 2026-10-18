import { readFileSync } from "node:fs";

import type { ExecutionTrustRecord } from "@parmana/shared";
import { verifyExecutionTrustRecordOffline } from "@parmana/crypto";

/**
 * Offline reference verifier CLI (PQC audit RED-1,
 * docs/VERIFICATION-GAPS.md). No network call, no database, no
 * PARMANA_KEY_DIR -- everything it needs is the two files below.
 *
 * Usage:
 *   npx tsx scripts/verify-trust-record.ts <trust-record.json> <keyId>=<public-key.pem> [<keyId>=<public-key.pem> ...]
 *
 * Example, verifying a record fetched from GET /trust-records/:id
 * against a key fetched from GET /keys/default:
 *   npx tsx scripts/verify-trust-record.ts record.json default=default.public.pem
 */

const [recordPath, ...keyArgs] = process.argv.slice(2);

if (!recordPath || keyArgs.length === 0) {
  console.error(
    "Usage: verify-trust-record.ts <trust-record.json> <keyId>=<public-key.pem> [...]",
  );
  process.exit(2);
}

const trustRecord = JSON.parse(
  readFileSync(recordPath, "utf8"),
) as ExecutionTrustRecord;

const publicKeys: Record<string, string> = {};

for (const arg of keyArgs) {
  const separatorIndex = arg.indexOf("=");

  if (separatorIndex === -1) {
    console.error(`Malformed key argument (expected keyId=path.pem): ${arg}`);
    process.exit(2);
  }

  const keyId = arg.slice(0, separatorIndex);
  const keyPath = arg.slice(separatorIndex + 1);

  publicKeys[keyId] = readFileSync(keyPath, "utf8");
}

const result = await verifyExecutionTrustRecordOffline(trustRecord, publicKeys);

console.log(JSON.stringify(result, null, 2));

process.exit(result.valid ? 0 : 1);
