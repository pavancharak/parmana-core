import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

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
 * Deterministic, once-per-worker .env load (G-14).
 *
 * Every vitest worker gets its own snapshot of process.env, so whether a
 * given test file "sees" SUPABASE_URL used to depend on whether that
 * file's own import graph happened to transitively trigger the
 * dotenv.config() side effect inside packages/shared/src/config/Config.ts
 * — a coincidence of import order, not a real gate decision. Loading here
 * instead, in the one file every worker always runs first, makes env
 * visibility identical across all workers regardless of which test files
 * they happen to execute. override:false matches Config.ts's own
 * dotenv.config() call, so neither load can clobber the other or an
 * already-set shell env var.
 */
const repoRoot = dirname(fileURLToPath(import.meta.url));

dotenv.config({
  path: join(repoRoot, ".env"),
  override: false,
});

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
