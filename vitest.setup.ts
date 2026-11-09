// Tests must not read a developer's local .env: it would leak values into tests
// that expect them unset. Loaders check this flag before reading any file.
process.env.PARMANA_SKIP_DOTENV = "1";

import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import {
  describeDatabaseTarget,
  resolveDatabaseTarget,
  resolveDatabaseUrlTarget,
} from "./test-support/database-target.js";
import { loadTestEnvironment } from "./test-support/load-test-environment.js";

import { afterAll, vi } from "vitest";

/**
 * The hermetic test approver (test-support/approvals.ts) is trusted by
 * the API's approval issuer registry in every test file, ahead of the
 * real registry. No agent action is authorized without a signed human
 * approval, so a test that expects an approved action signs one with
 * withTestApproval(). A test file that mocks this module itself keeps
 * its own mock.
 */
vi.mock(
  "./packages/api/src/bootstrap/createApprovalIssuerRegistry.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("./packages/api/src/bootstrap/createApprovalIssuerRegistry.js")
      >();
    const { testApprovalIssuerRegistry } =
      await import("./test-support/approvals.js");

    return {
      ...actual,
      createApprovalIssuerRegistry: (
        ...args: Parameters<typeof actual.createApprovalIssuerRegistry>
      ) => {
        const real = actual.createApprovalIssuerRegistry(...args);
        const test = testApprovalIssuerRegistry();

        return Object.assign(Object.create(real), {
          resolve: async (approverId: string, keyId: string) =>
            test.resolve(approverId, keyId) ??
            (await real.resolve(approverId, keyId)),
        });
      },
    };
  },
);

/**
 * Once-per-worker test settings (G-14).
 *
 * Every vitest worker gets its own snapshot of process.env. Loading the
 * test settings here, in the one file every worker runs first, makes env
 * visibility identical across all workers. override:false means a value
 * already set in the shell wins over .env.test.
 *
 * Only .env.test is read. .env holds the production settings and is never
 * loaded by a test run (docs/internal/designs/TEST-DATABASE-CONFIG.md, D2).
 */
const repoRoot = dirname(fileURLToPath(import.meta.url));

// Test-only settings (gitignored, copied from .env.test.example). The only
// file a test run reads for database settings. .env is deliberately NOT loaded
// here: it holds the production settings, and a test run must never see them
// (docs/internal/designs/TEST-DATABASE-CONFIG.md, decision D2).
loadTestEnvironment(repoRoot);

// Refuse the run before any suite starts if a database variable names a target
// the rules do not allow (decisions D3 and D4). Every variable is checked, not only
// the one a run uses. Logs the target without its connection string.
for (const name of ["TEST_DATABASE_URL", "DATABASE_URL"] as const) {
  resolveDatabaseUrlTarget(process.env[name] ?? "", process.env);
}
const databaseTarget = resolveDatabaseTarget(process.env);
if (databaseTarget.kind !== "none") {
  // Suites read TEST_DATABASE_URL, and PostgresPoolFactory reads DATABASE_URL. Both are set to the one
  // validated target, so no suite can reach a different database.
  process.env.TEST_DATABASE_URL = databaseTarget.url;
  process.env.DATABASE_URL = databaseTarget.url;
}
console.info(describeDatabaseTarget(databaseTarget));

/**
 * Local defaults, so `npm test` works on a fresh clone with no .env.
 * They match the job level env in .github/workflows/ci.yml and apply
 * only when a variable is not already set by the shell or .env.
 */
const LOCAL_TEST_DEFAULTS: Record<string, string> = {
  PARMANA_POLICY_DIR: "./policies",
  PARMANA_STORAGE: "memory",
  KEY_PROVIDER: "local",
  PRIMARY_SIGNATURE_PROVIDER: "ed25519",
  // Explicit opt-in: unit and integration tests run without governance records.
  PARMANA_ALLOW_UNGOVERNED_POLICY: "true",
};

for (const [name, value] of Object.entries(LOCAL_TEST_DEFAULTS)) {
  process.env[name] ??= value;
}

/**
 * Global hermetic key material.
 *
 * Every test file gets its own temporary Ed25519 keypair.
 * Both the Runtime signer and the Execution Gateway verifier
 * are configured to use this same keypair.
 */
const keyDir = mkdtempSync(join(tmpdir(), "parmana-vitest-keys-"));

const { privateKey, publicKey } = generateKeyPairSync("ed25519");

writeFileSync(
  join(keyDir, "default.private.pem"),
  privateKey.export({
    format: "pem",
    type: "pkcs8",
  }),
);

writeFileSync(
  join(keyDir, "default.public.pem"),
  publicKey.export({
    format: "pem",
    type: "spki",
  }),
);

/**
 * Separate hermetic keypair for the Execution Gateway's attestation
 * signing (createGatewayKeyPair.ts), distinct from the authorization
 * keypair above — same trust-domain separation as production.
 */
const gatewayKeyPair = generateKeyPairSync("ed25519");

writeFileSync(
  join(keyDir, "gateway.private.pem"),
  gatewayKeyPair.privateKey.export({
    format: "pem",
    type: "pkcs8",
  }),
);

writeFileSync(
  join(keyDir, "gateway.public.pem"),
  gatewayKeyPair.publicKey.export({
    format: "pem",
    type: "spki",
  }),
);

/**
 * Verifier key (verifierKeyId.ts): signs the read-only signal fetches.
 */
const verifierKeys = generateKeyPairSync("ed25519");
writeFileSync(
  join(keyDir, "signal-verifier.private.pem"),
  verifierKeys.privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  join(keyDir, "signal-verifier.public.pem"),
  verifierKeys.publicKey.export({ format: "pem", type: "spki" }),
);

/**
 * Runtime (FileKeyProvider)
 */
process.env.PARMANA_KEY_DIR = keyDir;

/**
 * Compatibility if loadConfig() uses KEY_DIRECTORY.
 */
process.env.KEY_DIRECTORY = keyDir;

/**
 * Execution Gateway
 */
process.env.PUBLIC_KEY_PATH = join(keyDir, "default.public.pem");

afterAll(() => {
  rmSync(keyDir, {
    recursive: true,
    force: true,
  });
});
