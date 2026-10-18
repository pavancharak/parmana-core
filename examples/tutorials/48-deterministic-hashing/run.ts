import { CanonicalSerializer, CryptoBootstrap } from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 48 - Deterministic Hashing");
  console.log("==================================================");
  console.log();

  //
  // Business object.
  //
  const transaction = {
    vendorId: "VENDOR-1001",
    invoiceId: "INV-2026-001",
    paymentAmount: 25000,
    currency: "USD",
  };

  //
  // Canonical serialization.
  //
  const serializer = new CanonicalSerializer();

  const bytes = serializer.serialize(transaction);

  const canonical = new TextDecoder().decode(bytes);

  //
  // Deterministic hashing.
  //
  const crypto = CryptoBootstrap.create();

  const hash1 = await crypto.hash.hash(bytes);

  const hash2 = await crypto.hash.hash(bytes);

  console.log("Canonical JSON");

  console.log("--------------------------------------------------");

  console.log(canonical);

  console.log();

  console.log("SHA-256");

  console.log("--------------------------------------------------");

  console.log(`Hash #1 : ${hash1}`);

  console.log(`Hash #2 : ${hash2}`);

  console.log();

  if (hash1 === hash2) {
    console.log("✓ Deterministic hashing verified.");
  } else {
    console.log("✗ Deterministic hashing failed.");
  }

  console.log();

  console.log("Cryptographic Pipeline");

  console.log("--------------------------------------------------");

  console.log("✓ Business Object");

  console.log("✓ Canonical Serialization");

  console.log("✓ SHA-256 Hash");

  console.log("✓ Deterministic Output");

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
