import { generateKeyPairSync } from "node:crypto";

import {
  VerificationCrypto,
  verifyExecutionTrustRecordOffline,
} from "@parmana/crypto";

import type { ExecutionTrustRecord } from "@parmana/shared";

//
// PQC audit RED-1 (docs/VERIFICATION-GAPS.md): before this capability
// existed, every verification path in this codebase -- the
// unauthenticated POST /verify/POST /audit/verify/POST /refusal/verify
// HTTP routes, and both the TypeScript and Python SDKs' VerificationApi
// wrappers -- was a remote call into Parmana's own server, or (for
// VerificationCrypto directly) still read a local PEM file via
// PARMANA_KEY_DIR. Neither is what a genuine third party (a regulator,
// an auditor, a customer's own tooling) actually has: a signed
// artifact, and a public key handed to them some other way. This
// tutorial proves verifyExecutionTrustRecordOffline() works with
// literally nothing else -- no env var, no disk read, no network call.
//

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 107 - Offline Verification");
  console.log("==================================================");
  console.log();

  //
  // Sign a real Execution Trust Record, exactly as VerificationCrypto
  // does in production (using this checkout's real signing key). In a
  // real deployment, this half happens on Parmana's own infrastructure
  // -- everything from here on is what a third party does with the
  // result, on their own machine, with no access to Parmana's key
  // directory at all.
  //
  const crypto = new VerificationCrypto();

  const draft = {
    trustRecordId: "offline-verification-demo",
    businessTransactionId: "offline-verification-demo",
    transaction: {
      businessTransactionId: "offline-verification-demo",
      status: "RECEIVED",
      createdAt: new Date(),
    },
    overrides: [],
    executions: [],
    verifications: [],
    receipts: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  } as unknown as ExecutionTrustRecord;

  const trustRecordHash = await crypto.hash(draft);

  const withHash: ExecutionTrustRecord = {
    ...draft,
    trustRecordHash,
    signature: {
      algorithm: "ed25519",
      keyId: "default",
      value: "",
      signedAt: new Date(),
    },
  };

  const signature = await crypto.sign(withHash);
  const trustRecord: ExecutionTrustRecord = { ...withHash, signature };

  //
  // The public key, as a plain PEM string -- exactly what a third
  // party gets back from GET /keys/default or GET /.well-known/
  // jwks.json (Tutorial 108), or is handed some other way. Read once
  // here from this checkout's own key file purely to obtain that
  // string; verifyExecutionTrustRecordOffline() below never touches
  // PARMANA_KEY_DIR, FileKeyProvider, or the filesystem itself.
  //
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  const keyDir = process.env.PARMANA_KEY_DIR ?? "./keys";
  const realPublicKeyPem = readFileSync(
    join(keyDir, "default.public.pem"),
    "utf8",
  );

  console.log(
    "Scenario 1: A genuine record verifies with zero disk/network/env-var access",
  );
  console.log("--------------------------------------------------");

  const result = await verifyExecutionTrustRecordOffline(trustRecord, {
    default: realPublicKeyPem,
  });

  console.log(`valid                : ${result.valid}`);
  console.log(`hashValid            : ${result.hashValid}`);
  console.log(`legacySignatureValid : ${result.legacySignatureValid}`);
  console.log(`algorithmsChecked    : ${result.algorithmsChecked.join(", ")}`);
  console.log();

  console.log(
    "Scenario 2: A tampered record is caught -- the hash no longer matches",
  );
  console.log("--------------------------------------------------");

  const tampered: ExecutionTrustRecord = {
    ...trustRecord,
    transaction: {
      ...trustRecord.transaction,
      status: "APPROVED" as ExecutionTrustRecord["transaction"]["status"],
    },
  };

  const tamperedResult = await verifyExecutionTrustRecordOffline(tampered, {
    default: realPublicKeyPem,
  });

  console.log(`valid     : ${tamperedResult.valid}`);
  console.log(`errors    : ${tamperedResult.errors.join(" | ")}`);
  console.log();

  console.log(
    "Scenario 3: The wrong public key is rejected, not silently accepted",
  );
  console.log("--------------------------------------------------");

  const { publicKey: wrongPublicKey } = generateKeyPairSync("ed25519");
  const wrongPem = wrongPublicKey
    .export({ format: "pem", type: "spki" })
    .toString();

  const wrongKeyResult = await verifyExecutionTrustRecordOffline(trustRecord, {
    default: wrongPem,
  });

  console.log(`valid     : ${wrongKeyResult.valid}`);
  console.log(`errors    : ${wrongKeyResult.errors.join(" | ")}`);
  console.log();

  const allCorrect =
    result.valid && !tamperedResult.valid && !wrongKeyResult.valid;

  if (allCorrect) {
    console.log(
      "✓ A genuine record verifies, a tampered one is caught by the hash check, and the wrong key is rejected -- all with zero disk/network/env-var access.",
    );
  } else {
    console.log(
      "✗ Expected the genuine record to verify and both negative cases to fail.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 108 - Public-Key Discovery");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
