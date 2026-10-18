import type { KeyObject } from "node:crypto";

import {
  CryptoBootstrap,
  ExecutableContentHasher,
  TrustRecordHasher,
  type KeyExpiryStore,
  type KeyProvider,
} from "@parmana/crypto";

import type {
  PolicyExecutionVerifier,
  Policy,
  PolicyRepository,
  PolicySignals,
  SignalStateVerifier,
} from "@parmana/policy";

import { EnvelopeVerifier, type NonceStore } from "@parmana/envelope-verifier";

import type { ExecutionControl } from "@parmana/execution-control";

import type {
  ExecutionRequest,
  ExecutionSystem,
} from "@parmana/execution-system";

import {
  toExecutableContent,
  AuthorizationNoLongerValidError,
  NonceAlreadyConsumedError,
  type ExecutableContent,
  type AuthorityGrantRepository,
  type ExecutionResult,
  type ReleaseApproval,
} from "@parmana/shared";

import type { Connector } from "./Connector.js";
import { deepFreeze } from "./deepFreeze.js";
import type { GatewayVerificationResult } from "./GatewayVerificationResult.js";
import type {
  ExecutionChannel,
  GatewayIdentityProvider,
} from "./connector-runtime/types.js";

export interface ExecutionControlOptions {
  /** New package-level control service. */
  readonly service?: ExecutionControl;
  readonly gatewayAuthentication?: unknown;

  /**
   * When present, called once per execute() call with the
   * authorizationId of the request being released, to mint a fresh,
   * request-bound gatewayAuthentication value instead of reusing the
   * static gatewayAuthentication field above. Takes precedence over it
   * when both are supplied.
   */
  readonly mintGatewayAuthentication?: (authorizationId: string) => unknown;

  /** @deprecated Embedded prototype retained for backward compatibility. */
  readonly channel?: ExecutionChannel;
  /** @deprecated Use gatewayAuthentication with service. */
  readonly gatewayIdentity?: GatewayIdentityProvider;

  /** Deterministic deployment routing. It must not inspect credentials. */
  readonly route: (content: Readonly<ExecutableContent>) => string;
}

/**
 * Answers whether one authorization has been revoked. Checked at release,
 * so an authorization can be stopped before its TTL ends without revoking
 * the signing key. Implementations must fail closed: a read error throws.
 */
export interface AuthorizationRevocationList {
  isRevoked(authorizationId: string): Promise<boolean>;
}

export interface ExecutionGatewayOptions {
  /**
   * Parmana's public key. Supplied by the caller,
   * exactly as @parmana/envelope-verifier requires —
   * this package never reads key material itself.
   */
  readonly publicKey: KeyObject;

  /**
   * Optional keyId-aware key lookup, forwarded to EnvelopeVerifier.
   * When supplied, each authorization's own `keyId` is resolved
   * through this provider instead of the single static `publicKey`
   * above -- enabling verification against a rotated or additional
   * key without a restart, since a new keyId only needs a new key
   * file the provider can read. `publicKey` above remains the
   * fallback when this is omitted, so every caller that doesn't
   * supply it keeps today's exact behavior.
   */
  readonly keyProvider?: KeyProvider;

  /**
   * Optional key-expiry/revocation check, forwarded to
   * EnvelopeVerifier. Only consulted when keyProvider is also
   * supplied; a keyId with no entry (or when this is omitted
   * entirely) is treated as always valid.
   */
  readonly keyExpiryStore?: KeyExpiryStore;

  readonly nonceStore: NonceStore;

  /**
   * Policy repository used for the policy-freshness check: recomputing
   * the current content hash of the policy an authorization was signed
   * under, and comparing it to the authorization's own signed
   * `policyContentHash`. Required unless allowUnverifiedPolicy is set;
   * an authorization with no `policyContentHash` is then rejected. Only
   * in that explicit legacy mode is the check skipped rather than failed.
   */
  readonly policyRepository?: PolicyRepository;

  /**
   * Verifies that the policy an authorization was signed under is
   * legitimate under Policy Governance (maker-checker) at the moment of
   * release: its most recent signed PolicyChangeApprovalRecord exists,
   * its signature verifies, and its contentHashAfter equals the live
   * policy hash. Same port RuntimeEngine uses pre-authorization
   * (@parmana/policy PolicyExecutionVerifier); reused here so the
   * approved hash, the hash signed into the authorization, and the live
   * hash must all agree before anything is released.
   *
   * Required unless allowUnverifiedPolicy is set.
   */
  readonly policyApprovalVerifier?: PolicyExecutionVerifier;

  /**
   * Explicit, loudly named opt out from fail-closed policy binding.
   * By default (absent or false) the Gateway REQUIRES a policyRepository
   * and a policyApprovalVerifier at construction, and rejects any
   * authorization that carries no policyContentHash, instead of skipping
   * those checks. Only legacy test fixtures and examples that predate
   * policy binding should set this; production bootstrap must not.
   */
  readonly allowUnverifiedPolicy?: boolean;

  /**
   * Optional Signal/State Verifier used for the signal-freshness check
   * (G-31): independently re-deriving, at the execution boundary, the
   * real-world facts an authorization's signals declared, and rejecting
   * execution if either the request's signals no longer hash-match the
   * authorization's own signed `signalsHash`, or the verifier reports
   * that verified state has since diverged from those signals. When
   * omitted, or when an authorization carries no `signalsHash`, the
   * check is skipped rather than failed. A request with no `signals`
   * is checked as `{}`, the same value RuntimeEngine hashes when a
   * transaction has no signals -- see ExecutionGateway's class doc comment. Same port
   * RuntimeEngine already uses pre-authorization (@parmana/policy);
   * reused here, not reimplemented.
   */
  readonly signalStateVerifier?: SignalStateVerifier;

  /**
   * The Connector this Gateway is the sole release
   * boundary for.
   */
  readonly connector?: Connector;

  /**
   * Additive controlled-execution mode. When present, verified content is
   * released through an authenticated ExecutionChannel instead of a legacy
   * directly injected Connector.
   */
  readonly executionControl?: ExecutionControlOptions;

  /**
   * Forwarded to the underlying EnvelopeVerifier.
   * Defaults to 300 seconds.
   */
  readonly maxTtlSeconds?: number;

  /**
   * RFC-0023 phase 4: where the authority grants approved through maker
   * checker are read, to confirm at release that the grant an
   * authorization rests on is still the active one. Without it, an
   * authorization that rests on a grant is refused: fail closed.
   */
  readonly authorityGrants?: Pick<AuthorityGrantRepository, "findActive">;

  /**
   * Revoked authorizations, checked at release. Omitted, no authorization
   * is treated as revoked (tests and legacy fixtures only); production wires it.
   */
  readonly authorizationRevocations?: AuthorizationRevocationList;

  /**
   * Keys whose authorizations may only name the listed capabilities. Used for
   * the verifier key: it signs the read-only fetches that signal checks need,
   * so a compromise of that key cannot release a write.
   */
  readonly verificationOnlyKeys?: {
    readonly keyIds: readonly string[];
    readonly capabilities: readonly string[];
  };
}

/**
 * Execution Gateway.
 *
 * Implements @parmana/execution-system's ExecutionSystem, so
 * it plugs into the existing RuntimeFactory.create() seam
 * exactly like DefaultExecutionSystem or HttpExecutionSystem —
 * no change to RuntimeEngine, RuntimePipeline, or any other
 * core decision-flow component is required.
 *
 * Composes @parmana/envelope-verifier's EnvelopeVerifier
 * rather than reimplementing signature/expiry/TTL/nonce
 * checks, and adds two more side-effect-free checks:
 * recomputing the ExecutableContent hash and comparing it to
 * the authorization's businessTransactionHash (closing the
 * gap where a valid envelope could accompany a modified
 * payload carrying the same businessTransactionId), and --
 * when a PolicyRepository is supplied -- recomputing the
 * current content hash of the policy the authorization was
 * signed under and comparing it to the authorization's own
 * signed policyContentHash, so a stale-policy authorization
 * cannot execute after the policy it relied on has changed.
 *
 * A third additive check (G-31) closes the analogous gap for
 * runtime signals rather than policy content: when a
 * SignalStateVerifier is supplied and the authorization carries a
 * signalsHash, the request's signals (`{}` when absent) are hash-checked
 * against the authorization's signed signalsHash, then independently
 * re-verified against real-world state -- so an authorization whose
 * vendor status, risk exposure, or other declared conditions have
 * since diverged cannot execute either.
 *
 * Verification order (Session 3's ordering rule: side-effect-
 * free checks first, nonce consumed last and only on success):
 *   version -> signature -> expiry -> TTL policy
 *     -> businessTransactionHash recompute-and-compare
 *     -> policyStillCurrent recompute-and-compare (required; fails closed)
 *     -> policyGovernanceVerified approval-record check (required; fails closed)
 *     -> signalsStillCurrent recompute-and-verify (when wired)
 *     -> businessConditionsCurrent: each signed business condition
 *        within its validUntil (RFC-0023 phase 4, when present)
 *     -> authorityGrantInForce: the signed grant unexpired and still
 *        the active one (RFC-0023 phase 4, when present; fails closed)
 *     -> nonce
 *
 * Stateless and deterministic: there is no pause/resume state.
 * A mismatch is a rejection naming the mismatch; a new
 * authorization is simply a new proposal through the runtime.
 */
export class ExecutionGateway implements ExecutionSystem {
  private readonly envelopeVerifier: EnvelopeVerifier;
  private readonly contentHasher: ExecutableContentHasher;
  private readonly policyContentHasher: TrustRecordHasher;
  private readonly signalsHasher: TrustRecordHasher;
  private readonly policyRepository: PolicyRepository | undefined;
  private readonly policyApprovalVerifier: PolicyExecutionVerifier | undefined;
  private readonly requirePolicyBinding: boolean;
  private readonly signalStateVerifier: SignalStateVerifier | undefined;
  private readonly connector: Connector | undefined;
  private readonly executionControl: ExecutionControlOptions | undefined;
  private readonly authorityGrants:
    Pick<AuthorityGrantRepository, "findActive"> | undefined;
  private readonly authorizationRevocations: AuthorizationRevocationList | undefined;
  private readonly verificationOnlyKeys: ExecutionGatewayOptions["verificationOnlyKeys"];

  constructor(options: ExecutionGatewayOptions) {
    this.envelopeVerifier = new EnvelopeVerifier({
      publicKey: options.publicKey,
      nonceStore: options.nonceStore,
      ...(options.keyProvider === undefined
        ? {}
        : { keyProvider: options.keyProvider }),
      ...(options.keyExpiryStore === undefined
        ? {}
        : { keyExpiryStore: options.keyExpiryStore }),
      ...(options.maxTtlSeconds === undefined
        ? {}
        : { maxTtlSeconds: options.maxTtlSeconds }),
    });

    this.contentHasher = new ExecutableContentHasher(CryptoBootstrap.create());

    this.policyContentHasher = new TrustRecordHasher(CryptoBootstrap.create());

    this.signalsHasher = new TrustRecordHasher(CryptoBootstrap.create());

    this.policyRepository = options.policyRepository;
    this.policyApprovalVerifier = options.policyApprovalVerifier;
    this.signalStateVerifier = options.signalStateVerifier;
    this.authorityGrants = options.authorityGrants;
    this.authorizationRevocations = options.authorizationRevocations;
    this.verificationOnlyKeys = options.verificationOnlyKeys;
    this.requirePolicyBinding = options.allowUnverifiedPolicy !== true;

    if (
      options.connector === undefined &&
      options.executionControl === undefined
    ) {
      throw new Error(
        "ExecutionGateway requires a connector or executionControl.",
      );
    }
    if (
      options.connector !== undefined &&
      options.executionControl !== undefined
    ) {
      throw new Error(
        "ExecutionGateway accepts connector or executionControl, not both.",
      );
    }

    if (
      this.requirePolicyBinding &&
      (options.policyRepository === undefined ||
        options.policyApprovalVerifier === undefined)
    ) {
      throw new Error(
        "ExecutionGateway requires a policyRepository and a " +
          "policyApprovalVerifier: it fails closed on policy binding. " +
          "Set allowUnverifiedPolicy only for legacy fixtures, never in production.",
      );
    }

    this.connector = options.connector;
    this.executionControl = options.executionControl;
  }

  /**
   * Runs the full verification sequence without forwarding to
   * the Connector and without throwing. Exposed so callers
   * (and tests) can inspect the structured result directly.
   */
  async verify(
    request: ExecutionRequest,
    now: Date = new Date(),
  ): Promise<{
    result: GatewayVerificationResult;
    executableContent: ExecutableContent;
  }> {
    if (request.authorization === undefined || request.authorization === null) {
      throw new Error(
        "Execution Gateway rejected request: no authorization was presented.",
      );
    }

    const executableContent: ExecutableContent = toExecutableContent(request);

    const { passed, checks } = await this.envelopeVerifier.verifyChecks(
      request.authorization,
      now,
    );

    let businessTransactionHashMatches = false;
    let hashMismatch: GatewayVerificationResult["hashMismatch"];

    if (passed) {
      const actualHash = await this.contentHasher.hash(executableContent);

      const expectedHash =
        request.authorization.payload.businessTransactionHash;

      businessTransactionHashMatches = actualHash === expectedHash;

      if (!businessTransactionHashMatches) {
        hashMismatch = {
          expected: expectedHash,
          actual: actualHash,
        };
      }
    }

    let policyStillCurrent: boolean | undefined;
    let verifiedPolicy: Policy | undefined;
    let policyContentMismatch: GatewayVerificationResult["policyContentMismatch"];

    const { policyName, policyVersion, policyContentHash } =
      request.authorization.payload;

    let policyGovernanceVerified: boolean | undefined;
    let policyGovernanceViolation: GatewayVerificationResult["policyGovernanceViolation"];

    if (
      passed &&
      businessTransactionHashMatches &&
      this.requirePolicyBinding &&
      policyContentHash === undefined
    ) {
      //
      // Fail closed: an authorization with no signed policyContentHash
      // cannot prove which policy it was issued under, so it is
      // rejected rather than skipped.
      //
      policyStillCurrent = false;
      policyContentMismatch = {
        expected: "(absent: authorization carries no policyContentHash)",
        actual: "n/a",
      };
    } else if (
      passed &&
      businessTransactionHashMatches &&
      this.policyRepository !== undefined &&
      policyContentHash !== undefined
    ) {
      try {
        const currentPolicy = await this.policyRepository.load(
          policyName,
          policyVersion,
        );

        const currentHash = await this.policyContentHasher.hash(currentPolicy);

        policyStillCurrent = currentHash === policyContentHash;

        if (policyStillCurrent) {
          verifiedPolicy = currentPolicy;
        }

        if (!policyStillCurrent) {
          policyContentMismatch = {
            expected: policyContentHash,
            actual: currentHash,
          };
        } else if (this.policyApprovalVerifier !== undefined) {
          //
          // Live hash equals the hash signed into the authorization.
          // It must also equal the hash a checker signed off on: the
          // most recent approval record must exist, verify, and carry
          // this exact content hash. Any error is a failure, never a
          // pass.
          //
          try {
            const violation = await this.policyApprovalVerifier.verify(
              policyName,
              policyVersion,
              currentHash,
            );

            policyGovernanceVerified = violation === undefined;

            if (violation !== undefined) {
              policyGovernanceViolation = { reason: violation.reason };
            }
          } catch (error) {
            policyGovernanceVerified = false;
            policyGovernanceViolation = {
              reason:
                "policy approval verification errored: " +
                (error instanceof Error ? error.message : String(error)),
            };
          }
        }
      } catch {
        //
        // The policy no longer exists at this name/version (e.g. a
        // governed change replaced it in place) -- treated the same
        // as a content mismatch: this authorization's policy is no
        // longer verifiably current.
        //
        policyStillCurrent = false;
        policyContentMismatch = {
          expected: policyContentHash,
          actual: "policy not found",
        };
      }
    }

    let signalsStillCurrent: boolean | undefined;
    let signalsHashMismatch: GatewayVerificationResult["signalsHashMismatch"];
    let signalDivergence: GatewayVerificationResult["signalDivergence"];

    const { signalsHash } = request.authorization.payload;

    if (
      passed &&
      businessTransactionHashMatches &&
      policyStillCurrent !== false &&
      policyGovernanceVerified !== false &&
      this.signalStateVerifier !== undefined &&
      signalsHash !== undefined
    ) {
      //
      // A request without signals is hashed as `{}`, exactly as
      // RuntimeEngine hashes a transaction without signals before
      // signing. Omitting signals therefore matches only an
      // authorization that was itself signed over no signals; it
      // never skips the check.
      //
      const requestSignals = request.signals ?? {};
      const currentSignalsHash = await this.signalsHasher.hash(requestSignals);

      if (currentSignalsHash !== signalsHash) {
        signalsStillCurrent = false;
        signalsHashMismatch = {
          expected: signalsHash,
          actual: currentSignalsHash,
        };
      } else {
        const violations = await this.signalStateVerifier.findViolations(
          {
            action: executableContent.action,
            businessTransactionId: executableContent.businessTransactionId,
            intentParameters: executableContent.parameters,
            intentTarget: executableContent.target,
            stage: "release",
            ...(verifiedPolicy !== undefined ? { policy: verifiedPolicy } : {}),
          },
          requestSignals as PolicySignals,
        );

        signalsStillCurrent = violations.length === 0;

        if (violations.length > 0) {
          signalDivergence = violations;
        }
      }
    }

    //
    // Fail closed on policy binding: unless allowUnverifiedPolicy was
    // set, "not run" is never a pass. The policy hash and the approval
    // record must both have been positively verified, not merely not
    // failed. Legacy mode keeps the older "absent means skipped" rule.
    //
    const policyBindingOk = this.requirePolicyBinding
      ? policyStillCurrent === true && policyGovernanceVerified === true
      : policyStillCurrent !== false && policyGovernanceVerified !== false;

    //
    // RFC-0023 phase 4: what the authorization rests on must still hold
    // at release, not only when the request was decided. Each business
    // condition must be within its signed validUntil, and the authority
    // grant, when there is one, must be unexpired and still the active
    // grant for the caller and capability (not revoked or replaced).
    //
    const { businessConditions, authorityGrant, submittedBy } =
      request.authorization.payload;

    let businessConditionsCurrent: boolean | undefined;
    let expiredConditions: string[] | undefined;

    if (businessConditions !== undefined && businessConditions.length > 0) {
      expiredConditions = businessConditions
        .filter((condition) => {
          const until = Date.parse(condition.validUntil);
          return Number.isNaN(until) || until <= now.getTime();
        })
        .map((condition) => condition.signalKey);
      businessConditionsCurrent = expiredConditions.length === 0;
    }

    let authorityGrantInForce: boolean | undefined;
    let authorityGrantViolation: GatewayVerificationResult["authorityGrantViolation"];

    if (authorityGrant !== undefined) {
      const reason = await this.checkAuthorityGrant(
        authorityGrant,
        submittedBy,
        executableContent.action,
        now,
      );

      authorityGrantInForce = reason === undefined;

      if (reason !== undefined) {
        authorityGrantViolation = { reason };
      }
    }

    //
    // The decision the authorization was signed for must be APPROVED. The
    // signature covers decisionOutcome, so this cannot be changed after
    // issue. A signature over a non-approved decision never releases.
    //
    const decisionApproved =
      request.authorization.payload.decisionOutcome === "APPROVED";

    //
    // Revocation of this one authorization. A read error throws, so it
    // refuses the release rather than releasing unchecked.
    //
    const authorizationRevoked =
      this.authorizationRevocations === undefined
        ? false
        : await this.authorizationRevocations.isRevoked(
            request.authorization.payload.authorizationId,
          );

    //
    // A verification-only key may sign only the read capabilities it is for.
    //
    const keyScopeOk =
      this.verificationOnlyKeys === undefined ||
      !this.verificationOnlyKeys.keyIds.includes(request.authorization.keyId) ||
      this.verificationOnlyKeys.capabilities.includes(executableContent.action);

    const priorChecksPassed =
      passed &&
      decisionApproved &&
      keyScopeOk &&
      !authorizationRevoked &&
      businessTransactionHashMatches &&
      policyBindingOk &&
      signalsStillCurrent !== false &&
      businessConditionsCurrent !== false &&
      authorityGrantInForce !== false;

    //
    // The nonce check is the only check with a side effect,
    // so it runs last and only if every side-effect-free
    // check — including the content hash — passed. A
    // mismatched or forged request must not burn a nonce.
    //
    //
    // With executionControl, the release verifier consumes the nonce, at the
    // same single point every release passes through, including a release
    // that bypasses this gateway. Consuming it here as well would refuse the
    // release. So here it is left undefined and the result is the prior checks.
    //
    const nonceUnseen =
      this.executionControl !== undefined
        ? undefined
        : priorChecksPassed
          ? await this.envelopeVerifier.consumeNonce(request.authorization)
          : false;

    const result: GatewayVerificationResult = {
      valid: priorChecksPassed && nonceUnseen !== false,

      checks: {
        ...checks,
        businessTransactionHashMatches,
        decisionApproved,
        authorizationNotRevoked: !authorizationRevoked,
        verificationKeyScope: keyScopeOk,
        ...(policyStillCurrent === undefined ? {} : { policyStillCurrent }),
        ...(policyGovernanceVerified === undefined
          ? {}
          : { policyGovernanceVerified }),
        ...(signalsStillCurrent === undefined ? {} : { signalsStillCurrent }),
        ...(businessConditionsCurrent === undefined
          ? {}
          : { businessConditionsCurrent }),
        ...(authorityGrantInForce === undefined
          ? {}
          : { authorityGrantInForce }),
        ...(nonceUnseen === undefined ? {} : { nonceUnseen }),
      },

      ...(hashMismatch ? { hashMismatch } : {}),
      ...(policyContentMismatch ? { policyContentMismatch } : {}),
      ...(policyGovernanceViolation ? { policyGovernanceViolation } : {}),
      ...(signalsHashMismatch ? { signalsHashMismatch } : {}),
      ...(signalDivergence ? { signalDivergence } : {}),
      ...(expiredConditions !== undefined && expiredConditions.length > 0
        ? { expiredConditions }
        : {}),
      ...(authorityGrantViolation ? { authorityGrantViolation } : {}),
    };

    return { result, executableContent };
  }

  /**
   * Why the grant an authorization rests on no longer holds at release,
   * or undefined when it still does.
   */
  private async checkAuthorityGrant(
    bound: { readonly grantId: string; readonly validUntil: string },
    callerId: string | undefined,
    capability: string,
    now: Date,
  ): Promise<string | undefined> {
    const until = Date.parse(bound.validUntil);

    if (Number.isNaN(until) || until <= now.getTime()) {
      return `authority grant ${bound.grantId} expired at ${bound.validUntil}`;
    }

    if (this.authorityGrants === undefined) {
      return `authority grant ${bound.grantId} cannot be checked: no grant registry is configured`;
    }

    if (callerId === undefined) {
      return `authority grant ${bound.grantId} cannot be checked: the authorization names no caller`;
    }

    let active;

    try {
      active = await this.authorityGrants.findActive(callerId, capability);
    } catch (error) {
      return `authority grant ${bound.grantId} could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }

    if (active === null || active.grantId !== bound.grantId) {
      return `authority grant ${bound.grantId} is no longer the active grant of "${callerId}" for "${capability}" (revoked or replaced)`;
    }

    if (active.validUntil.getTime() <= now.getTime()) {
      return `authority grant ${bound.grantId} expired at ${active.validUntil.toISOString()}`;
    }

    return undefined;
  }

  /**
   * Verifies the request, then forwards the verified, frozen
   * content to the Connector. Throws when verification fails —
   * naming every failing check, and both hashes on a content
   * mismatch — so the caller (ExecutionComponent) marks the
   * Execution failed rather than silently dropping it.
   */
  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const { result, executableContent } = await this.verify(request);

    if (!result.valid) {
      if (this.isSoleFailureNonceReplay(result)) {
        throw new NonceAlreadyConsumedError(
          executableContent.businessTransactionId,
        );
      }

      if (this.isOnlyNoLongerValid(result)) {
        throw new AuthorizationNoLongerValidError(
          executableContent.businessTransactionId,
          [
            ...(result.expiredConditions?.length
              ? [
                  `business condition(s) past their validUntil: ${result.expiredConditions.join(", ")}`,
                ]
              : []),
            ...(result.authorityGrantViolation
              ? [result.authorityGrantViolation.reason]
              : []),
          ],
        );
      }
      throw new Error(this.describeFailure(result));
    }

    const transaction = deepFreeze(executableContent);

    if (this.executionControl !== undefined) {
      if (this.executionControl.service !== undefined) {
        const gatewayAuthentication =
          this.executionControl.mintGatewayAuthentication !== undefined
            ? this.executionControl.mintGatewayAuthentication(
                request.authorization.payload.authorizationId,
              )
            : this.executionControl.gatewayAuthentication;

        return this.executionControl.service.execute(
          {
            authorization: request.authorization,
            executableContent: transaction,
            verifiedTransaction: {
              authorizationVerified: true,
              executableContentVerified: true,
              replayCheckPassed: true,
            },
            executionTimestamp: new Date().toISOString(),
            approvals:
              result.checks.signalsStillCurrent === true
                ? releaseApprovals(request.signals)
                : [],
          },
          gatewayAuthentication,
        );
      }
      if (
        this.executionControl.channel === undefined ||
        this.executionControl.gatewayIdentity === undefined
      ) {
        throw new Error("Execution Gateway executionControl is incomplete.");
      }
      return this.executionControl.channel.release(
        {
          executionId: request.authorization.payload.authorizationId,
          connectorId: this.executionControl.route(transaction),
          transaction,
          authorization: request.authorization,
          verification: result,
        },
        this.executionControl.gatewayIdentity.present(),
      );
    }

    return this.connector!.execute({
      transaction,
      authorization: request.authorization,
      verification: result,
    });
  }

  /**
   * True only when every check other than nonce consumption passed —
   * version, signature, expiry, TTL policy, and the businessTransactionHash
   * recompute-and-compare all succeeded, and nonceUnseen alone is false.
   * Because nonce consumption is attempted only after every prior check
   * passes (see verify()'s priorChecksPassed gating above), this is the
   * one unambiguous signal that the request is an isolated replay of an
   * already-executed authorization, not a forged or malformed one.
   *
   * policyStillCurrent is optional -- undefined means the check was
   * skipped (no PolicyRepository wired, or no policyContentHash on the
   * authorization), not that it failed, so undefined counts as passing
   * here exactly like an absent check always has.
   */
  private isSoleFailureNonceReplay(result: GatewayVerificationResult): boolean {
    const { nonceUnseen, ...otherChecks } = result.checks;

    return (
      nonceUnseen === false &&
      Object.values(otherChecks).every(
        (checkPassed) => checkPassed === true || checkPassed === undefined,
      )
    );
  }

  /**
   * True only when every check passed except the RFC-0023 phase 4 checks
   * (and the nonce, which is not consumed when an earlier check fails):
   * the authorization is genuine and untampered, but a business condition
   * or the authority grant it rests on no longer holds. A forged or
   * tampered request never qualifies, and stays a plain Error.
   */
  private isOnlyNoLongerValid(result: GatewayVerificationResult): boolean {
    const {
      nonceUnseen: _nonce,
      businessConditionsCurrent,
      authorityGrantInForce,
      ...otherChecks
    } = result.checks;

    const policyBound =
      result.policyContentMismatch === undefined &&
      result.policyGovernanceViolation === undefined;

    return (
      (businessConditionsCurrent === false ||
        authorityGrantInForce === false) &&
      policyBound &&
      Object.values(otherChecks).every(
        (checkPassed) => checkPassed === true || checkPassed === undefined,
      )
    );
  }

  private describeFailure(result: GatewayVerificationResult): string {
    const failedChecks = Object.entries(result.checks)
      .filter(([, checkPassed]) => checkPassed === false)
      .map(([name]) => name);

    if (failedChecks.length === 0 && !result.valid) {
      failedChecks.push("policyBindingNotVerified");
    }

    const hashDetail = result.hashMismatch
      ? ` businessTransactionHash mismatch: expected ${result.hashMismatch.expected}, got ${result.hashMismatch.actual}.`
      : "";

    const policyDetail = result.policyContentMismatch
      ? ` policyContentHash mismatch: expected ${result.policyContentMismatch.expected}, got ${result.policyContentMismatch.actual}.`
      : "";

    const governanceDetail = result.policyGovernanceViolation
      ? ` policy approval check failed: ${result.policyGovernanceViolation.reason}.`
      : "";

    const signalsHashDetail = result.signalsHashMismatch
      ? ` signalsHash mismatch: expected ${result.signalsHashMismatch.expected}, got ${result.signalsHashMismatch.actual}.`
      : "";

    const signalDivergenceDetail = result.signalDivergence?.length
      ? ` Signal(s) diverged from verified state: ` +
        result.signalDivergence
          .map(
            (violation) =>
              `${violation.signalKey}=${JSON.stringify(violation.declaredValue)} != verified ${violation.signalKey}=${JSON.stringify(violation.actualValue)}`,
          )
          .join(", ") +
        "."
      : "";

    const conditionsDetail = result.expiredConditions?.length
      ? ` Business condition(s) past their validUntil: ${result.expiredConditions.join(", ")}.`
      : "";

    const grantDetail = result.authorityGrantViolation
      ? ` ${result.authorityGrantViolation.reason}.`
      : "";

    return (
      `Execution Gateway rejected request: failed checks ` +
      `[${failedChecks.join(", ")}].${hashDetail}${policyDetail}${governanceDetail}${signalsHashDetail}${signalDivergenceDetail}${conditionsDetail}${grantDetail}`
    );
  }
}

/**
 * The signed approvals among a request's signals: every signal value
 * shaped as a signed approval (payload.approvalId and payload.issuer
 * with approverId and keyId). Called only after the signals were checked
 * against the authorization's signed signalsHash, so these are the
 * approvals the decision verified, not values sent after it.
 */
function releaseApprovals(
  signals: Readonly<Record<string, unknown>> | undefined,
): readonly ReleaseApproval[] {
  if (signals === undefined) {
    return [];
  }

  const approvals: ReleaseApproval[] = [];

  for (const value of Object.values(signals)) {
    const payload = asRecord(asRecord(value)?.payload);
    const issuer = asRecord(payload?.issuer);

    if (
      typeof payload?.approvalId === "string" &&
      typeof issuer?.approverId === "string" &&
      typeof issuer.keyId === "string"
    ) {
      approvals.push({
        approverId: issuer.approverId,
        keyId: issuer.keyId,
        approvalId: payload.approvalId,
      });
    }
  }

  return approvals;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
