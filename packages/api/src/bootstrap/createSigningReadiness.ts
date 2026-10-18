import { VerificationCrypto } from "@parmana/crypto";
import {
  CachedSigningReadiness,
  type SigningReadiness,
} from "@parmana/runtime";

/**
 * How long a successful signing probe is trusted before the next request
 * probes again. A failure is never cached, so recovery is seen at once.
 */
const SIGNING_READINESS_TTL_MS = 60_000;

/**
 * Signing readiness (docs/VERIFICATION-GAPS.md G-52) is ON by default and
 * fails closed: before an action is released to a connector, the evidence
 * signing path must prove it can produce a signature that verifies, or the
 * request is refused with 503 SIGNING_UNAVAILABLE and nothing is executed.
 *
 * Same environment rule as createPolicyExecutionVerifier(): relaxed only
 * when NODE_ENV is exactly "test" or "development", where it stays off
 * unless SIGNING_READINESS_CHECK is exactly "true". In production, or with
 * NODE_ENV unset or any other value, it is enforced and no variable can
 * turn it off.
 *
 * The probe runs a real signing round trip, so under KMS it makes a Sign
 * call and a GetPublicKey call at most once per minute per instance, not
 * once per request.
 */
export function createSigningReadiness(): SigningReadiness | undefined {
  const env = process.env.NODE_ENV;
  const relaxed = env === "test" || env === "development";

  if (relaxed && process.env.SIGNING_READINESS_CHECK !== "true") {
    return undefined;
  }

  return new CachedSigningReadiness(
    () => new VerificationCrypto().probeSigning(),
    SIGNING_READINESS_TTL_MS,
  );
}
