import type { ApprovalScope, SignedApproval } from "@parmana/shared";

const SUPPORTED_PAYLOAD_VERSION = 1;

function isApprovalScopeShape(
  value: unknown,
): value is Pick<ApprovalScope, "field" | "comparator" | "value"> {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const scope = value as Record<string, unknown>;

  if (typeof scope.field !== "string" || typeof scope.comparator !== "string") {
    return false;
  }

  const bound = scope.value;

  if (typeof bound === "number" || typeof bound === "string") {
    return true;
  }

  if (typeof bound === "object" && bound !== null) {
    const range = bound as Record<string, unknown>;
    return typeof range.min === "number" && typeof range.max === "number";
  }

  return false;
}

/**
 * Structural runtime guard for a caller-supplied JSON value claimed to
 * be a SignedApproval -- e.g. a PolicySignals["approvalArtifact"]
 * entry, which arrives over the wire as an untyped JsonValue, never as
 * a real SignedApproval instance the way Parmana's own self-issued
 * signatures (RefusalCrypto, AuditEventCrypto, etc.) are constructed
 * directly in memory.
 *
 * Duck-types every field ApprovalVerifier.verify() actually reads.
 * Deliberately does not require signature.signedAt to be a Date
 * instance (JSON transport always yields a string, if present at all,
 * and ApprovalVerifier never reads this field -- it is
 * caller-provenance metadata only, not verified state).
 *
 * Does not, and need not, validate the signature itself -- that is
 * ApprovalVerifier's own job. A value that fails this guard is simply
 * treated as "no approval artifact presented," never thrown -- fails
 * closed the same way a fetch error or missing field does elsewhere in
 * this codebase's SignalStateVerifier implementations.
 */
export function isSignedApprovalShape(value: unknown): value is SignedApproval {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const artifact = value as Record<string, unknown>;

  if (typeof artifact.payload !== "object" || artifact.payload === null) {
    return false;
  }

  if (typeof artifact.signature !== "object" || artifact.signature === null) {
    return false;
  }

  const payload = artifact.payload as Record<string, unknown>;
  const signature = artifact.signature as Record<string, unknown>;

  if (typeof payload.issuer !== "object" || payload.issuer === null) {
    return false;
  }

  const issuer = payload.issuer as Record<string, unknown>;

  return (
    payload.version === SUPPORTED_PAYLOAD_VERSION &&
    typeof payload.approvalId === "string" &&
    typeof payload.issuedAt === "string" &&
    typeof payload.expiresAt === "string" &&
    typeof payload.capability === "string" &&
    typeof payload.resourceId === "string" &&
    typeof payload.nonce === "string" &&
    typeof issuer.approverId === "string" &&
    typeof issuer.keyId === "string" &&
    isApprovalScopeShape(payload.scope) &&
    typeof signature.value === "string" &&
    typeof signature.algorithm === "string" &&
    typeof signature.keyId === "string"
  );
}
