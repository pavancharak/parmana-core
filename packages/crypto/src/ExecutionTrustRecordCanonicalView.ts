import type { ExecutionTrustRecord } from "@parmana/shared";

/**
 * The exact canonical view of an Execution Trust Record that is
 * hashed and signed -- extracted out of VerificationCrypto (which
 * still delegates here, unchanged behavior) so there is exactly one
 * implementation of "which fields participate in the signature,"
 * shared by the online verifier (VerificationCrypto, which resolves
 * keys via FileKeyProvider) and the offline verifier
 * (OfflineVerifier.ts, which takes public keys directly and never
 * touches disk, env vars, or the network). Two independent
 * reimplementations of this field list would be a correctness risk in
 * their own right -- exactly the kind of drift a third-party verifier
 * must never have to guess at.
 *
 * PQC audit RED-1 (docs/VERIFICATION-GAPS.md): before this file
 * existed, this mapping lived only as a private method on
 * VerificationCrypto, so a third party had no way to reconstruct it
 * without reading this repository's source directly. @parmana/sign
 * v0.2.0 now ships the same mapping (canonicalExecutionTrustRecord and
 * hybridCanonicalExecutionTrustRecord); keep the two in sync.
 */
export function canonicalExecutionTrustRecord(
  trustRecord: ExecutionTrustRecord,
) {
  return {
    trustRecordId: trustRecord.trustRecordId,

    businessTransactionId: trustRecord.businessTransactionId,

    transaction: trustRecord.transaction,

    authorization: trustRecord.authorization,

    overrides: trustRecord.overrides,

    executions: trustRecord.executions,

    createdAt: trustRecord.createdAt,
  };
}

/**
 * The canonical view signed/verified by the hybrid `signatures`
 * array: the same content as canonicalExecutionTrustRecord(), plus
 * schemaVersion. Kept separate so the legacy `signature` field's
 * signed content -- and therefore its verifiability by pre-hybrid-era
 * verifiers, including @parmana/sign -- never changes.
 */
export function hybridCanonicalExecutionTrustRecord(
  trustRecord: ExecutionTrustRecord,
  schemaVersion: number,
) {
  return {
    ...canonicalExecutionTrustRecord(trustRecord),
    schemaVersion,
  };
}

/**
 * Top-level fields that a schema version 3 (whole-record) signature does
 * not cover. The signature fields hold the signatures themselves.
 * `verifications` and `receipts` are attached to the stored record after
 * it is signed (ADR-0016); receipts carry their own signature.
 */
export const WHOLE_RECORD_EXCLUDED_FIELDS = [
  "signature",
  "signatures",
  "schemaVersion",
  "verifications",
  "receipts",
] as const;

/**
 * The canonical view signed by a schema version 3 hybrid envelope: every
 * top-level field of the record except WHOLE_RECORD_EXCLUDED_FIELDS, plus
 * the schema version itself. `trustRecordHash` is covered, because it is
 * set before the v3 signature is made. Built with Object.fromEntries, so a
 * field named "__proto__" stays an ordinary covered field.
 */
export function wholeRecordCanonicalView(
  trustRecord: ExecutionTrustRecord,
  schemaVersion: number,
) {
  const excluded: readonly string[] = WHOLE_RECORD_EXCLUDED_FIELDS;

  const covered = Object.entries(trustRecord).filter(
    ([key]) => !excluded.includes(key),
  );

  return {
    ...Object.fromEntries(covered),
    schemaVersion,
  };
}
