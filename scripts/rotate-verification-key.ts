import "dotenv/config";

import { generateKeyPairSync } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";

import {
  assertSafeKeyId,
  ensureKeyDirectory,
  PRIVATE_KEY_MODE,
  PUBLIC_KEY_MODE,
  writeKeyFile,
} from "./lib/key-files.js";

/**
 * Rotates the signing key used by VerificationCrypto/RefusalCrypto/
 * AuditEventCrypto -- Trust Records, Refusal Records, and Audit
 * Events -- for NEW signatures going forward (PQC audit RED-3,
 * docs/VERIFICATION-GAPS.md).
 *
 * This does not touch, delete, or overwrite any existing key file.
 * It generates a new key pair under a fresh, timestamped keyId, and
 * prints the environment variable to set so future signing uses it.
 * Every record already signed under the previous keyId keeps
 * verifying exactly as before -- VerificationCrypto.verifySignature()
 * always resolves the public key by the *stored* record's own keyId,
 * never a hardcoded "current" one -- as long as that key's file is
 * never deleted.
 *
 * Usage:
 *   npx tsx scripts/rotate-verification-key.ts --algorithm ed25519
 *   npx tsx scripts/rotate-verification-key.ts --algorithm dilithium3 --secondary
 */

const args = process.argv.slice(2);

function argument(name: string): string {
  const index = args.indexOf(name);

  if (index === -1 || index + 1 >= args.length) {
    throw new Error(`Missing argument: ${name}`);
  }

  return args[index + 1];
}

const algorithm = argument("--algorithm");
const secondary = args.includes("--secondary");

const nodeAlgorithm =
  algorithm === "ed25519"
    ? "ed25519"
    : algorithm === "dilithium3" || algorithm === "ml-dsa-65"
      ? "ml-dsa-65"
      : undefined;

if (!nodeAlgorithm) {
  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

const keyDirectory = process.env.PARMANA_KEY_DIR ?? "./keys";

ensureKeyDirectory(keyDirectory);

const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const rotationSuffix = secondary ? "secondary" : "primary";
const newKeyId = assertSafeKeyId(`verification-${rotationSuffix}-${timestamp}`);

const privatePath = join(keyDirectory, `${newKeyId}.private.pem`);
const publicPath = join(keyDirectory, `${newKeyId}.public.pem`);

if (existsSync(privatePath) || existsSync(publicPath)) {
  throw new Error(
    `Key material already exists at "${keyDirectory}" (${newKeyId}.private.pem / ` +
      `${newKeyId}.public.pem). A rotation on the same day already ran, or this is a ` +
      "re-run -- pick a different day, or generate directly with scripts/generate-keypair.ts.",
  );
}

const { publicKey, privateKey } = generateKeyPairSync(nodeAlgorithm);

writeKeyFile(
  privatePath,
  privateKey.export({ format: "pem", type: "pkcs8" }) as string,
  PRIVATE_KEY_MODE,
  false,
);

writeKeyFile(
  publicPath,
  publicKey.export({ format: "pem", type: "spki" }) as string,
  PUBLIC_KEY_MODE,
  false,
);

const envVar = secondary
  ? "PARMANA_VERIFICATION_SECONDARY_KEY_ID"
  : "PARMANA_VERIFICATION_KEY_ID";

console.log();
console.log("Verification signing key rotated");
console.log("--------------------------------");
console.log("Algorithm :", algorithm);
console.log("New keyId :", newKeyId);
console.log("Directory :", keyDirectory);
console.log();
console.log(
  `Set ${envVar}=${newKeyId} and redeploy for NEW signatures to use it.`,
);
console.log(
  "Do not delete the previous keyId's key files -- every record already signed " +
    "under it needs them to keep verifying.",
);
console.log();
