#!/usr/bin/env node
// Governed quickstart, step 1 of 2: create local, test-only configuration.
//
// Writes everything a local Parmana server needs for the governed flow into
// CONFIG_DIR (default: ~/.parmana/governed-quickstart), outside the repository:
//
//   keys/            Ed25519 signing key ("default"), gateway key, and the
//                    local test approver key that the server trusts.
//   policies/        A copy of the repository's fixture policies, so approving a
//                    policy change never rewrites the repository's policies/ tree.
//   api-keys.json    Caller entries holding only SHA-256 hashes of the keys:
//                    a maker (USER), a checker (USER, with a step-up public key)
//                    and a demo caller allowed to invoke test:fixture-execute.
//   raw-keys.json    The raw caller keys the examples send. Local secrets; do not share.
//   stepup-private.pem   The checker's step-up private key. Local secret.
//
// Usage (from the repository root):
//   node docs/developer-portal/examples/governed-quickstart/setup.mjs
//
// It refuses to overwrite an existing CONFIG_DIR. Delete the directory to start over.
// Test only: the approver key it creates is trusted only with NODE_ENV=test.

import { createHash, generateKeyPairSync, randomBytes } from "node:crypto";
import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const configDir = resolve(
  process.env.GOVERNED_CONFIG_DIR ??
    join(homedir(), ".parmana", "governed-quickstart"),
);

if (existsSync(configDir)) {
  console.error(`Refusing to overwrite ${configDir}. Delete it to start over.`);
  process.exit(1);
}

const keyDir = join(configDir, "keys");
mkdirSync(keyDir, { recursive: true });

function writeKeyPair(name) {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privatePem = privateKey
    .export({ format: "pem", type: "pkcs8" })
    .toString();
  const publicPem = publicKey
    .export({ format: "pem", type: "spki" })
    .toString();
  writeFileSync(join(keyDir, `${name}.private.pem`), privatePem, {
    mode: 0o600,
  });
  writeFileSync(join(keyDir, `${name}.public.pem`), publicPem);
  return { privatePem, publicPem };
}

// Signing key the server uses for Execution Trust Records, and the gateway key.
writeKeyPair("default");
writeKeyPair("gateway");

// Local test approver: the same identifiers the quickstart uses.
const approverBase = "local-test-approver__local-test-approver-key-1";
const approver = generateKeyPairSync("ed25519");
const approverPrivatePem = approver.privateKey
  .export({ format: "pem", type: "pkcs8" })
  .toString();
const approverPublicPem = approver.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
writeFileSync(
  join(configDir, `${approverBase}.private.pem`),
  approverPrivatePem,
  { mode: 0o600 },
);
writeFileSync(join(configDir, `${approverBase}.public.pem`), approverPublicPem);

// Checker step-up key: the checker signs approvals with the private key; the
// server verifies them with the public key stored in the checker's entry.
const stepUp = generateKeyPairSync("ed25519");
const stepUpPublicPem = stepUp.publicKey
  .export({ format: "pem", type: "spki" })
  .toString();
writeFileSync(
  join(configDir, "stepup-private.pem"),
  stepUp.privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
  { mode: 0o600 },
);

const sha256 = (text) =>
  createHash("sha256").update(text, "utf8").digest("hex");
const raw = {
  maker: `maker-${randomBytes(16).toString("hex")}`,
  checker: `checker-${randomBytes(16).toString("hex")}`,
  demo: `demo-${randomBytes(16).toString("hex")}`,
};
const apiKeys = [
  {
    callerId: "maker",
    keyHash: sha256(raw.maker),
    credentialHolderType: "USER",
  },
  {
    callerId: "checker",
    keyHash: sha256(raw.checker),
    credentialHolderType: "USER",
    stepUpPublicKey: stepUpPublicPem,
  },
  {
    callerId: "demo",
    keyHash: sha256(raw.demo),
    allowedCapabilities: ["test:fixture-execute"],
  },
];
writeFileSync(
  join(configDir, "api-keys.json"),
  JSON.stringify(apiKeys, null, 2),
);
writeFileSync(join(configDir, "raw-keys.json"), JSON.stringify(raw, null, 2), {
  mode: 0o600,
});

cpSync(join(repoRoot, "fixtures", "policies"), join(configDir, "policies"), {
  recursive: true,
});

const q = (s) => `'${s.replace(/'/g, `'\\''`)}'`;
const startCommand = [
  `cd ${q(repoRoot)} && env -u DATABASE_URL -u TEST_DATABASE_URL \\`,
  `  NODE_ENV=test PARMANA_STORAGE=memory \\`,
  `  PARMANA_KEY_DIR=${q(keyDir)} \\`,
  `  PARMANA_POLICY_DIR=${q(join(configDir, "policies"))} \\`,
  `  PARMANA_API_KEYS="$(cat ${q(join(configDir, "api-keys.json"))})" \\`,
  `  POLICY_CHANGE_CHECKERS='{"vendor-payment":["checker"]}' \\`,
  `  PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE=${q(join(configDir, `${approverBase}.public.pem`))} \\`,
  `  npx tsx packages/api/src/server.ts`,
].join("\n");

writeFileSync(
  join(configDir, "start-server.sh"),
  `#!/usr/bin/env bash\n${startCommand}\n`,
  { mode: 0o755 },
);

console.log(`Governed quickstart configuration written to ${configDir}`);
console.log(`Approver public key (for reference): ${approverBase}.public.pem`);
console.log("");
console.log(
  "Start the local server in its own terminal, then run the examples:",
);
console.log("");
console.log(startCommand);
console.log("");
console.log(`Or: bash ${join(configDir, "start-server.sh")}`);
console.log("");
console.log(
  `Set GOVERNED_CONFIG_DIR=${configDir} when you run the examples if you changed the default.`,
);
