import crypto from "node:crypto";

import { VerificationCrypto } from "@parmana/crypto";
import { MemoryExecutionTrustRecordRepository } from "@parmana/storage";

import {
  buildBusinessTransaction,
  buildReceiptPair,
  buildSignedMultiExecutionOverrideRecord,
  buildVerificationPair,
} from "../../../packages/storage/tests/fixtures/multi-item-trust-record.js";

//
// A signed Execution Trust Record's hash is computed over its full
// contents -- including the ORDER of items within its executions/
// overrides/verifications/receipts collections. A repository that
// silently reorders items on the round trip (e.g. loading them back
// via a query with no explicit ORDER BY) would recompute to a
// different hash than what was actually signed -- a real bug this
// suite regression-tests (the Supabase-backed repository needed an
// explicit ORDER BY / sequence fix for exactly this reason). This
// tutorial proves the in-memory repository preserves insertion order
// for every collection, and that the reloaded record's hash and
// signature both still validate.
//
console.log();
console.log("==================================================");
console.log("Tutorial 93 - Trust Record Ordering");
console.log("==================================================");
console.log();

const transaction = buildBusinessTransaction(crypto.randomUUID());
const signedRecord = await buildSignedMultiExecutionOverrideRecord(transaction);

const repository = new MemoryExecutionTrustRecordRepository();
await repository.create(signedRecord);

console.log(
  `Created a Trust Record with ${signedRecord.executions.length} executions and ${signedRecord.overrides.length} overrides.`,
);
console.log();

console.log(
  "Appending two verifications, then two receipts, in a specific order",
);
console.log("--------------------------------------------------");

const [verification1, verification2] = buildVerificationPair(
  transaction.businessTransactionId,
  signedRecord.trustRecordHash,
);
await repository.appendVerification(
  transaction.businessTransactionId,
  verification1,
);
await repository.appendVerification(
  transaction.businessTransactionId,
  verification2,
);
console.log(
  `Appended verifications: ${verification1.verificationId}, then ${verification2.verificationId}`,
);

const [receipt1, receipt2] = buildReceiptPair(
  transaction.businessTransactionId,
  signedRecord.trustRecordHash,
);
await repository.appendReceipt(transaction.businessTransactionId, receipt1);
await repository.appendReceipt(transaction.businessTransactionId, receipt2);
console.log(
  `Appended receipts: ${receipt1.receiptId}, then ${receipt2.receiptId}`,
);
console.log();

console.log(
  "Reloading the record and checking every collection's order survived the round trip",
);
console.log("--------------------------------------------------");

const reloaded = await repository.findByTransactionId(
  transaction.businessTransactionId,
);

const executionsOrderPreserved =
  JSON.stringify(reloaded!.executions.map((e) => e.executionId)) ===
  JSON.stringify(signedRecord.executions.map((e) => e.executionId));
const overridesOrderPreserved =
  JSON.stringify(reloaded!.overrides.map((o) => o.overrideId)) ===
  JSON.stringify(signedRecord.overrides.map((o) => o.overrideId));
const verificationsOrderPreserved =
  JSON.stringify(reloaded!.verifications.map((v) => v.verificationId)) ===
  JSON.stringify([verification1.verificationId, verification2.verificationId]);
const receiptsOrderPreserved =
  JSON.stringify(reloaded!.receipts.map((r) => r.receiptId)) ===
  JSON.stringify([receipt1.receiptId, receipt2.receiptId]);

console.log(`executions order preserved     : ${executionsOrderPreserved}`);
console.log(`overrides order preserved      : ${overridesOrderPreserved}`);
console.log(`verifications order preserved  : ${verificationsOrderPreserved}`);
console.log(`receipts order preserved       : ${receiptsOrderPreserved}`);
console.log();

console.log(
  "Recomputing the hash from the reloaded record -- must still match what was signed",
);
console.log("--------------------------------------------------");

const verificationCrypto = new VerificationCrypto();
const recomputedHash = await verificationCrypto.hash(reloaded!);
const hashMatches = recomputedHash === reloaded!.trustRecordHash;
const signatureValid = await verificationCrypto.verify(reloaded!);

console.log(`Recomputed hash matches stored trustRecordHash : ${hashMatches}`);
console.log(
  `Signature still validates                       : ${signatureValid}`,
);
console.log();

const allPassed =
  executionsOrderPreserved &&
  overridesOrderPreserved &&
  verificationsOrderPreserved &&
  receiptsOrderPreserved &&
  hashMatches &&
  signatureValid;

if (allPassed) {
  console.log(
    "✓ Every collection's insertion order survived the round trip, and the reloaded record's hash and signature both still validate.",
  );
} else {
  console.log(
    "✗ Expected insertion order to survive the round trip and the reloaded record's hash/signature to still validate -- a reorder would break both.",
  );
}

console.log();
console.log("Tutorial Complete");
console.log("Next: Tutorial 94 - SDK HTTP Transport");
