import "dotenv/config";

import { spawn } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const root = path.resolve(__dirname, "..");

//
// examples/tutorials/09-rest-api is intentionally excluded: it
// POSTs to a live Parmana API server at PARMANA_API_URL /
// http://localhost:3000, which this runner does not start. Run it individually with a server already up — see
// examples/tutorials/09-rest-api/README.md.
//
const examples = [
  "examples/tutorials/01-hello-world/run.ts",
  "examples/tutorials/02-policy-evaluation/run.ts",
  "examples/tutorials/03-runtime-execution/run.ts",
  "examples/tutorials/04-policy-router/run.ts",
  "examples/tutorials/05-verification/run.ts",
  "examples/tutorials/06-replay/run.ts",
  "examples/tutorials/07-receipt-generation/run.ts",
  "examples/tutorials/08-human-approval/run.ts",
  "examples/tutorials/10-end-to-end/run.ts",
  "examples/tutorials/11-execution-authorization/run.ts",
  "examples/tutorials/12-envelope-verification/run.ts",
  "examples/tutorials/13-post-quantum-signatures/run.ts",
  "examples/tutorials/14-custom-policy/run.ts",
  "examples/tutorials/15-custom-runtime-component/run.ts",
  "examples/tutorials/16-runtime-pipeline/run.ts",
  "examples/tutorials/17-multi-policy-routing/run.ts",
  "examples/tutorials/18-runtime-hooks/run.ts",
  "examples/tutorials/19-runtime-composition/run.ts",
  "examples/tutorials/20-batch-execution/run.ts",
  "examples/tutorials/21-partial-failure-handling/run.ts",
  "examples/tutorials/22-idempotent-execution/run.ts",
  "examples/tutorials/23-production-deployment/run.ts",
  "examples/tutorials/24-sdk-integration-patterns/run.ts",
  "examples/tutorials/25-execution-permit-generation/run.ts",
  "examples/tutorials/26-execution-authorization-verification/run.ts",
  "examples/tutorials/27-authorization-expiration/run.ts",
  "examples/tutorials/28-envelope-replay-detection/run.ts",
  "examples/tutorials/29-authorization-tampering/run.ts",
  "examples/tutorials/30-policy-version-pinning/run.ts",
  "examples/tutorials/31-authorization-binding/run.ts",
  "examples/tutorials/32-execution-pipeline/run.ts",
  "examples/tutorials/33-execution-boundary/run.ts",
  "examples/tutorials/34-execution-gateway/run.ts",
  "examples/tutorials/35-replay-attack/run.ts",
  "examples/tutorials/36-parameter-tampering/run.ts",
  "examples/tutorials/37-action-substitution/run.ts",
  "examples/tutorials/38-target-substitution/run.ts",
  "examples/tutorials/39-policy-substitution/run.ts",
  "examples/tutorials/40-signature-forgery/run.ts",
  "examples/tutorials/41-expired-authorization/run.ts",
  "examples/tutorials/42-nonce-reuse/run.ts",
  "examples/tutorials/43-stolen-authorization/run.ts",
  "examples/tutorials/44-direct-api-bypass/run.ts",
  "examples/tutorials/45-connector-bypass/run.ts",
  "examples/tutorials/46-toctou-protection/run.ts",
  "examples/tutorials/47-canonical-json/run.ts",
  "examples/tutorials/48-deterministic-hashing/run.ts",
  "examples/tutorials/49-detached-signatures/run.ts",
  "examples/tutorials/50-ed25519/run.ts",

  "examples/tutorials/53-execution-permit/run.ts",
  "examples/tutorials/54-execution-receipt/run.ts",
  "examples/tutorials/55-execution-receipt-verification/run.ts",
  "examples/tutorials/56-complete-execution-flow/run.ts",
  "examples/tutorials/51-dilithium3/run.ts",
  "examples/tutorials/52-hybrid-signatures/run.ts",
  "examples/tutorials/57-credential-isolation/run.ts",
  "examples/tutorials/58-session-credentials/run.ts",
  "examples/tutorials/59-secure-connectors/run.ts",
  "examples/tutorials/60-end-to-end-enterprise-execution/run.ts",
  "examples/tutorials/62-signal-intent-binding/run.ts",
  "examples/tutorials/69-hubspot-deal-update-connector/run.ts",
  "examples/tutorials/70-hubspot-policy-denial/run.ts",
  "examples/tutorials/71-hubspot-signal-state-verification/run.ts",
  "examples/tutorials/72-hubspot-approval-artifact/run.ts",
  "examples/tutorials/73-refusal-records/run.ts",
  "examples/tutorials/74-refusal-record-fail-open/run.ts",
  "examples/tutorials/75-signed-audit-events/run.ts",
  "examples/tutorials/76-caller-principal-scoping/run.ts",
  "examples/tutorials/77-caller-ownership-scoping/run.ts",
  "examples/tutorials/78-duplicate-transaction-race/run.ts",
  "examples/tutorials/79-storage-backend-selection/run.ts",
  "examples/tutorials/80-fail-closed-config-validation/run.ts",
  "examples/tutorials/81-connector-execution-gateway/run.ts",
  "examples/tutorials/82-composite-signal-state-verification/run.ts",
  "examples/tutorials/83-capability-policy-binding/run.ts",
  "examples/tutorials/84-caller-authentication/run.ts",
  "examples/tutorials/86-gateway-attestation/run.ts",
  "examples/tutorials/87-key-provider-path-traversal/run.ts",
  "examples/tutorials/88-malformed-request-handling/run.ts",
  "examples/tutorials/89-readiness-probe/run.ts",
  "examples/tutorials/90-openapi-self-description/run.ts",
  "examples/tutorials/91-graceful-shutdown/run.ts",
  "examples/tutorials/92-public-api-boundary/run.ts",
  "examples/tutorials/93-trust-record-ordering/run.ts",
  "examples/tutorials/94-sdk-http-transport/run.ts",
  "examples/tutorials/95-approval-verifier-generic/run.ts",
  "examples/tutorials/96-github-pr-merge-connector/run.ts",
  "examples/tutorials/97-execution-chain-integrity/run.ts",
  "examples/tutorials/98-signal-freshness-enforcement/run.ts",
  "examples/tutorials/99-key-algorithm-binding-guard/run.ts",
  "examples/tutorials/100-authorization-caller-type-agnostic/run.ts",
  "examples/tutorials/101-fail-closed-caller-audit-writes/run.ts",
  "examples/tutorials/102-distinguishable-http-status/run.ts",
  "examples/tutorials/103-policy-governance-maker-checker/run.ts",
  "examples/tutorials/104-policy-governance-execution-verification/run.ts",
  "examples/tutorials/105-tenant-key-isolation/run.ts",
  "examples/tutorials/106-api-key-issuance/run.ts",
  "examples/tutorials/107-offline-verification/run.ts",
  "examples/tutorials/108-public-key-discovery/run.ts",
  "examples/tutorials/109-durable-evidence-key-rotation/run.ts",
  "examples/tutorials/110-hybrid-signature-downgrade-protection/run.ts",
  "examples/tutorials/111-connect-an-agent/run.ts",
  "examples/tutorials/112-slack-connector/run.ts",
  "examples/tutorials/113-kms-key-id-resolution/run.ts",
  "examples/tutorials/114-signing-verification-key-agreement/run.ts",
  "examples/tutorials/115-per-limiter-rate-limit-stores/run.ts",
  "examples/tutorials/116-supabase-policy-repository/run.ts",
  "examples/tutorials/117-maker-checker-one-shot-scripts/run.ts",
  "examples/tutorials/118-hubspot-verifier-signer/run.ts",
  "examples/tutorials/119-human-approval-for-one-action/run.ts",
  "examples/tutorials/120-no-action-without-approval/run.ts",
  "examples/tutorials/121-approval-for-a-read/run.ts",
  "examples/tutorials/122-approval-for-a-post-and-an-update/run.ts",
  "examples/tutorials/123-external-connector/run.ts",
  "examples/scenarios/expense-approval/run.ts",
  "examples/scenarios/purchase-order/run.ts",
  "examples/04-verified-execution/run.ts",
];

//
// A fresh clone has no .env and no keys/, and most examples refuse to
// start without a policy directory, a storage mode and signing keys.
// So the runner fills in local, offline defaults for anything that is
// not already set. Values from the environment or from .env (loaded
// above, before these defaults) always win, so an existing setup runs
// exactly as before.
//
const LOCAL_DEFAULTS: Record<string, string> = {
  PARMANA_POLICY_DIR: "./policies",
  PARMANA_STORAGE: "memory",
  KEY_PROVIDER: "local",
  PRIMARY_SIGNATURE_PROVIDER: "ed25519",
};

const appliedDefaults: string[] = [];

for (const [name, value] of Object.entries(LOCAL_DEFAULTS)) {
  if (!process.env[name]) {
    process.env[name] = value;
    appliedDefaults.push(`${name}=${value}`);
  }
}

//
// Without PARMANA_KEY_DIR, sign with throwaway Ed25519 keys in a temp
// directory that is deleted afterwards. Never writes into ./keys.
//
let throwawayKeyDir: string | undefined;

if (!process.env.PARMANA_KEY_DIR) {
  throwawayKeyDir = mkdtempSync(path.join(tmpdir(), "parmana-example-keys-"));

  for (const keyId of ["default", "gateway"]) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");

    writeFileSync(
      path.join(throwawayKeyDir, `${keyId}.private.pem`),
      privateKey.export({ format: "pem", type: "pkcs8" }),
    );
    writeFileSync(
      path.join(throwawayKeyDir, `${keyId}.public.pem`),
      publicKey.export({ format: "pem", type: "spki" }),
    );
  }

  process.env.PARMANA_KEY_DIR = throwawayKeyDir;
  appliedDefaults.push(
    `PARMANA_KEY_DIR=<throwaway keys in ${throwawayKeyDir}>`,
  );
}

async function run(example: string): Promise<void> {
  console.log();
  console.log("============================================================");
  console.log(`Running ${example}`);
  console.log("============================================================");
  console.log();

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["./node_modules/tsx/dist/cli.mjs", path.join(root, example)],
      {
        cwd: root,
        stdio: "inherit",
      },
    );

    child.on("error", reject);

    child.on("exit", (code) => {
      if (code === 0) {
        console.log(`✓ ${example} completed.`);
        resolve();
      } else {
        reject(new Error(`${example} failed with exit code ${code}.`));
      }
    });
  });
}

async function main(): Promise<void> {
  console.log();
  console.log("============================================================");
  console.log("Parmana Example Runner");
  console.log("============================================================");

  if (appliedDefaults.length > 0) {
    console.log();
    console.log("Not set in the environment or .env, so using local defaults:");
    for (const entry of appliedDefaults) console.log(`  ${entry}`);
  }

  for (const example of examples) {
    await run(example);
  }

  console.log();
  console.log("============================================================");
  console.log("✓ All Parmana examples completed successfully.");
  console.log("============================================================");
}

main()
  .catch((error) => {
    console.error();
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    if (throwawayKeyDir) {
      rmSync(throwawayKeyDir, { recursive: true, force: true });
    }
  });
