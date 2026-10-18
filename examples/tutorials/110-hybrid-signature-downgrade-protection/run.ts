import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";
import { join } from "node:path";

import {
  isMlDsa65Supported,
  ML_DSA_65_SKIP_REASON,
  VerificationCrypto,
} from "@parmana/crypto";
import type { ExecutionTrustRecord } from "@parmana/shared";

//
// PQC audit RED-4 (docs/VERIFICATION-GAPS.md): schemaVersion and
// signatures[] are deliberately excluded from the hashed content (so
// the legacy signature keeps verifying pre-hybrid-era records
// unchanged), but that also meant VerificationCrypto.verifySignature()
// silently fell back to legacy-only verification whenever signatures
// was stripped entirely -- proven exploitable by this codebase's own
// pre-existing test, "still verifies a legacy-shaped record ...
// additive, not breaking." Anyone with mere storage/transport access
// to a copy of a hybrid-signed record -- no key material required --
// could remove its ML-DSA-65 signature and have it verify as if it
// were only ever classically signed, defeating hybrid mode's entire
// purpose (surviving a future break of the classical algorithm).
//
// Fix: an opt-in HYBRID_SIGNATURE_REQUIRED flag. Off by default (so
// enabling CRYPTO_MODE=hybrid never retroactively affects an
// already-issued record); when a deployment turns it on, the exact
// same stripping demonstrated here is rejected outright.
//

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 110 - Hybrid-Signature Downgrade Protection");
  console.log("==================================================");
  console.log();

  if (!isMlDsa65Supported()) {
    console.log(`Skipping Tutorial 110: ${ML_DSA_65_SKIP_REASON}`);
    return;
  }

  process.env.CRYPTO_MODE = "hybrid";
  process.env.SECONDARY_SIGNATURE_PROVIDER = "dilithium3";
  delete process.env.HYBRID_SIGNATURE_REQUIRED;

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

  const crypto = new VerificationCrypto();

  const draft = {
    trustRecordId: "downgrade-protection-demo",
    businessTransactionId: "downgrade-protection-demo",
    transaction: {
      businessTransactionId: "downgrade-protection-demo",
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
  const signatures = await crypto.signHybrid({ ...withHash, signature });

  const hybridRecord: ExecutionTrustRecord = {
    ...withHash,
    signature,
    schemaVersion: 2,
    signatures,
  };

  console.log("Scenario 1: A genuinely hybrid-signed record verifies");
  console.log("--------------------------------------------------");
  console.log(`schemaVersion : ${hybridRecord.schemaVersion}`);
  console.log(
    `signatures    : ${hybridRecord.signatures?.map((entry) => entry.algorithm).join(" + ")}`,
  );
  console.log(`verify        : ${await crypto.verify(hybridRecord)}`);
  console.log();

  // Simulate an attacker (or a lossy pipeline) with mere storage
  // access -- no private key needed -- stripping the ML-DSA-65 half.
  const {
    schemaVersion: _schemaVersion,
    signatures: _signatures,
    ...stripped
  } = hybridRecord;

  console.log(
    "Scenario 2: Default policy (HYBRID_SIGNATURE_REQUIRED unset) -- the stripped record STILL verifies",
  );
  console.log("--------------------------------------------------");
  const strippedUnderDefault = await crypto.verify(
    stripped as ExecutionTrustRecord,
  );
  console.log(`verify(stripped) : ${strippedUnderDefault}`);
  console.log(
    "This is deliberate, additive backward compatibility for records signed before this deployment ever",
  );
  console.log(
    "turned on hybrid mode -- not the downgrade attack being missed.",
  );
  console.log();

  console.log(
    "Scenario 3: HYBRID_SIGNATURE_REQUIRED=true -- the identical stripped record is now rejected",
  );
  console.log("--------------------------------------------------");
  process.env.HYBRID_SIGNATURE_REQUIRED = "true";
  const strictCrypto = new VerificationCrypto();
  const strippedUnderStrict = await strictCrypto.verify(
    stripped as ExecutionTrustRecord,
  );
  console.log(`verify(stripped) : ${strippedUnderStrict}`);
  console.log();

  console.log(
    "Scenario 4: A genuinely complete hybrid record still verifies under the strict policy",
  );
  console.log("--------------------------------------------------");
  const completeUnderStrict = await strictCrypto.verify(hybridRecord);
  console.log(`verify(hybridRecord) : ${completeUnderStrict}`);
  console.log();

  delete process.env.HYBRID_SIGNATURE_REQUIRED;

  const allCorrect =
    (await crypto.verify(hybridRecord)) &&
    strippedUnderDefault &&
    !strippedUnderStrict &&
    completeUnderStrict;

  if (allCorrect) {
    console.log(
      "✓ Stripping the ML-DSA-65 signature is invisible under the default policy (by design, non-breaking) and correctly rejected once a deployment opts into HYBRID_SIGNATURE_REQUIRED.",
    );
  } else {
    console.log(
      "✗ Expected the default policy to accept the stripped record and the strict policy to reject it.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log(
    "This concludes the PQC production-readiness audit remediation tutorials (107-110).",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
