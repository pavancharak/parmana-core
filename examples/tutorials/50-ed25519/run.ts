import {
  ArtifactSigner,
  CryptoBootstrap,
  DEFAULT_KEY_ID,
  FileKeyProvider,
  SignatureVerifier,
} from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 50 - Ed25519 Signatures");
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
  // Crypto configuration.
  //
  const crypto = CryptoBootstrap.create();

  //
  // Load signing keys.
  //
  const keyProvider = new FileKeyProvider();

  const metadata = await keyProvider.getMetadata(DEFAULT_KEY_ID);

  const privateKey = await keyProvider.getPrivateKey(DEFAULT_KEY_ID);

  const publicKey = await keyProvider.getPublicKey(DEFAULT_KEY_ID);

  console.log(`Algorithm : ${metadata.algorithm}`);

  console.log(`Key ID    : ${metadata.keyId}`);

  console.log();

  //
  // Sign.
  //
  const signer = new ArtifactSigner(crypto);

  const signature = await signer.sign(artifact, privateKey);

  //
  // Verify.
  //
  const verifier = new SignatureVerifier(crypto);

  const verified = await verifier.verify(artifact, signature, publicKey);

  console.log();

  console.log("Ed25519 Verification");

  console.log("--------------------------------------------------");

  console.log(`Signature : ${signature}`);

  console.log(`Verified : ${verified}`);

  console.log();

  if (verified) {
    console.log("✓ Ed25519 signature verified.");
  } else {
    console.log("✗ Verification failed.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
