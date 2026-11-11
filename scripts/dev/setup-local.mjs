#!/usr/bin/env node
// One command for a local Parmana server, for development.
//
// Creates, once, what the quickstart creates by hand: the signing keys, the
// gateway keys, a local approver key, and a caller key for this machine. Then it
// starts the server with the settings a local run needs. Running it again reuses
// what exists. Local development only: it refuses to run with NODE_ENV=production.
//
// Usage:  npm run dev:setup
//
// The server listens on localhost:3000. Stop it with Ctrl+C.

import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const devDir = join(root, ".parmana-dev");
const keyDir = join(root, "keys");
const callerFile = join(devDir, "caller.json");

const APPROVER_ID = "local-test-approver";
const APPROVER_KEY_ID = "local-test-approver-key-1";
const approverPrivate = join(
  devDir,
  `${APPROVER_ID}__${APPROVER_KEY_ID}.private.pem`,
);
const approverPublic = join(
  devDir,
  `${APPROVER_ID}__${APPROVER_KEY_ID}.public.pem`,
);

const CALLER_ID = "dev";
const CAPABILITY = "test:fixture-execute";

if (process.env.NODE_ENV === "production") {
  console.error(
    "dev:setup: refusing to run with NODE_ENV=production. This is for local development only.",
  );
  process.exit(1);
}

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    env,
    shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(
      `dev:setup: "${command} ${args.join(" ")}" failed with exit code ${result.status}.`,
    );
    process.exit(1);
  }
}

function sha256Hex(text) {
  return createHash("sha256").update(text).digest("hex");
}

mkdirSync(devDir, { recursive: true });

// 0. The server runs from the built packages. Build them once, if they are missing.
if (!existsSync(join(root, "packages", "crypto", "dist", "index.js"))) {
  run("npm", ["run", "build"]);
}

// 1. Signing keys: default and gateway, in keys/.
if (!existsSync(join(keyDir, "default.private.pem"))) {
  run("npx", [
    "tsx",
    "scripts/generate-keypair.ts",
    "--algorithm",
    "ed25519",
    "--key-id",
    "default",
  ]);
}
if (!existsSync(join(keyDir, "gateway.private.pem"))) {
  run("npm", ["run", "generate:gateway-keys"]);
}

// 2. The local approver key: the stand-in for the person who approves.
if (!existsSync(approverPrivate)) {
  run("npx", [
    "tsx",
    "scripts/generate-approver-key.ts",
    "--approver-id",
    APPROVER_ID,
    "--key-id",
    APPROVER_KEY_ID,
    "--out-dir",
    devDir,
  ]);
}

// 3. A caller key for this machine. Only its SHA-256 hash goes to the server.
if (!existsSync(callerFile)) {
  const raw = randomBytes(24).toString("base64url");
  writeFileSync(
    callerFile,
    JSON.stringify({ raw, hash: sha256Hex(raw) }, null, 2) + "\n",
  );
}
const caller = JSON.parse(readFileSync(callerFile, "utf8"));

// 4. Start the server with the local settings.
const env = {
  ...process.env,
  NODE_ENV: "test",
  KILL_SWITCH_ENABLED: "false",
  PARMANA_STORAGE: "memory",
  PARMANA_KEY_DIR: keyDir,
  PARMANA_POLICY_DIR: join(root, "policies"),
  PARMANA_API_KEYS: JSON.stringify([
    {
      callerId: CALLER_ID,
      keyHash: caller.hash,
      allowedCapabilities: [CAPABILITY],
    },
  ]),
  PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE: approverPublic,
};

console.log("");
console.log("Parmana is starting at http://localhost:3000");
console.log(
  `Caller key:     ${callerFile}  (the "raw" value is the key your code sends)`,
);
console.log(
  `Approver key:   ${approverPrivate}  (the person who approves signs with this)`,
);
console.log("Stop the server with Ctrl+C.");
console.log("");

run("npm", ["run", "dev"], env);
