#!/usr/bin/env node
// Creates a fresh dilithium3 (ML-DSA-65) secondary signing key and stores its private key as the
// value of an existing Secrets Manager secret. Used for PARMANA_SECONDARY_KEY_SECRET_ID.
//
// Why it works this way:
//   - The key is generated here, now, so its origin is always known. It never comes from keys/ or
//     any other folder, so a key of unknown origin can't end up in a secret.
//   - The PEM is written to a new temporary folder with owner-only permissions, passed to the AWS CLI
//     as file://, and the folder is deleted in a finally block, even when the store fails.
//   - Nothing about the key is printed. Only the secret's name, its ARN, and the new version id are.
//   - The secret must already exist (Terraform creates it). This script never creates secrets.
//
// Usage (Node 24 or later, from the repository root):
//   node scripts/store-secondary-key.mjs --secret-id parmana-test/secondary-key --region ap-southeast-2
//   node scripts/store-secondary-key.mjs --secret-id <name> --region <region> --dry-run
//
// --dry-run generates the key and checks it, then deletes it without calling AWS.

import { execFile } from "node:child_process";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

const secretId = argument("--secret-id");
const region = argument("--region");
const dryRun = process.argv.includes("--dry-run");

if (!secretId || !region) {
  console.error(
    "Usage: node scripts/store-secondary-key.mjs --secret-id <name> --region <region> [--dry-run]",
  );
  process.exit(2);
}

// Generate, then check the stored form parses back as an ML-DSA-65 private key.
// The check never prints key material.
function freshKeyPem() {
  const { privateKey } = generateKeyPairSync("ml-dsa-65");
  const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  if (createPrivateKey(pem).asymmetricKeyType !== "ml-dsa-65") {
    throw new Error(
      "The generated key is not ML-DSA-65. Refusing to store it.",
    );
  }
  return pem;
}

async function main() {
  const folder = await mkdtemp(join(tmpdir(), "parmana-secondary-key-"));
  const keyPath = join(folder, "secondary.private.pem");
  try {
    await chmod(folder, 0o700);
    await writeFile(keyPath, freshKeyPem(), { mode: 0o600 });

    if (dryRun) {
      console.log(
        "Dry run: a valid ML-DSA-65 key was generated and checked. Nothing was stored.",
      );
      return;
    }

    const { stdout } = await run("aws", [
      "secretsmanager",
      "put-secret-value",
      "--secret-id",
      secretId,
      "--secret-string",
      `file://${keyPath}`,
      "--region",
      region,
      "--query",
      "{ARN:ARN,VersionId:VersionId}",
      "--output",
      "json",
    ]);
    const result = JSON.parse(stdout);
    console.log(`Stored a new key in ${result.ARN}`);
    console.log(`Version: ${result.VersionId}`);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}

main().catch((error) => {
  // Print the message only. Errors from the AWS CLI can echo arguments, so keep them short.
  console.error(`Failed: ${error.message.split("\n")[0]}`);
  process.exit(1);
});
