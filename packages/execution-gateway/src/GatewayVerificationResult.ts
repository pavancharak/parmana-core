import type { SignalStateViolation } from "@parmana/policy";

/**
 * Result of the Execution Gateway's verification
 * sequence.
 *
 * Every check runs and is named individually. The
 * side-effect-free checks (version, signature,
 * expiry, TTL policy, content hash) always run,
 * in that order. The nonce is consumed last, and
 * only when every side-effect-free check passed —
 * see ExecutionGateway.verify for why.
 */
export interface GatewayVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly ttlWithinPolicy: boolean;
    readonly businessTransactionHashMatches: boolean;

    /** The signed decisionOutcome is "APPROVED". Absent or any other value fails. */
    readonly decisionApproved?: boolean;

    /** The authorization is not on the revocation list. Absent when no list is wired. */
    readonly authorizationNotRevoked?: boolean;

    /** A verification-only key named only a capability it may sign. Absent when no scope is configured. */
    readonly verificationKeyScope?: boolean;

    /**
     * Always present and true for a valid result, unless the gateway
     * was built with allowUnverifiedPolicy. In that legacy mode it is
     * present only when a PolicyRepository was supplied AND the
     * authorization carries a policyContentHash, and absent (not false)
     * means the check was skipped. A missing policyContentHash is a
     * failure (false) by default. See ExecutionGateway's class doc
     * comment.
     */
    readonly policyStillCurrent?: boolean;

    /**
     * Present only when the live policy hash matched the authorization's
     * signed policyContentHash and a policy approval verifier ran: true
     * when the policy's most recent signed PolicyChangeApprovalRecord
     * exists, verifies, and matches that same hash; false otherwise.
     * Absent when the gateway was built with allowUnverifiedPolicy, or
     * when an earlier check already failed.
     */
    readonly policyGovernanceVerified?: boolean;

    /**
     * Present only when a SignalStateVerifier was supplied to the
     * Gateway AND the authorization carries a signalsHash AND the
     * request carries signals -- absent (not false) otherwise, meaning
     * the check was skipped rather than failed. False covers two
     * distinct causes, both surfaced via the detail fields below:
     * the request's signals no longer hash-match the authorization's
     * signalsHash (tamper/mismatch), or they hash-match but the
     * SignalStateVerifier independently found the underlying real-world
     * conditions have since diverged (drift). See ExecutionGateway's
     * class doc comment.
     */
    readonly signalsStillCurrent?: boolean;

    /**
     * RFC-0023 phase 4. Present when the authorization carries business
     * conditions: false once any is past its signed validUntil.
     */
    readonly businessConditionsCurrent?: boolean;

    /**
     * RFC-0023 phase 4. Present when the authorization rests on an
     * authority grant: false once the grant has expired, was revoked or
     * replaced, or cannot be checked.
     */
    readonly authorityGrantInForce?: boolean;

    /**
     * Absent in executionControl mode: the release verifier consumes the
     * nonce there, at the single release point.
     */
    readonly nonceUnseen?: boolean;
  };

  /**
   * Present only when businessTransactionHashMatches
   * is false. Names both hashes so a mismatch is
   * diagnosable without re-deriving either value.
   */
  readonly hashMismatch?: {
    readonly expected: string;
    readonly actual: string;
  };

  /**
   * Present only when policyStillCurrent is false. Names both
   * hashes so a mismatch is diagnosable without re-deriving either
   * value.
   */
  readonly policyContentMismatch?: {
    readonly expected: string;
    readonly actual: string;
  };

  /**
   * Present only when policyGovernanceVerified is false. Names the
   * reason (no approval record, bad record signature, or live content
   * differing from the approved content) so it is diagnosable without
   * re-deriving anything.
   */
  readonly policyGovernanceViolation?: {
    readonly reason: string;
  };

  /**
   * Present only when signalsStillCurrent is false because the
   * request's signals no longer hash-match the authorization's
   * signalsHash. Names both hashes, same shape as policyContentMismatch.
   */
  readonly signalsHashMismatch?: {
    readonly expected: string;
    readonly actual: string;
  };

  /**
   * Present only when signalsStillCurrent is false because a
   * SignalStateVerifier found the declared signals no longer match
   * independently verified real-world state. Empty/absent whenever
   * signalsStillCurrent is true or undefined.
   */
  readonly signalDivergence?: readonly SignalStateViolation[];

  /** The signal keys of business conditions past their validUntil. */
  readonly expiredConditions?: readonly string[];

  readonly authorityGrantViolation?: {
    readonly reason: string;
  };
}
