// Makes the API keys the offline check uses, in its own throwaway volume
// (/identities), so the check never adds a key to the real deployment.
//
//   operator  sends the refunds; may use paytm:refund only.
//   proposer  a verified human who proposes a policy change.
//   approver  a different verified human, with a step-up key, who approves
//             it. Policy governance refuses an approval by the proposer.
//
// Writes api-keys.json (hashes only, what the API is started with) and
// secrets.json (the raw keys and the approver's step-up private key, read
// only by the check container). Kept if they already exist, so a
// `compose run` that starts this service again does not change the keys
// the API was started with.

import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";

const apiKeysPath = "/identities/api-keys.json";
const secretsPath = "/identities/secrets.json";

if (existsSync(apiKeysPath) && existsSync(secretsPath)) {
  console.log("[check-identities] already exist, kept");
  process.exit(0);
}

const newKey = () => `pk_check_${randomBytes(24).toString("base64url")}`;
const hash = (key) => createHash("sha256").update(key).digest("hex");

const operatorKey = newKey();
const proposerKey = newKey();
const approverKey = newKey();

const stepUp = generateKeyPairSync("ed25519");

const entries = [
  {
    callerId: "offline-check-operator",
    keyHash: hash(operatorKey),
    allowedCapabilities: ["paytm:refund"],
  },
  {
    callerId: "offline-check-proposer",
    keyHash: hash(proposerKey),
    credentialHolderType: "USER",
  },
  {
    callerId: "offline-check-approver",
    keyHash: hash(approverKey),
    credentialHolderType: "USER",
    stepUpPublicKey: stepUp.publicKey.export({ type: "spki", format: "pem" }),
  },
];

writeFileSync(apiKeysPath, JSON.stringify(entries), { mode: 0o644 });
writeFileSync(
  secretsPath,
  JSON.stringify({
    operator: { callerId: "offline-check-operator", key: operatorKey },
    proposer: { callerId: "offline-check-proposer", key: proposerKey },
    approver: {
      callerId: "offline-check-approver",
      key: approverKey,
      stepUpPrivateKeyPem: stepUp.privateKey.export({
        type: "pkcs8",
        format: "pem",
      }),
    },
  }),
  { mode: 0o644 },
);

console.log("[check-identities] made operator, proposer and approver keys");
