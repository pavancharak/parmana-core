import {
  ArtifactSigner,
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  SignatureVerifier,
  FileKeyProvider,
} from "@parmana/crypto";

import { FileKeyProvider } from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 49 - Detached Signatures");
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
  // Load Parmana signing keys.
  //
  const keyProvider = new FileKeyProvider();

  const privateKey = await keyProvider.getPrivateKey(DEFAULT_KEY_ID);

  const publicKey = await keyProvider.getPublicKey(DEFAULT_KEY_ID);

  //
  // Crypto services.
  //
  const crypto = CryptoBootstrap.create();

  const signer = new ArtifactSigner(crypto);

  const verifier = new SignatureVerifier(crypto);

  //
  // Detached signature.
  //
  const signature = await signer.sign(artifact, privateKey);

  const verified = await verifier.verify(artifact, signature, publicKey);

  console.log();

  console.log("Detached Signature");

  console.log("--------------------------------------------------");

  console.log("Payload");

  console.log(JSON.stringify(artifact, null, 2));

  console.log();

  console.log(`Signature : ${signature}`);

  console.log();

  if (verified) {
    console.log("✓ Detached signature verified.");
  } else {
    console.log("✗ Signature verification failed.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
