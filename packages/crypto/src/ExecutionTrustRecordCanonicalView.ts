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
 * without reading this repository's source directly. A separately
 * published verifier now ships the same mapping (canonicalExecutionTrustRecord and
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
 * verifiers, including the published third-party verifier -- never changes.
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
 * Schema version of a hybrid envelope that signs the whole record
 * (ADR-0016). Version 2 signs only the canonical fields plus schemaVersion.
 */
export const WHOLE_RECORD_SCHEMA_VERSION = 3;

/**
 * True when a record created at createdAt is at or after the cutover (ADR-0016,
 * option 2). The instant itself is included. A record whose createdAt does not
 * parse is not treated as after the cutover; its signatures fail on their own.
 */
export function isAtOrAfterCutover(
  createdAt: Date | string,
  hybridRequiredFrom: string | undefined,
): boolean {
  if (hybridRequiredFrom === undefined) {
    return false;
  }

  const created = new Date(createdAt).getTime();

  return !Number.isNaN(created) && created >= Date.parse(hybridRequiredFrom);
}

/**
 * Hybrid schema versions this codebase can sign and verify. Anything else
 * is rejected rather than canonicalized under a guessed view.
 */
export const SUPPORTED_HYBRID_SCHEMA_VERSIONS = [2, 3] as const;

/**
 * Selects the canonical view that a hybrid `signatures` array covers for
 * a given schema version. Version 3 covers the whole record; every other
 * version keeps the version 2 view, so existing records verify unchanged.
 */
export function hybridSignedCanonicalView(
  trustRecord: ExecutionTrustRecord,
  schemaVersion: number,
) {
  if (schemaVersion === WHOLE_RECORD_SCHEMA_VERSION) {
    return wholeRecordCanonicalView(trustRecord, schemaVersion);
  }

  return hybridCanonicalExecutionTrustRecord(trustRecord, schemaVersion);
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
