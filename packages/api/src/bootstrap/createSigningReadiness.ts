import { VerificationCrypto } from "@parmana/crypto";
import {
  CachedSigningReadiness,
  type SigningReadiness,
} from "@parmana/runtime";

import { localModeEnabled } from "./localMode.js";

/**
 * How long a successful signing probe is trusted before the next request
 * probes again. A failure is never cached, so recovery is seen at once.
 */
const SIGNING_READINESS_TTL_MS = 60_000;

/**
 * Signing readiness (docs/internal/VERIFICATION-GAPS.md G-52) is ON by default and
 * fails closed: before an action is released to a connector, the evidence
 * signing path must prove it can produce a signature that verifies, or the
 * request is refused with 503 SIGNING_UNAVAILABLE and nothing is executed.
 *
 * This check has its own environment rule, which is not the policy verifier's
 * (createPolicyExecutionVerifier() is on in every environment). Relaxed only
 * in local mode (localMode.ts: PARMANA_LOCAL_MODE=true under NODE_ENV "test" or
 * "development"), where it stays off unless SIGNING_READINESS_CHECK is exactly
 * "true". Everywhere else it is enforced, and NODE_ENV alone never turns it off.
 *
 * The probe runs a real signing round trip, so under KMS it makes a Sign
 * call and a GetPublicKey call at most once per minute per instance, not
 * once per request.
 */
export function createSigningReadiness(): SigningReadiness | undefined {
  if (localModeEnabled() && process.env.SIGNING_READINESS_CHECK !== "true") {
    return undefined;
  }

  return new CachedSigningReadiness(
    () => new VerificationCrypto().probeSigning(),
    SIGNING_READINESS_TTL_MS,
  );
}
