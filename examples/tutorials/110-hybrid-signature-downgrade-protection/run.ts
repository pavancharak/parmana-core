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
// PQC audit RED-4 (docs/internal/VERIFICATION-GAPS.md), as it stands under
// decision D24: a schema version 3 record is signed over the whole record, and
// the signatures array is part of what the verifier requires. There is no
// legacy-only fallback, so a copy of a hybrid-signed record with its ML-DSA-65
// signature removed (or with signatures removed altogether) is refused under
// every policy. The stripping demonstrated below is therefore rejected by default.
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
    schemaVersion: 3,
  };

  // Schema version 3, hybrid: both entries sign the whole record (decision D24).
  const signatures = await crypto.signWholeRecord(withHash);

  const hybridRecord: ExecutionTrustRecord = {
    ...withHash,
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
    "Scenario 2: Default policy -- the stripped record is refused (schema version 3 has no fallback)",
  );
  console.log("--------------------------------------------------");
  const strippedUnderDefault = await crypto.verify(
    stripped as ExecutionTrustRecord,
  );
  console.log(`verify(stripped) : ${strippedUnderDefault}`);
  console.log();

  console.log(
    "Scenario 3: HYBRID_SIGNATURE_REQUIRED=true -- the identical stripped record is still refused",
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
    !strippedUnderDefault &&
    !strippedUnderStrict &&
    completeUnderStrict;

  if (allCorrect) {
    console.log(
      "✓ Stripping the ML-DSA-65 signature is refused under the default policy and under HYBRID_SIGNATURE_REQUIRED=true. The complete hybrid record verifies.",
    );
  } else {
    console.log(
      "✗ Expected the stripped record to be refused under both policies, and the complete hybrid record to verify.",
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
