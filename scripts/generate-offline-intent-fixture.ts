import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";

import { ExecutionIntentCrypto } from "@parmana/crypto";
import type { ExecutionIntent } from "@parmana/shared";

/**
 * Generates real, TypeScript-signed Execution Intent fixtures plus their public
 * key, for the cross-language determinism proof of ADR-0012. The Python test
 * python/tests/test_offline_intent_verifier.py signs nothing itself: it reads
 * exactly what this script produces and proves the Python offline verifier can
 * independently verify it.
 *
 * Usage:
 *   npx tsx scripts/generate-offline-intent-fixture.ts <out-dir>
 *
 * Writes <out-dir>/intent.json (every optional field present, and a non ASCII
 * target so the canonical serializer's handling of non ASCII text is exercised),
 * <out-dir>/intent-minimal.json (no optional field, so the omission rule is
 * exercised) and <out-dir>/public-key.pem. Uses an ephemeral keypair and its own
 * PARMANA_VERIFICATION_KEY_ID so it never touches any other key material.
 */

const [outDir] = process.argv.slice(2);

if (!outDir) {
  console.error("Usage: generate-offline-intent-fixture.ts <out-dir>");
  process.exit(2);
}

const keyId = "cross-language-intent-fixture";
const { privateKey, publicKey } = generateKeyPairSync("ed25519");

process.env.PARMANA_KEY_DIR = outDir;
process.env.PARMANA_VERIFICATION_KEY_ID = keyId;
process.env.PARMANA_POLICY_DIR = outDir;

writeFileSync(
  `${outDir}/${keyId}.private.pem`,
  privateKey.export({ format: "pem", type: "pkcs8" }),
);
writeFileSync(
  `${outDir}/${keyId}.public.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);
writeFileSync(
  `${outDir}/public-key.pem`,
  publicKey.export({ format: "pem", type: "spki" }),
);

const crypto = new ExecutionIntentCrypto();
const at = new Date("2026-09-21T05:40:28.434Z");

async function signed(
  draft: Omit<ExecutionIntent, "intentHash" | "signature">,
): Promise<ExecutionIntent> {
  const unsigned = {
    ...draft,
    intentHash: "",
    signature: { algorithm: "ed25519", keyId, value: "", signedAt: at },
  } as ExecutionIntent;

  const withHash = { ...unsigned, intentHash: await crypto.hash(unsigned) };

  return { ...withHash, signature: await crypto.sign(withHash) };
}

const full = await signed({
  intentId: "fixture-intent-full",
  businessTransactionId: "fixture-tx-full",
  decisionId: "fixture-decision",
  authorizationId: "fixture-authorization",
  policyName: "customer-refund",
  policyVersion: "1.0.0",
  policyContentHash: "policy-content-hash",
  signalsHash: "signals-hash",
  businessTransactionHash: "business-transaction-hash",
  action: "paytm:refund",
  target: "order-café-1001",
  submittedBy: "caller-1",
  grantedCapability: "paytm:refund",
  createdAt: at,
});

const minimal = await signed({
  intentId: "fixture-intent-minimal",
  businessTransactionId: "fixture-tx-minimal",
  decisionId: "fixture-decision",
  authorizationId: "fixture-authorization",
  policyName: "customer-refund",
  policyVersion: "1.0.0",
  businessTransactionHash: "business-transaction-hash",
  action: "paytm:refund",
  target: "order-1002",
  createdAt: at,
});

writeFileSync(`${outDir}/intent.json`, JSON.stringify(full, null, 2));
writeFileSync(
  `${outDir}/intent-minimal.json`,
  JSON.stringify(minimal, null, 2),
);

console.log(
  `Wrote intent.json, intent-minimal.json and public-key.pem to ${outDir}`,
);
