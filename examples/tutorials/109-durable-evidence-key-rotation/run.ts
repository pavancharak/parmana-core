import { generateKeyPairSync } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { VerificationCrypto } from "@parmana/crypto";
import type { ExecutionTrustRecord } from "@parmana/shared";

//
// PQC audit RED-3 (docs/VERIFICATION-GAPS.md): VerificationCrypto,
// RefusalCrypto, and AuditEventCrypto -- the signers for Trust
// Records, Refusal Records, and Audit Events, the durable evidence an
// auditor actually queries months or years later -- all hardcoded the
// literal keyId "default" for every new signature. The only "rotation"
// the code as it stood supported was overwriting default.private.pem/
// default.public.pem in place, which silently invalidates every
// signature ever issued under it (reproduced empirically before this
// fix existed, see this same gap's own entry).
//
// This tutorial proves the fix: sign a record, "rotate" by pointing
// PARMANA_VERIFICATION_KEY_ID at a freshly generated keyId (exactly
// what scripts/rotate-verification-key.ts does), sign a second
// record, and confirm -- with a freshly constructed VerificationCrypto,
// simulating a new process after redeploy -- that BOTH records verify
// correctly under their own distinct keys.
//

async function signRecord(
  crypto: VerificationCrypto,
  businessTransactionId: string,
): Promise<ExecutionTrustRecord> {
  const draft = {
    trustRecordId: businessTransactionId,
    businessTransactionId,
    transaction: {
      businessTransactionId,
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
      keyId: "placeholder",
      value: "",
      signedAt: new Date(),
    },
  };

  const signature = await crypto.sign(withHash);

  return { ...withHash, signature };
}

async function main(): Promise<void> {
  console.log();
  console.log("==================================================");
  console.log("Tutorial 109 - Durable-Evidence Key Rotation");
  console.log("==================================================");
  console.log();

  delete process.env.PARMANA_VERIFICATION_KEY_ID;

  console.log(
    "Scenario 1: Sign a record before any rotation -- uses the 'default' keyId",
  );
  console.log("--------------------------------------------------");

  const beforeRotation = new VerificationCrypto();
  const originalRecord = await signRecord(
    beforeRotation,
    "rotation-tutorial-original",
  );

  console.log(`keyId  : ${originalRecord.signature.keyId}`);
  console.log(`verify : ${await beforeRotation.verify(originalRecord)}`);
  console.log();

  console.log(
    "Scenario 2: Rotate -- generate a new keyId's key pair, touch nothing else",
  );
  console.log("--------------------------------------------------");

  const keyDir = process.env.PARMANA_KEY_DIR ?? "./keys";
  const rotatedKeyId = `verification-primary-tutorial-${Date.now()}`;
  const privatePath = join(keyDir, `${rotatedKeyId}.private.pem`);
  const publicPath = join(keyDir, `${rotatedKeyId}.public.pem`);

  if (!existsSync(privatePath)) {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    writeFileSync(
      privatePath,
      privateKey.export({ format: "pem", type: "pkcs8" }),
    );
    writeFileSync(
      publicPath,
      publicKey.export({ format: "pem", type: "spki" }),
    );
  }

  process.env.PARMANA_VERIFICATION_KEY_ID = rotatedKeyId;
  console.log(`New keyId generated : ${rotatedKeyId}`);
  console.log(`default.*.pem       : untouched`);
  console.log();

  console.log(
    "Scenario 3: Sign a second record after rotation -- uses the new keyId",
  );
  console.log("--------------------------------------------------");

  // A fresh VerificationCrypto, simulating a new process after
  // redeploy -- not the same in-memory instance that signed the
  // original record.
  const afterRotation = new VerificationCrypto();
  const newRecord = await signRecord(afterRotation, "rotation-tutorial-new");

  console.log(`keyId  : ${newRecord.signature.keyId}`);
  console.log(`verify : ${await afterRotation.verify(newRecord)}`);
  console.log();

  console.log(
    "Scenario 4: The pre-rotation record still verifies -- rotation did not break history",
  );
  console.log("--------------------------------------------------");

  const originalStillVerifies = await afterRotation.verify(originalRecord);
  console.log(
    `verify(originalRecord) after rotation : ${originalStillVerifies}`,
  );
  console.log();

  delete process.env.PARMANA_VERIFICATION_KEY_ID;

  const allCorrect =
    originalRecord.signature.keyId === "default" &&
    newRecord.signature.keyId === rotatedKeyId &&
    originalStillVerifies &&
    (await afterRotation.verify(newRecord));

  if (allCorrect) {
    console.log(
      "✓ Rotation produced a genuinely new signing key, and every record -- pre- and post-rotation -- still verifies correctly.",
    );
  } else {
    console.log(
      "✗ Expected both records to verify under their own distinct keys.",
    );
  }

  console.log();
  console.log("Tutorial Complete");
  console.log("Next: Tutorial 110 - Hybrid-Signature Downgrade Protection");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
