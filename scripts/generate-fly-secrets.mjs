#!/usr/bin/env node
import { generateKeyPairSync, randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Generates local secrets for a fresh parmana-api Fly deployment. Never
// prints a secret value to stdout -- only file paths, variable names,
// and which ones still need a value filled in.
//
// Formats match the codebase's own conventions exactly, not an
// independent guess:
// - Key pairs: Ed25519, PKCS8 private / SPKI public PEM, same as
//   scripts/generate-keypair.ts (--algorithm ed25519), matching the
//   default PRIMARY_SIGNATURE_PROVIDER (ConfigValidation.ts's
//   parseSignatureAlgorithm default). FileKeyProvider.getPrivateKey/
//   getPublicKey load these generically via node:crypto's
//   createPrivateKey/createPublicKey, so any PEM works as long as it
//   matches the configured signature algorithm.
// - PARMANA_KEY_MATERIAL_JSON: { "<keyId>": { "privateKeyPem": string,
//   "publicKeyPem": string } }, per
//   assertSigningKeyMaterialConfigured.ts's materializeFromEnvIfConfigured
//   -- entries for both "default" (authorization signing) and "gateway"
//   (Gateway attestation signing, see createGatewayKeyPair.ts).
// - PARMANA_API_KEYS: JSON array of { "callerId": string, "keyHash":
//   string }, per ConfigValidation.ts's parseApiKeys and
//   StaticKeyAuthenticator. The raw key is randomBytes(32).base64url()
//   and the hash is SHA-256 hex of the raw key
//   (scripts/generate-api-key.ts / auth/hashApiKey.ts, byte-for-byte
//   the same derivation StaticKeyAuthenticator verifies against).

const OUT_DIR = ".flysecrets";
const SECRETS_FILE = join(OUT_DIR, "secrets.env");
const SMOKE_KEY_FILE = join(OUT_DIR, "smoke-test-api-key.txt");

if (existsSync(SECRETS_FILE) && !process.argv.includes("--force")) {
  // A re-run would replace the default and gateway signing keys, and every
  // signature made with the old keys would stop verifying.
  console.error(
    `${SECRETS_FILE} already exists. Refusing to regenerate signing keys. Pass --force to replace them.`,
  );
  process.exit(1);
}

if (!existsSync(OUT_DIR)) {
  mkdirSync(OUT_DIR, { recursive: true });
}

function generateEd25519KeyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");

  return {
    privateKeyPem: privateKey.export({ format: "pem", type: "pkcs8" }),
    publicKeyPem: publicKey.export({ format: "pem", type: "spki" }),
  };
}

const keyMaterial = {
  default: generateEd25519KeyPair(),
  gateway: generateEd25519KeyPair(),
};

const rawApiKey = randomBytes(32).toString("base64url");
const keyHash = createHash("sha256").update(rawApiKey, "utf8").digest("hex");
const apiKeys = [{ callerId: "smoke-test", keyHash }];

// fly secrets import reads plain KEY=VALUE lines, not shell/dotenv
// syntax -- no quoting here, since flyctl would take literal quote
// characters as part of the value. JSON.stringify keeps each value on
// a single line (PEM newlines come out as escaped "\n" inside the JSON
// string), so this stays parseable line-by-line.
const secretsEnvLines = [
  `PARMANA_KEY_MATERIAL_JSON=${JSON.stringify(keyMaterial)}`,
  `PARMANA_API_KEYS=${JSON.stringify(apiKeys)}`,
  `SUPABASE_URL=FILL_ME_IN`,
  `SUPABASE_SERVICE_ROLE_KEY=FILL_ME_IN`,
  `HUBSPOT_PRIVATE_APP_TOKEN=FILL_ME_IN`,
];

writeFileSync(SECRETS_FILE, secretsEnvLines.join("\n") + "\n", { mode: 0o600 });
writeFileSync(SMOKE_KEY_FILE, rawApiKey + "\n", { mode: 0o600 });

console.log("Generated (no values printed):");
console.log(`  ${SECRETS_FILE}`);
console.log(`    PARMANA_KEY_MATERIAL_JSON   generated (default + gateway Ed25519 keypairs)`);
console.log(`    PARMANA_API_KEYS            generated (callerId "smoke-test")`);
console.log(`    SUPABASE_URL                FILL_ME_IN`);
console.log(`    SUPABASE_SERVICE_ROLE_KEY   FILL_ME_IN`);
console.log(`    HUBSPOT_PRIVATE_APP_TOKEN   FILL_ME_IN`);
console.log(`  ${SMOKE_KEY_FILE}`);
console.log(`    plaintext caller key for callerId "smoke-test" (SMOKE_TEST_API_KEY)`);
