import { CanonicalSerializer } from "@parmana/crypto";

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 47 - Canonical JSON");
  console.log("==================================================");
  console.log();

  //
  // Same object.
  // Different property order.
  //
  const objectA = {
    vendorId: "VENDOR-1001",
    amount: 25000,
    currency: "USD",
  };

  const objectB = {
    currency: "USD",
    amount: 25000,
    vendorId: "VENDOR-1001",
  };

  const serializer = new CanonicalSerializer();

  const bytesA = serializer.serialize(objectA);

  const bytesB = serializer.serialize(objectB);

  console.log("Object A");

  console.log(JSON.stringify(objectA, null, 2));

  console.log();

  console.log("Object B");

  console.log(JSON.stringify(objectB, null, 2));

  console.log();

  console.log("Canonical JSON A");
  const canonicalA = new TextDecoder().decode(bytesA);

  console.log(canonicalA);
  console.log();

  console.log("Canonical JSON B");

  const canonicalB = new TextDecoder().decode(bytesB);

  console.log(canonicalB);

  console.log();

  if (canonicalA === canonicalB) {
    console.log("✓ Canonical serialization is deterministic.");
  } else {
    console.log("✗ Canonical serialization differs.");
  }

  console.log();

  console.log("Tutorial completed successfully.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
