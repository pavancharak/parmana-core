import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

import {
  CryptoBootstrap,
  FileKeyProvider,
  HybridSignatureProvider,
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
} from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 52 - Hybrid Signatures");
  console.log("==================================================");
  console.log();

  //
  // Business artifact.
  //
  const artifact = {
    vendorId: "VENDOR-1001",
    invoiceId: "INV-2026-001",
    paymentAmount: 25000,
    currency: "USD",
  };

  //
  // Hybrid crypto configuration.
  //
  // CryptoBootstrap.createHybrid() builds both a primary
  // (PRIMARY_SIGNATURE_PROVIDER, defaults to ed25519) and a
  // secondary (SECONDARY_SIGNATURE_PROVIDER) provider together.
  // Overridden here so this tutorial is self-contained.
  //
  process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";

  if (!isMlDsa65Supported()) {
    console.log(`Skipping Tutorial 52: ${ML_DSA_65_SKIP_REASON}`);
    return;
  }

  //
  // Load signing keys. "default-secondary" is the real,
  // current convention for the secondary key -- see
  // `npm run generate:hybrid-secondary-key` -- living alongside
  // the "default" Ed25519 key under the same PARMANA_KEY_DIR.
  // Self-provisioned here if this checkout hasn't generated one
  // yet, so this tutorial runs on a fresh clone.
  //
  const keyDir = process.env.PARMANA_KEY_DIR ?? "./keys";
  const secondaryPrivatePath = join(keyDir, "default-secondary.private.pem");
  const secondaryPublicPath = join(keyDir, "default-secondary.public.pem");

  if (!existsSync(secondaryPrivatePath)) {
    const { privateKey, publicKey } = generateKeyPairSync("ml-dsa-65");

    writeFileSync(
      secondaryPrivatePath,
      privateKey.export({ format: "pem", type: "pkcs8" }),
    );
    writeFileSync(
      secondaryPublicPath,
      publicKey.export({ format: "pem", type: "spki" }),
    );
  }

  const crypto = CryptoBootstrap.createHybrid();

  const keyProvider = new FileKeyProvider();

  //
  // Sign with both algorithms, fail-closed.
  //
  // HybridSignatureProvider is the real class CRYPTO_MODE=hybrid
  // uses internally (VerificationCrypto.signHybrid(),
  // ReceiptCrypto.createReceipt()) to dual-sign Execution Trust
  // Records and Receipts -- see Tutorial 53.
  //
  const hybridSigner = new HybridSignatureProvider(crypto, keyProvider);

  const signatures = await hybridSigner.sign(
    artifact,
    "default",
    "default-secondary",
  );

  //
  // Verify. Requires exactly one entry per algorithm --
  // a missing, extra, or wrong-algorithm entry rejects,
  // never a partial pass.
  //
  const verified = await hybridSigner.verify(artifact, signatures);

  console.log("Hybrid Signatures");

  console.log("--------------------------------------------------");

  for (const signature of signatures) {
    console.log();

    console.log(`Algorithm : ${signature.algorithm}`);

    console.log(`Key ID    : ${signature.keyId}`);

    console.log(`Length    : ${signature.signature.length} characters`);

    console.log(`Preview   : ${signature.signature.substring(0, 80)}...`);
  }

  console.log();

  console.log(`Verified : ${verified}`);

  console.log();

  if (verified) {
    console.log("✓ Hybrid signatures verified.");
  } else {
    console.log("✗ Verification failed.");
  }

  console.log();

  //
  // Fail-closed demonstration: tamper with the second
  // signature and confirm verification rejects the whole
  // artifact, not just a partial pass.
  //
  const tampered = signatures.map((entry, index) =>
    index === 1
      ? { ...entry, signature: `${entry.signature.slice(0, -4)}AAAA` }
      : entry,
  );

  const tamperedVerified = await hybridSigner.verify(artifact, tampered);

  console.log(`Tampered second signature verified : ${tamperedVerified}`);

  console.log();

  if (!tamperedVerified) {
    console.log("✓ Tampered signature correctly rejected.");
  } else {
    console.log("✗ Tampered signature was not rejected.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
