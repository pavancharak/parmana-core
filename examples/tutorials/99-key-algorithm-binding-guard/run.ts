import { generateKeyPairSync } from "node:crypto";

import { isMlDsa65Supported, ML_DSA_65_SKIP_REASON } from "@parmana/crypto";

//
// Ed25519SignatureProvider/Dilithium3SignatureProvider and CryptoError
// (packages/crypto/src/) are imported here via relative path into source,
// the same way packages/crypto/tests/unit/signature-provider.test.ts does
// -- deliberately, since assertKeyType (the internal guard this tutorial
// is about) is not part of @parmana/crypto's public entry point (see
// Tutorial 92's architecture guard for why that boundary matters).
// CryptoError specifically must come from this same source path, not the
// public package's compiled dist, or `instanceof` below would compare two
// different module instances of the same class and always fail.
//
const { CryptoError } =
  await import("../../../packages/crypto/src/errors/CryptoError.js");
const { Ed25519SignatureProvider } =
  await import("../../../packages/crypto/src/providers/signature/Ed25519SignatureProvider.js");
const { Dilithium3SignatureProvider } =
  await import("../../../packages/crypto/src/providers/signature/Dilithium3SignatureProvider.js");

const data = Buffer.from("payload bytes to sign");

console.log();
console.log("==================================================");
console.log("Tutorial 99 - Key/Algorithm Binding Guard");
console.log("==================================================");
console.log();

console.log(
  "node:crypto's sign()/verify() dispatch on the key's own asymmetricKeyType,",
);
console.log(
  "not on which SignatureProvider happens to be configured. Without a guard,",
);
console.log(
  "a dilithium3-configured process holding Ed25519 PEMs on disk would silently",
);
console.log('sign with Ed25519 while labeling the envelope "dilithium3".');
console.log();

console.log("Scenario 1: Dilithium3SignatureProvider given an Ed25519 key");
console.log("--------------------------------------------------");

const ed25519Provider = new Ed25519SignatureProvider();
const dilithium3Provider = new Dilithium3SignatureProvider();

const { privateKey: ed25519PrivateKey, publicKey: ed25519PublicKey } =
  generateKeyPairSync("ed25519");

let scenario1Error: string | undefined;
let scenario1IsCryptoError = false;
try {
  await dilithium3Provider.sign(data, ed25519PrivateKey);
  console.log("✗ Expected sign() to reject the wrong key type.");
} catch (error) {
  scenario1IsCryptoError = error instanceof CryptoError;
  scenario1Error = error instanceof Error ? error.message : String(error);
  console.log(
    `✓ Rejected (CryptoError: ${scenario1IsCryptoError}): ${scenario1Error}`,
  );
}
console.log();

console.log(
  "Scenario 2: Dilithium3SignatureProvider.verify() given an Ed25519 public key",
);
console.log("--------------------------------------------------");

let scenario2Error: string | undefined;
try {
  await dilithium3Provider.verify(
    data,
    "irrelevant-signature",
    ed25519PublicKey,
  );
  console.log("✗ Expected verify() to reject the wrong key type.");
} catch (error) {
  scenario2Error = error instanceof Error ? error.message : String(error);
  console.log(`✓ Rejected: ${scenario2Error}`);
}
console.log();

console.log(
  `Scenario 3: Ed25519SignatureProvider given an ML-DSA-65 key${
    isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`
  }`,
);
console.log("--------------------------------------------------");

let scenario3Error: string | undefined;
let scenario3Skipped = false;
if (isMlDsa65Supported()) {
  const { privateKey: mldsaPrivateKey } = generateKeyPairSync("ml-dsa-65");
  try {
    await ed25519Provider.sign(data, mldsaPrivateKey);
    console.log("✗ Expected sign() to reject the wrong key type.");
  } catch (error) {
    scenario3Error = error instanceof Error ? error.message : String(error);
    console.log(`✓ Rejected: ${scenario3Error}`);
  }
} else {
  scenario3Skipped = true;
  console.log(`(skipped: ${ML_DSA_65_SKIP_REASON})`);
}
console.log();

console.log(
  "Scenario 4: A correctly matched key still signs and verifies normally",
);
console.log("--------------------------------------------------");

const signature = await ed25519Provider.sign(data, ed25519PrivateKey);
const verified = await ed25519Provider.verify(
  data,
  signature,
  ed25519PublicKey,
);
console.log(`Signed and verified with the correct key type: ${verified}`);
console.log();

const allPassed =
  scenario1IsCryptoError &&
  scenario1Error?.includes(
    'expected a "ml-dsa-65" key but received "ed25519"',
  ) === true &&
  scenario2Error?.includes(
    'expected a "ml-dsa-65" key but received "ed25519"',
  ) === true &&
  (scenario3Skipped ||
    scenario3Error?.includes(
      'expected a "ed25519" key but received "ml-dsa-65"',
    ) === true) &&
  verified === true;

if (allPassed) {
  console.log(
    "✓ Signing or verifying with the wrong key type fails closed, naming both the expected and actual key type; a correctly matched key is unaffected.",
  );
} else {
  console.log(
    "✗ Expected every mismatched key type to be rejected and the matched case to still work.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 100 - Authorization Is Caller-Type-Agnostic");
