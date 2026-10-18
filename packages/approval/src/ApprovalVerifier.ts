import { SignatureVerifier } from "@parmana/crypto";
import type { CryptoProvider } from "@parmana/crypto";
import type { NonceStore } from "@parmana/envelope-verifier";
import type { SignedApproval } from "@parmana/shared";

import type { ApprovalIssuerRegistry } from "./ApprovalIssuerRegistry.js";
import { evaluateApprovalScope } from "./ApprovalScopeEvaluator.js";

const SUPPORTED_PAYLOAD_VERSION = 1;

/**
 * The request an Approval Artifact is being checked against --
 * exactly what RuntimeEngine/PolicyEngine already have in hand at
 * signal-verification time, nothing artifact-specific.
 */
export interface ApprovalVerificationRequest {
  readonly action: string;
  readonly resourceId: string;
  readonly requestedValue: unknown;

  /**
   * The fact the artifact's scope must name. When given, the
   * artifact's scope.field must equal it exactly, so an approval
   * signed for one fact (say, a resource id) is never accepted as
   * covering another (say, an amount) that happens to compare true.
   * ApprovalSignalVerifier always sets it; a capability specific
   * caller should too.
   */
  readonly scopeField?: string;

  /**
   * Whether to consume the artifact's nonce. Defaults to true. Set to
   * false only when the same artifact was already consumed for the same
   * transaction, as when the Execution Gateway checks signals again at
   * release (SignalStateVerificationRequest.stage "release"). With
   * false, every other check still runs, and checks.nonceUnseen reports
   * the result of those other checks, since the nonce is not looked at.
   */
  readonly consumeNonce?: boolean;
}

/**
 * Result of verifying a SignedApproval. Every check is reported, not
 * only whether verification succeeded overall -- mirrors
 * AuthorizationVerificationResult's own shape and the same reasoning:
 * a caller/operator diagnosing a rejection should see exactly which
 * check failed, not just that one did.
 */
export interface ApprovalVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly versionSupported: boolean;
    readonly issuerKnown: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly notRevoked: boolean;
    readonly capabilityMatches: boolean;
    readonly resourceMatches: boolean;
    readonly scopeSatisfied: boolean;
    readonly nonceUnseen: boolean;
  };
}

const FAILED_BEFORE_SIGNATURE: ApprovalVerificationResult = {
  valid: false,
  checks: {
    versionSupported: false,
    issuerKnown: false,
    signatureVerified: false,
    notExpired: false,
    notRevoked: false,
    capabilityMatches: false,
    resourceMatches: false,
    scopeSatisfied: false,
    nonceUnseen: false,
  },
};

/**
 * Verifies a SignedApproval per the frozen algorithm in
 * §10 of the Phase 3A approval artifact design (in git history):
 * deterministic, fixed order, no early return
 * between independent checks (mirroring AuthorizationVerifier.verify()'s
 * own no-timing-oracle discipline), nonce consumption attempted last
 * and only when every other check has already independently passed
 * (mirroring ExecutionGateway's isSoleFailureNonceReplay ordering) so
 * a request rejected on any other ground never burns the artifact's
 * single use.
 *
 * Reuses, verbatim, unmodified: SignatureVerifier + CanonicalSerializer
 * (via SignatureVerifier's own construction) for signature
 * verification, and the NonceStore interface for single-use
 * enforcement -- no new cryptographic primitive, no new serialization
 * format, exactly as Phase 3A specified.
 */
export class ApprovalVerifier {
  private readonly signatureVerifier: SignatureVerifier;

  constructor(
    private readonly options: {
      readonly crypto: CryptoProvider;
      readonly issuerRegistry: ApprovalIssuerRegistry;
      readonly nonceStore: NonceStore;
    },
  ) {
    this.signatureVerifier = new SignatureVerifier(options.crypto);
  }

  async verify(
    artifact: SignedApproval,
    request: ApprovalVerificationRequest,
    now: Date = new Date(),
  ): Promise<ApprovalVerificationResult> {
    //
    // 1. Version gate -- fails closed first, exactly like
    // AuthorizationVerifier. Not signature/secret-dependent, so
    // short-circuiting here introduces no timing oracle.
    //
    if (artifact.payload.version !== SUPPORTED_PAYLOAD_VERSION) {
      return FAILED_BEFORE_SIGNATURE;
    }

    //
    // 2. Every remaining check runs unconditionally, in this fixed
    // order, with no early return between them.
    //
    const resolvedIssuer = await this.options.issuerRegistry.resolve(
      artifact.payload.issuer.approverId,
      artifact.payload.issuer.keyId,
    );

    const issuerKnown = resolvedIssuer !== undefined;

    // An unresolvable issuer is a verification failure, not a
    // distinct error path -- signatureVerified is simply false.
    const signatureVerified =
      resolvedIssuer !== undefined
        ? await this.signatureVerifier.verify(
            artifact.payload,
            artifact.signature.value,
            resolvedIssuer.publicKey,
          )
        : false;

    const notExpired = now.getTime() < Date.parse(artifact.payload.expiresAt);

    const notRevoked = resolvedIssuer !== undefined && !resolvedIssuer.revoked;

    const capabilityMatches = artifact.payload.capability === request.action;

    const resourceMatches = artifact.payload.resourceId === request.resourceId;

    const scopeSatisfied =
      (request.scopeField === undefined ||
        artifact.payload.scope.field === request.scopeField) &&
      evaluateApprovalScope(request.requestedValue, artifact.payload.scope);

    //
    // 3. Nonce consumption is attempted LAST, and only recorded as
    // the deciding factor once every other check has already
    // independently passed. An artifact that fails on any other
    // ground never burns its nonce, preserving a legitimate retry
    // with a corrected request.
    //
    const priorChecksPassed =
      issuerKnown &&
      signatureVerified &&
      notExpired &&
      notRevoked &&
      capabilityMatches &&
      resourceMatches &&
      scopeSatisfied;

    const consumeNonce = request.consumeNonce !== false;

    const nonceUnseen = !priorChecksPassed
      ? false
      : consumeNonce
        ? await this.options.nonceStore.checkAndRecord(
            artifact.payload.nonce,
            artifact.payload.expiresAt,
          )
        : true;

    return {
      valid: priorChecksPassed && nonceUnseen,
      checks: {
        versionSupported: true,
        issuerKnown,
        signatureVerified,
        notExpired,
        notRevoked,
        capabilityMatches,
        resourceMatches,
        scopeSatisfied,
        nonceUnseen,
      },
    };
  }
}
