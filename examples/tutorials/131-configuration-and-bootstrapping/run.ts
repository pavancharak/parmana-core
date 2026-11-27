import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadConfig } from "@parmana/shared";

import { assertSigningKeyMaterialConfigured } from "../../../packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.js";
import { assertStorageConfigured } from "../../../packages/api/src/bootstrap/assertStorageConfigured.js";

//
// Configuration and bootstrapping: what a deployment must have before it starts.
//
// The server reads its configuration once, at startup, and refuses to start
// unless every setting it needs is present and valid. Each bad setting below is
// refused with a message that names the variable, before the port is bound. A
// deployment that fails here fails in seconds with a clear message, not hours
// later on its first real request.
//
// The bootstrap checks skip themselves under NODE_ENV=test, which the examples
// runner sets. This tutorial sets NODE_ENV=production for those checks only, so
// they run as they would in a deployment, and restores it afterwards.
//
// Hermetic: a temporary key directory, removed at the end. No network calls.
//

const ORIGINAL_ENV = { ...process.env };

const keyDirectory = mkdtempSync(path.join(tmpdir(), "parmana-131-keys-"));
const emptyKeyDirectory = mkdtempSync(
  path.join(tmpdir(), "parmana-131-empty-"),
);
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(
  path.join(keyDirectory, "default.private.pem"),
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  path.join(keyDirectory, "default.public.pem"),
  publicKey.export({ format: "pem", type: "spki" }),
);

const VALID = {
  PARMANA_POLICY_DIR: "./policies",
  PARMANA_STORAGE: "memory",
  KEY_PROVIDER: "local",
  PARMANA_KEY_DIR: keyDirectory,
  PRIMARY_SIGNATURE_PROVIDER: "ed25519",
};

/** Runs check with the given variables set (undefined removes one), then restores the environment. */
function withEnv(
  overrides: Record<string, string | undefined>,
  check: () => void,
): { refused: boolean; message: string } {
  const saved = { ...process.env };
  try {
    for (const [name, value] of Object.entries({
      ...VALID,
      NODE_ENV: "production",
      ...overrides,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    check();
    return { refused: false, message: "started" };
  } catch (error) {
    return { refused: true, message: (error as Error).message };
  } finally {
    for (const key of Object.keys(process.env)) {
      if (!(key in saved)) delete process.env[key];
    }
    Object.assign(process.env, saved);
  }
}

interface Scenario {
  readonly label: string;
  readonly expectRefused: boolean;
  readonly mentions: string | undefined;
  readonly result: { refused: boolean; message: string };
}
const scenarios: Scenario[] = [];

function run(
  label: string,
  expectRefused: boolean,
  mentions: string | undefined,
  overrides: Record<string, string | undefined>,
  check: () => void,
): void {
  const result = withEnv(overrides, check);
  scenarios.push({ label, expectRefused, mentions, result });
  console.log(label);
  console.log(
    `  ${result.refused ? "REFUSED " : "STARTED "}  ${result.message.split("\n")[0]}`,
  );
  console.log();
}

console.log("Tutorial 131: configuration and bootstrapping");
console.log();

// 1. A complete configuration: every section loads, and the server may start.
run(
  "1. A complete local configuration: loads, and the signing keys are present",
  false,
  undefined,
  {},
  () => {
    const config = loadConfig();
    const sections = Object.keys(config);
    if (sections.length !== 12) {
      throw new Error(`expected 12 config sections, got ${sections.length}`);
    }
    assertSigningKeyMaterialConfigured();
  },
);

// 2. The policy directory is not set: the server cannot evaluate any policy, so it refuses.
run(
  "2. PARMANA_POLICY_DIR not set: refused, the server cannot evaluate policies without it",
  true,
  "PARMANA_POLICY_DIR",
  { PARMANA_POLICY_DIR: undefined },
  () => loadConfig(),
);

// 3. An unknown storage provider is rejected by name, never defaulted.
run(
  "3. PARMANA_STORAGE set to an unknown value: refused, named, never defaulted",
  true,
  "PARMANA_STORAGE",
  { PARMANA_STORAGE: "sqlite" },
  () => loadConfig(),
);

// 4. Postgres storage with no database URL: refused before the port binds.
run(
  "4. PARMANA_STORAGE=postgres with no DATABASE_URL: refused at startup",
  true,
  "DATABASE_URL",
  { PARMANA_STORAGE: "postgres", DATABASE_URL: undefined },
  () => assertStorageConfigured(),
);

// 5. An empty key directory: refused now, not on the first signature.
run(
  "5. An empty signing key directory: refused at startup, not on the first request",
  true,
  "default",
  { PARMANA_KEY_DIR: emptyKeyDirectory },
  () => assertSigningKeyMaterialConfigured(),
);

// 6. A signature algorithm the KMS signer does not support: refused before the action runs.
run(
  "6. KEY_PROVIDER=aws-kms with PRIMARY_SIGNATURE_PROVIDER=dilithium3: refused, KMS supports ed25519 only",
  true,
  "ed25519",
  { KEY_PROVIDER: "aws-kms", PRIMARY_SIGNATURE_PROVIDER: "dilithium3" },
  () => assertSigningKeyMaterialConfigured(),
);

rmSync(keyDirectory, { recursive: true, force: true });
rmSync(emptyKeyDirectory, { recursive: true, force: true });
process.env = ORIGINAL_ENV;

const failed = scenarios.filter(
  (s) =>
    s.result.refused !== s.expectRefused ||
    (s.mentions !== undefined && !s.result.message.includes(s.mentions)),
);

if (failed.length > 0) {
  for (const s of failed) console.log(`✗ ${s.label}`);
  process.exitCode = 1;
} else {
  console.log(
    `✓ All ${scenarios.length} scenarios behaved as the bootstrap rules require.`,
  );
}

console.log();
console.log("Tutorial Complete");
