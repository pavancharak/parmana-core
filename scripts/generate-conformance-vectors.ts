/**
 * Regenerates tests/conformance/vectors/parmana-core-<version>.json (RFC-0033, Phase 1).
 *
 * Usage: npx tsx scripts/generate-conformance-vectors.ts
 *
 * Commit the output with the change that caused it. The test in tests/conformance fails when the
 * committed file does not match a fresh build, so the vectors cannot drift silently.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Single-signature Ed25519 configuration, matching the test key the vectors are signed with.
// The key directory is set to an empty directory on purpose: the vectors use the test key only.
process.env.CRYPTO_MODE = "single";
process.env.PRIMARY_SIGNATURE_PROVIDER = "ed25519";
process.env.SECONDARY_SIGNATURE_PROVIDER = "";
process.env.HYBRID_SCHEMA_VERSION = "";

const { CryptoBootstrap } = await import("@parmana/crypto");
const { buildConformanceVectors, serializeVectors, VECTORS_FILE } =
  await import("../tests/conformance/build-vectors.js");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = path.join(root, VECTORS_FILE);

const vectors = await buildConformanceVectors(CryptoBootstrap.create());
writeFileSync(target, serializeVectors(vectors));
console.log(`wrote ${VECTORS_FILE} (${vectors.vectors.length} vectors)`);
