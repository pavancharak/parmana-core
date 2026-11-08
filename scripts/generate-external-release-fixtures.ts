/**
 * Regenerates the external-release fixtures that parmana-connect verifies in
 * tests/fixtures/parmana-core. Run from the repository root:
 *
 *   npx tsx scripts/generate-external-release-fixtures.ts <output-dir>
 *
 * The output directory receives core-release-small.json, core-release-large.json
 * and core-public-key.txt. Copy them into parmana-connect's fixtures folder.
 *
 * TEST-ONLY KEY. The signing key is derived from a public label, so anyone can
 * reproduce it and sign releases that look like Parmana's. It must never be
 * trusted in production. parmana-connect pins the expected key fingerprint in
 * production (PARMANA_EXPECTED_KEY_FINGERPRINT) so that cannot happen by accident.
 *
 * Releases are built the way GatewayExternalAdapter builds them: the same
 * fields, a lifetime no longer than EXTERNAL_RELEASE_TTL_MS, and the signature
 * over CanonicalSerializer bytes. A release over 4096 bytes is signed as a
 * commitment, as KmsSigner does (ADR-0010).
 */
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  CanonicalSerializer,
  commitmentMessage,
  requiresCommitment,
} from "@parmana/crypto";

import { EXTERNAL_RELEASE_TTL_MS } from "../packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.js";

const LABEL = "parmana-test-only external release key v1";
const AUDIENCE = "https://parmana-connect.example.com/execute";
const KEY_ID = "default";

// Fixed timestamps, so the output is identical on every run. The verifier in
// parmana-connect is tested at 06:00:00, inside this 60 s window.
const ISSUED_AT = "2026-10-29T05:59:30.000Z";
const EXPIRES_AT = "2026-10-29T06:00:30.000Z";

// PKCS#8 wrapper for a raw 32-byte Ed25519 seed.
const PKCS8_ED25519_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function testKey() {
  const seed = createHash("sha256").update(LABEL, "utf8").digest();
  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  return { privateKey, publicKey: createPublicKey(privateKey) };
}

function release(businessTransactionId: string, note: string) {
  return {
    version: 1,
    connectorId: "ext-example:item-fetch",
    audience: AUDIENCE,
    businessTransactionId,
    authorizationId: "66666666-7777-4888-8999-aaaaaaaaaaaa",
    capability: "example:item-fetch",
    target: "items/123",
    parameters: { itemId: "123", note, unicode: "naïve ✓" },
    policy: { name: "policy-a", version: "1.0.0" },
    approvedBy: [],
    issuedAt: ISSUED_AT,
    expiresAt: EXPIRES_AT,
  };
}

function signRelease(
  body: ReturnType<typeof release>,
  privateKey: ReturnType<typeof testKey>["privateKey"],
) {
  const bytes = Buffer.from(new CanonicalSerializer().serialize(body));
  const commitment = requiresCommitment(bytes);
  const message = commitment ? Buffer.from(commitmentMessage(bytes)) : bytes;
  const value = sign(null, message, privateKey).toString("base64");
  return {
    fixture: {
      release: body,
      signature: { algorithm: "ed25519", keyId: KEY_ID, value },
      bytes: bytes.length,
      commitment,
    },
    bytes,
    message,
    value,
  };
}

/** The checks parmana-connect applies, repeated here so a bad fixture never gets written. */
function assertIssuable(
  body: ReturnType<typeof release>,
  bytes: Buffer,
  message: Buffer,
  value: string,
  publicKey: ReturnType<typeof testKey>["publicKey"],
) {
  const lifetime = Date.parse(body.expiresAt) - Date.parse(body.issuedAt);
  if (lifetime <= 0 || lifetime > EXTERNAL_RELEASE_TTL_MS) {
    throw new Error(
      `fixture lifetime ${lifetime} ms is outside (0, ${EXTERNAL_RELEASE_TTL_MS}]`,
    );
  }
  if (!verify(null, message, publicKey, Buffer.from(value, "base64"))) {
    throw new Error(
      `fixture signature does not verify for ${body.businessTransactionId}`,
    );
  }
  if (bytes.length <= 0) throw new Error("empty canonical bytes");
}

function main(): void {
  const outDir = process.argv[2];
  if (outDir === undefined) {
    console.error(
      "usage: tsx scripts/generate-external-release-fixtures.ts <output-dir>",
    );
    process.exit(2);
  }
  const { privateKey, publicKey } = testKey();

  // Large: canonical bytes above 4096, so it is signed as a commitment.
  const small = signRelease(
    release("fixture-small", "x".repeat(80)),
    privateKey,
  );
  const large = signRelease(
    release("fixture-large", "y".repeat(4500)),
    privateKey,
  );

  if (small.fixture.commitment !== false)
    throw new Error("small fixture must be signed raw");
  if (large.fixture.commitment !== true)
    throw new Error("large fixture must be signed as a commitment");

  assertIssuable(
    small.fixture.release,
    small.bytes,
    small.message,
    small.value,
    publicKey,
  );
  assertIssuable(
    large.fixture.release,
    large.bytes,
    large.message,
    large.value,
    publicKey,
  );

  const dir = resolve(outDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "core-release-small.json"),
    `${JSON.stringify(small.fixture, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "core-release-large.json"),
    `${JSON.stringify(large.fixture, null, 2)}\n`,
  );
  writeFileSync(
    join(dir, "core-public-key.txt"),
    publicKey.export({ type: "spki", format: "pem" }).toString(),
  );

  console.log(`wrote 3 files to ${dir}`);
  console.log(`small: ${small.fixture.bytes} bytes, raw`);
  console.log(`large: ${large.fixture.bytes} bytes, commitment`);
}

main();
