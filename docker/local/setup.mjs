// First start setup for the self hosted deployment (docker-compose.yml).
//
// Runs inside the API image as the `node` user, so the host needs nothing
// but Docker. Idempotent: anything that already exists is kept, so running
// `docker compose up` again never replaces a key or an API key.
//
// Writes into /app/parmana-local (the host directory ./parmana-local):
//
//   keys/default.private.pem, keys/default.public.pem
//       Ed25519 key that signs authorizations and Trust Records.
//   keys/gateway.private.pem, keys/gateway.public.pem
//       Ed25519 key the Execution Gateway signs its attestations with.
//   api-keys.json
//       The PARMANA_API_KEYS value the API is started with. Holds only the
//       SHA-256 hash of the API key, never the key itself.
//   api-key.txt
//       The API key itself, written once so the operator can collect it.
//       Move it to a secret store and delete this file.
//
// Private keys and api-key.txt are written with mode 0600 and, on Linux,
// belong to uid 1000 (the image's `node` user, which the API runs as). Read
// the API key with `docker compose run --rm --entrypoint cat setup
// /app/parmana-local/api-key.txt`, or as root.

import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { chownSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.env.PARMANA_LOCAL_DIR ?? "/app/parmana-local";
const keyDir = path.join(root, "keys");
// Where the offline check (docker/local/offline-check) saves its Trust
// Record and the public keys to verify it with.
const offlineCheckDir = path.join(root, "offline-check");

mkdirSync(keyDir, { recursive: true, mode: 0o700 });
mkdirSync(offlineCheckDir, { recursive: true, mode: 0o755 });

for (const keyId of ["default", "gateway"]) {
  const privatePath = path.join(keyDir, `${keyId}.private.pem`);
  const publicPath = path.join(keyDir, `${keyId}.public.pem`);

  if (existsSync(privatePath) && existsSync(publicPath)) {
    console.log(`[setup] key "${keyId}" already exists, kept`);
    continue;
  }

  if (existsSync(privatePath) !== existsSync(publicPath)) {
    // One half of a pair without the other means something was deleted by
    // hand. Replacing it would silently change the signing identity, so
    // stop and let the operator decide.
    console.error(
      `[setup] key "${keyId}" is incomplete: only one of ${privatePath} and ` +
        `${publicPath} exists. Restore the missing file, or delete both to ` +
        "generate a new key pair.",
    );
    process.exit(1);
  }

  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  writeFileSync(
    privatePath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600 },
  );
  writeFileSync(publicPath, publicKey.export({ type: "spki", format: "pem" }), {
    mode: 0o644,
  });

  console.log(`[setup] generated Ed25519 key "${keyId}"`);
}

const apiKeysPath = path.join(root, "api-keys.json");
const apiKeyPath = path.join(root, "api-key.txt");

if (existsSync(apiKeysPath)) {
  console.log("[setup] api-keys.json already exists, kept");
} else {
  const callerId = process.env.PARMANA_LOCAL_CALLER_ID ?? "local-operator";
  const allowedCapabilities = (
    process.env.PARMANA_LOCAL_ALLOWED_CAPABILITIES ?? "paytm:refund"
  )
    .split(",")
    .map((capability) => capability.trim())
    .filter((capability) => capability.length > 0);

  const rawKey = `pk_local_${randomBytes(32).toString("base64url")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");

  writeFileSync(
    apiKeysPath,
    JSON.stringify([{ callerId, keyHash, allowedCapabilities }], null, 2) +
      "\n",
    { mode: 0o644 },
  );
  writeFileSync(apiKeyPath, `${rawKey}\n`, { mode: 0o600 });

  console.log(
    `[setup] generated an API key for caller "${callerId}", allowed ` +
      `capabilities: ${allowedCapabilities.join(", ") || "none"}. ` +
      "It is in parmana-local/api-key.txt. Move it to a secret store and " +
      "delete that file.",
  );
}

// Compose runs this as root, because Docker creates a missing bind mount
// directory owned by root. Hand everything to the image's `node` user
// (uid 1000), which the API runs as, so it can read its keys and nothing
// else on the host is given access.
if (process.getuid?.() === 0) {
  const nodeUid = 1000;
  const nodeGid = 1000;
  for (const file of [
    root,
    keyDir,
    offlineCheckDir,
    ...["default", "gateway"].flatMap((keyId) => [
      path.join(keyDir, `${keyId}.private.pem`),
      path.join(keyDir, `${keyId}.public.pem`),
    ]),
    apiKeysPath,
    apiKeyPath,
  ]) {
    if (existsSync(file)) chownSync(file, nodeUid, nodeGid);
  }
}
