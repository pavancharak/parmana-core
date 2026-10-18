import type { PolicyChangeStepUpAuthorization } from "@parmana/shared";

/**
 * Structural runtime guard for a caller-supplied JSON value claimed to
 * be a PolicyChangeStepUpAuthorization -- it arrives over the wire as
 * an untyped JsonValue (req.body.stepUpAuthorization), never as a real
 * instance the way Parmana's own self-issued signatures are
 * constructed directly in memory. Mirrors isSignedApprovalShape's own
 * duck-typing discipline (@parmana/approval): checks every field
 * PolicyChangeStepUpVerifier actually reads, does not itself validate
 * the signature -- a value that fails this guard is simply "no step-up
 * envelope presented," never thrown.
 */
export function isPolicyChangeStepUpAuthorizationShape(
  value: unknown,
): value is PolicyChangeStepUpAuthorization {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const envelope = value as Record<string, unknown>;

  if (typeof envelope.payload !== "object" || envelope.payload === null) {
    return false;
  }

  const payload = envelope.payload as Record<string, unknown>;

  return (
    payload.version === 1 &&
    typeof payload.nonce === "string" &&
    typeof payload.pendingPolicyChangeId === "string" &&
    (payload.action === "approve" || payload.action === "reject") &&
    typeof payload.authorizedAt === "string" &&
    typeof payload.expiresAt === "string" &&
    typeof envelope.signature === "string" &&
    typeof envelope.keyId === "string" &&
    typeof envelope.algorithm === "string"
  );
}
