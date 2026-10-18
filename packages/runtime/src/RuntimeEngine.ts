import { DecisionBuilder } from "./DecisionBuilder.js";
import { ExecutionBuilder } from "./ExecutionBuilder.js";
import { ExecutionGate } from "./ExecutionGate.js";
import { RuntimeAuthorizationSigner } from "./RuntimeAuthorizationSigner.js";
import { RefusalRecordBuilder } from "./RefusalRecordBuilder.js";

import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";

import {
  AuthorityStatus,
  BusinessValidationStatus,
  ExecutionAssessmentStatus,
  type AuthorityAssessment,
  type BusinessValidationAssessment,
  type DecisionAssessment,
  BusinessTransaction,
  BusinessTransactionStatus,
  Decision,
  DecisionOutcome,
  ExecutableContent,
  ExecutionTrustRecord,
  JsonValue,
  ParmanaError,
  RefusalRecordRepository,
  toExecutableContent,
} from "@parmana/shared";

import {
  PolicyEngine,
  PolicyError,
  PolicyOutcome,
  PolicyRouter,
  SignalIntentBinder,
  type CapabilityPolicyBinder,
  type Policy,
  type PolicyDecision,
  type PolicyExecutionVerifier,
  type PolicyGovernanceAnchor,
  type PolicyGovernanceAnchorResolver,
  type PolicySignals,
  type SignalIntentBindingViolation,
  type SignalStateVerifier,
  type SignalStateViolation,
} from "@parmana/policy";

import type { RuntimeContext } from "./context/RuntimeContext.js";

import { RuntimePipeline } from "./RuntimePipeline.js";
import { BusinessTrustPipeline } from "./BusinessTrustPipeline.js";
import { ExecutionRecordIncompleteError } from "./errors/ExecutionRecordIncompleteError.js";
import { ExecutionOutcomeUnknownError } from "./errors/ExecutionOutcomeUnknownError.js";
import { RuntimeError } from "./errors/RuntimeError.js";
import type { SigningReadiness } from "./SigningReadiness.js";
import type { ExecutionIntentService } from "./ExecutionIntentService.js";
import {
  findNeededApprovals,
  type ApprovalNeededNotifier,
} from "./ApprovalNeededNotifier.js";

import { RuntimeHookRunner } from "./hooks/RuntimeHookRunner.js";
import { TrustedSignalResolver } from "./business-validation/TrustedSignalResolver.js";
import { AuthorityGrantEvaluator } from "./authority/AuthorityGrantEvaluator.js";

import type { RuntimeHook } from "./hooks/RuntimeHook.js";

/**
 * Canonical Runtime Engine.
 *
 * Responsibilities:
 * - Load the requested policy.
 * - Evaluate the policy deterministically.
 * - Create the Decision artifact.
 * - Create the initial Execution artifact.
 * - Execute the Runtime Pipeline.
 * - Produce the Execution Trust Record.
 */
export class RuntimeEngine {
  private readonly hookRunner: RuntimeHookRunner;

  /**
   * G-24 content-addressed evidence (policy-governance milestone).
   * Self-contained, the same idiom RefusalCrypto/VerificationCrypto
   * use, rather than another optional trailing constructor param --
   * this is a pure, in-memory, side-effect-free computation over an
   * already-loaded Policy document, never a dependency that can be
   * "not configured" the way refusalRecordBuilder/signalStateVerifier
   * legitimately can. Same TrustRecordHasher (canonicalize + sha256)
   * every other content hash in this codebase uses, so this value is
   * directly comparable to PolicyChangeCrypto.hashPolicyContent()'s
   * output for the identical content -- see PolicyReference.contentHash's
   * own doc comment and the deploy-time verification that reads it.
   */
  private readonly policyContentHasher = new TrustRecordHasher(
    CryptoBootstrap.create(),
  );

  /**
   * Hashes the runtime PolicySignals evaluated for a decision (G-31,
   * execution-boundary signal freshness). Same TrustRecordHasher idiom as
   * policyContentHasher above -- deterministic canonical hash, directly
   * comparable to the value ExecutionGateway's signalsStillCurrent check
   * recomputes from the signals carried on the ExecutionRequest.
   */
  private readonly signalsHasher = new TrustRecordHasher(
    CryptoBootstrap.create(),
  );

  constructor(
    private readonly pipeline: RuntimePipeline,
    private readonly policyRouter: PolicyRouter,
    private readonly policyEngine: PolicyEngine,
    private readonly signalIntentBinder: SignalIntentBinder,
    private readonly decisionBuilder: DecisionBuilder,
    private readonly executionGate: ExecutionGate,
    private readonly executionBuilder: ExecutionBuilder,
    private readonly trustPipeline: BusinessTrustPipeline,
    private readonly authorizationSigner: RuntimeAuthorizationSigner,
    private readonly authorizationTtlSeconds: number,
    private readonly hooks: RuntimeHook[] = [],
    /**
     * RFC-0021 Refusal Record dependencies. Optional and trailing
     * deliberately: every pre-existing call site that constructs
     * RuntimeEngine directly (with exactly 10 positional args, no
     * hooks) must keep compiling and behaving identically. When
     * either is omitted, refusal-record writing is skipped exactly
     * the same way a write failure is handled (see execute()) --
     * "not configured" and "failed" are treated identically, never
     * blocking or altering the REJECT itself.
     */
    private readonly refusalRecordBuilder?: RefusalRecordBuilder,
    private readonly refusalRecordRepository?: RefusalRecordRepository,
    /**
     * G-24 residual closure (RFC-0022). Optional and trailing for the
     * same reason the RFC-0021 pair above is: every pre-existing call
     * site (exactly 12 positional args) must keep compiling and
     * behaving identically. When omitted, no independent state
     * verification runs -- current behavior, unchanged. When
     * supplied, a violation is treated exactly like a
     * SignalIntentBinder violation: an ordinary policy REJECT, no
     * rule evaluated, no authorization ever generated for it.
     */
    private readonly signalStateVerifier?: SignalStateVerifier,
    /**
     * TD-22 (capability/policy binding). Optional and trailing for the
     * same backward-compatibility reason as signalStateVerifier above:
     * every pre-existing call site must keep compiling and behaving
     * identically. When omitted, no capability/policy binding is
     * enforced -- current behavior, unchanged. When supplied, a
     * capability with a canonical policy binding (see
     * CapabilityPolicyBinding.ts) rejects any request that declares a
     * different policy for it, before that policy is ever loaded or
     * evaluated -- an ordinary policy REJECT, no authorization ever
     * generated.
     */
    private readonly capabilityPolicyBinder?: CapabilityPolicyBinder,
    /**
     * Policy Governance execution-time verification (2026-09-07
     * hardening pass). Optional and trailing for the same
     * backward-compatibility reason as capabilityPolicyBinder above:
     * every pre-existing call site must keep compiling and behaving
     * identically. When omitted, no policy is checked against Policy
     * Governance at execution time -- current behavior, unchanged.
     * When supplied, a policy with no approval record, an approval
     * record whose signature does not verify, or live content that no
     * longer matches its approval record is rejected before
     * PolicyEngine ever evaluates a single rule in it -- an ordinary
     * policy REJECT, no authorization ever generated. Runs before
     * capabilityPolicyBinder/signalIntentBinder for the same reason
     * capabilityPolicyBinder runs before signalIntentBinder: checking
     * a narrower guarantee against a policy that might itself be
     * illegitimate is meaningless. Deliberately not wired to run
     * unconditionally -- see createPolicyExecutionVerifier.ts
     * (packages/api) for why this defaults to unconfigured.
     */
    private readonly policyExecutionVerifier?: PolicyExecutionVerifier,
    /**
     * Evidentiary counterpart to policyExecutionVerifier
     * (docs/VERIFICATION-GAPS.md G-45): never blocks execution, only
     * records what it found. Optional and trailing for the same
     * backward-compatibility reason as every other optional dependency
     * above. When omitted, no governance anchor is resolved --
     * current behavior, unchanged. When supplied, its result is merged
     * onto the trust-record-bound copy of transaction.policy alongside
     * contentHash (G-24), regardless of outcome -- a NO_APPROVAL_RECORD
     * result is recorded exactly like a VERIFIED one, never treated as
     * a failure. A resolver error is caught and logged, never allowed
     * to affect the real authorization outcome -- this is evidence,
     * not enforcement.
     */
    private readonly policyGovernanceAnchorResolver?: PolicyGovernanceAnchorResolver,
    /**
     * G-52. Optional and trailing for the same backward-compatibility
     * reason as every dependency above. When omitted, no signing readiness
     * is checked before release (current behavior, unchanged). When
     * supplied, assertReady() runs before anything is released to a
     * connector and throws SigningUnavailableError (503) if the evidence
     * signing path cannot currently produce a signed Execution Trust
     * Record, so a persistent signing problem is found before the action
     * runs instead of after. Fail closed.
     */
    private readonly signingReadiness?: SigningReadiness,
    /**
     * ADR-0012. Optional and trailing for the same backward-compatibility
     * reason as every dependency above. When omitted, no Execution Intent is
     * written (current behavior, unchanged). When supplied, a signed intent
     * is created and stored BEFORE the action is released, and the release
     * is refused with ExecutionIntentUnavailableError (503) if that fails.
     * After release the execution context is saved so the Trust Record can
     * be rebuilt if it cannot be produced inline.
     */
    private readonly executionIntents?: ExecutionIntentService,
    /**
     * Tells a person when a refused request is waiting for their
     * approval (ApprovalNeededNotifier.ts). Optional: without it,
     * refused requests are found by query, as before.
     */
    private readonly approvalNeededNotifier?: ApprovalNeededNotifier,
    /**
     * Establishes the business facts a policy declares in signalSources
     * (RFC-0023). The default has no sources registered, so a policy
     * that declares any is refused as SOURCE_UNAVAILABLE: fail closed.
     */
    private readonly trustedSignalResolver: TrustedSignalResolver = new TrustedSignalResolver(
      undefined,
    ),
    /**
     * Per-agent authority (RFC-0023 phase 3), for policies with
     * requireAuthorityGrant. The default reads no grants, so such a
     * policy is refused as AUTHORITY_UNCLEAR: fail closed.
     */
    private readonly authorityGrantEvaluator: AuthorityGrantEvaluator = new AuthorityGrantEvaluator(
      undefined,
    ),
  ) {
    if (!pipeline) {
      throw new Error("RuntimePipeline is required.");
    }

    if (!policyRouter) {
      throw new Error("PolicyRouter is required.");
    }

    if (!policyEngine) {
      throw new Error("PolicyEngine is required.");
    }

    if (!signalIntentBinder) {
      throw new Error("SignalIntentBinder is required.");
    }

    if (!trustPipeline) {
      throw new Error("BusinessTrustPipeline is required.");
    }

    if (!authorizationSigner) {
      throw new Error("RuntimeAuthorizationSigner is required.");
    }

    this.hookRunner = new RuntimeHookRunner(hooks);

    //
    // Observability: which optional protections are wired for this
    // instance. Construction-time only, not per-request -- the
    // configuration doesn't change per transaction.
    //
    console.log({
      event: "runtime_engine_constructed",
      signalStateVerifierConfigured: this.signalStateVerifier !== undefined,
      capabilityPolicyBinderConfigured:
        this.capabilityPolicyBinder !== undefined,
      policyExecutionVerifierConfigured:
        this.policyExecutionVerifier !== undefined,
      policyGovernanceAnchorResolverConfigured:
        this.policyGovernanceAnchorResolver !== undefined,
      signingReadinessConfigured: this.signingReadiness !== undefined,
      executionIntentsConfigured: this.executionIntents !== undefined,
      refusalRecordingConfigured:
        this.refusalRecordBuilder !== undefined &&
        this.refusalRecordRepository !== undefined,
    });
  }

  public async execute(transaction: BusinessTransaction): Promise<{
    transaction: BusinessTransaction;
    context: RuntimeContext;
    trustRecord: ExecutionTrustRecord;
  }> {
    //
    // Runtime signals
    //

    const signals = (transaction.signals ?? {}) as Record<string, JsonValue>;

    //
    // Policy loading
    //

    await this.hookRunner.beforePolicyLoad(transaction);

    const policy = await this.policyRouter.load(
      transaction.policy.name,
      transaction.policy.version,
    );

    await this.hookRunner.afterPolicyLoad(transaction, policy);

    //
    // Content hash of the real loaded Policy document (G-24,
    // policy-governance milestone) -- proves exactly what policy
    // *content*, not merely which version string, was in force for
    // this decision. Computed here, from `policy` (what actually
    // loaded), never from `transaction.policy` (what the caller
    // declared) -- see PolicyReference.contentHash's own doc comment.
    //

    const policyContentHash = await this.policyContentHasher.hash(policy);

    //
    // Policy Governance evidence anchor (G-45) -- purely evidentiary,
    // never allowed to affect the real authorization outcome. See
    // policyGovernanceAnchorResolver's own constructor doc comment.
    //

    let policyGovernanceAnchor: PolicyGovernanceAnchor | undefined;

    if (this.policyGovernanceAnchorResolver) {
      try {
        policyGovernanceAnchor =
          await this.policyGovernanceAnchorResolver.resolve(
            policy.policyId,
            policy.policyVersion,
            policyContentHash,
          );
      } catch (error) {
        console.error({
          event: "policy_governance_anchor_resolution_failed",
          policyName: policy.policyId,
          policyVersion: policy.policyVersion,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    //
    // Policy Governance execution-time verification (2026-09-07)
    //
    // Runs before capability/signal-intent binding, over the loaded
    // policy's own declared identity (policy.policyId/policyVersion,
    // never transaction.policy -- what the caller declared) and the
    // content hash just computed above, so no extra hash is computed.
    // See policyExecutionVerifier's own constructor doc comment for
    // why this defaults to unconfigured.
    //

    const policyExecutionViolation = await this.policyExecutionVerifier?.verify(
      policy.policyId,
      policy.policyVersion,
      policyContentHash,
    );

    //
    // Signal/Intent binding
    //
    // Runs before policy evaluation, over the exact signals
    // PolicyEngine is about to evaluate and the exact Intent
    // ExecutionGateway will sign and execute if this is approved.
    // A policy that declares boundSignals is asserting that these
    // particular signals must describe the same real-world action
    // as Intent — closing the gap where a caller could declare a
    // small, fully-verified signals payload while Intent silently
    // targets something else. A violation is treated as an ordinary
    // policy rejection: no rule is evaluated, no authorization is
    // ever generated for it.
    //

    //
    // Capability/Policy binding (TD-22)
    //
    // Some policies' boundSignals/SignalStateVerifier protections are
    // scoped to one specific policy — those protections only apply
    // when that specific policy is the one evaluated. Nothing
    // upstream of this check enforces that a capability is only ever
    // evaluated under its intended policy; a caller could otherwise
    // pair a real capability with an unrelated, unprotected policy and
    // bypass that capability's protections entirely. Runs before
    // SignalIntentBinder for the same reason SignalIntentBinder runs
    // before PolicyEngine: checking a narrower guarantee against an
    // already-wrong policy is meaningless. A violation is treated as
    // an ordinary policy rejection: no rule is evaluated, no
    // authorization is ever generated for it. Capabilities with no
    // canonical binding (every test/tutorial/example action) are
    // entirely unaffected.
    //

    const capabilityBindingViolation =
      policyExecutionViolation === undefined
        ? await this.capabilityPolicyBinder?.findViolation(
            transaction.intent.action,
            transaction.policy,
          )
        : undefined;

    //
    // Per-agent authority (RFC-0023 phase 3)
    //
    // Only for a policy with requireAuthorityGrant, and only once the
    // governance and capability/policy checks pass: the authenticated
    // caller (metadata.submittedBy, set by the server) must hold a
    // current grant for the action, approved through maker checker, and
    // the request must be within its limits. Anything else refuses the
    // request before any business system is asked.
    //

    const grantAuthority =
      policyExecutionViolation === undefined &&
      capabilityBindingViolation === undefined
        ? await this.authorityGrantEvaluator.evaluate({
            policy,
            callerId: transaction.metadata?.submittedBy,
            capability: transaction.intent.action,
            intent: {
              target: transaction.intent.target,
              parameters: transaction.intent.parameters,
            },
          })
        : undefined;

    const authorityGrantRefused =
      grantAuthority !== undefined &&
      grantAuthority.status !== AuthorityStatus.AUTHORIZED;

    const bindingViolations =
      policyExecutionViolation === undefined &&
      capabilityBindingViolation === undefined &&
      !authorityGrantRefused
        ? this.signalIntentBinder.findViolations(policy, signals, {
            target: transaction.intent.target,
            parameters: transaction.intent.parameters,
          })
        : [];

    //
    // Authority and business validation (RFC-0023)
    //
    // Two separate answers, recorded separately on the Decision.
    // Authority: may this kind of action be decided here at all. Today
    // that is the governance and capability/policy checks above (and,
    // at the API, the caller key's capability scope), and, for a policy
    // that requires one, the caller's authority grant. Business validation: are the facts the policy
    // needs established by their sources, for this exact business
    // object. It runs only once authority is established and the
    // proposal describes the Intent, so a request that is not
    // authorized never reaches a business system. Every status other
    // than VALID refuses the request; none is ever turned into VALID.
    //

    const authority: AuthorityAssessment =
      policyExecutionViolation !== undefined
        ? {
            status: AuthorityStatus.AUTHORITY_UNCLEAR,
            reason: `The policy in force could not be established as the approved, current one: ${policyExecutionViolation.reason}.`,
          }
        : capabilityBindingViolation !== undefined
          ? {
              status: AuthorityStatus.NOT_AUTHORIZED,
              reason: `Capability "${capabilityBindingViolation.action}" may only be decided under its bound policy, not the one declared.`,
            }
          : authorityGrantRefused
            ? grantAuthority
            : {
                status: AuthorityStatus.AUTHORIZED,
                reason:
                  `Capability "${transaction.intent.action}" is decided under its approved, current policy ` +
                  `${policy.policyId} ${policy.policyVersion}` +
                  (transaction.metadata?.submittedBy !== undefined
                    ? `, for caller ${transaction.metadata.submittedBy}.`
                    : ".") +
                  (grantAuthority !== undefined
                    ? ` ${grantAuthority.reason}`
                    : "") +
                  " This says the action may be decided, not that this action is valid or was executed.",
                ...(grantAuthority?.grant !== undefined && {
                  grant: grantAuthority.grant,
                }),
              };

    const validation =
      authority.status !== AuthorityStatus.AUTHORIZED
        ? {
            assessment: {
              status: BusinessValidationStatus.NOT_EVALUATED,
              reason: "Not evaluated: authority was not established.",
            },
            trustedValues: {},
          }
        : bindingViolations.length > 0
          ? {
              assessment: {
                status: BusinessValidationStatus.INVALID,
                reason:
                  "The proposed facts do not describe the action being executed.",
              },
              trustedValues: {},
            }
          : await this.trustedSignalResolver.resolve({
              policy,
              action: transaction.intent.action,
              businessTransactionId: transaction.businessTransactionId,
              intent: {
                target: transaction.intent.target,
                parameters: transaction.intent.parameters,
              },
              proposedSignals: signals,
            });

    const businessValidation: BusinessValidationAssessment =
      validation.assessment;

    const businessValidationFailed =
      authority.status === AuthorityStatus.AUTHORIZED &&
      bindingViolations.length === 0 &&
      businessValidation.status !== BusinessValidationStatus.VALID &&
      businessValidation.status !== BusinessValidationStatus.NOT_EVALUATED;

    //
    // What the policy evaluates: the proposal, with every sourced fact
    // replaced by the value its source established. A sourced fact the
    // caller did not send is supplied here; one it sent differently was
    // already refused above as INVALID.
    //
    const evaluatedSignals: Record<string, JsonValue> = {
      ...signals,
      ...validation.trustedValues,
    };

    //
    // Policy evaluation
    //

    await this.hookRunner.beforePolicyEvaluation(transaction, policy);

    const provisionalDecision: PolicyDecision =
      policyExecutionViolation !== undefined
        ? {
            policyId: policy.policyId,
            policyVersion: policy.policyVersion,
            outcome: PolicyOutcome.REJECT,
            reason: `Rejected: ${policyExecutionViolation.reason}.`,
            matchedRuleId: "policy-execution-verification-violation",
            evaluatedRules: 0,
            matchedPath: [],
          }
        : capabilityBindingViolation !== undefined
          ? {
              policyId: policy.policyId,
              policyVersion: policy.policyVersion,
              outcome: PolicyOutcome.REJECT,
              reason:
                capabilityBindingViolation.reason !== undefined
                  ? `Rejected: ${capabilityBindingViolation.reason}.`
                  : `Rejected: capability "${capabilityBindingViolation.action}" requires policy ` +
                    `"${capabilityBindingViolation.expected.name}"@"${capabilityBindingViolation.expected.version}", but ` +
                    `"${capabilityBindingViolation.declared.name}"@"${capabilityBindingViolation.declared.version}" was declared.`,
              matchedRuleId: "capability-policy-binding-violation",
              evaluatedRules: 0,
              matchedPath: [],
            }
          : authorityGrantRefused
            ? {
                policyId: policy.policyId,
                policyVersion: policy.policyVersion,
                outcome: PolicyOutcome.REJECT,
                reason: `Rejected: authority ${authority.status}. ${authority.reason}`,
                matchedRuleId: `authority-${authority.status
                  .toLowerCase()
                  .replace(/^authority_/, "")
                  .replace(/_/g, "-")}`,
                evaluatedRules: 0,
                matchedPath: [],
              }
            : bindingViolations.length > 0
              ? {
                  policyId: policy.policyId,
                  policyVersion: policy.policyVersion,
                  outcome: PolicyOutcome.REJECT,
                  reason:
                    "Rejected: declared signal(s) do not match the executed intent (" +
                    bindingViolations
                      .map(
                        (violation) =>
                          `${violation.signalKey}=${JSON.stringify(violation.signalValue)} != intent.${violation.intentPath}=${JSON.stringify(violation.intentValue)}`,
                      )
                      .join(", ") +
                    ").",
                  matchedRuleId: "signal-intent-binding-violation",
                  evaluatedRules: 0,
                  matchedPath: [],
                }
              : businessValidationFailed
                ? {
                    policyId: policy.policyId,
                    policyVersion: policy.policyVersion,
                    outcome: PolicyOutcome.REJECT,
                    reason: `Rejected: business validation ${businessValidation.status}. ${businessValidation.reason}`,
                    matchedRuleId: `business-validation-${businessValidation.status.toLowerCase().replace(/_/g, "-")}`,
                    evaluatedRules: 0,
                    matchedPath: [],
                  }
                : this.policyEngine.evaluate(policy, evaluatedSignals);

    //
    // Signal/State verification (G-24 residual closure, RFC-0022)
    //
    // SignalIntentBinder (above) proves signals describe the same
    // action as Intent; it never proves those signals are *true*.
    // Runs only once the provisional decision is APPROVE: a request
    // already rejected (by binding or by an ordinary policy rule)
    // needs no independent re-fetch of real state -- REJECT is REJECT
    // regardless of whether the underlying facts were also true, and
    // skipping the fetch here preserves "a policy denial makes zero
    // calls to the external system" for every REJECT that isn't
    // itself a state mismatch. When a signalStateVerifier is
    // configured and the provisional decision is APPROVE, it
    // independently re-derives the relevant facts from a real
    // external source; a mismatch overrides the decision to REJECT --
    // no authorization is ever generated for an approval resting on a
    // caller-declared signal that verified state contradicts.
    //

    const stateViolations: readonly SignalStateViolation[] =
      provisionalDecision.outcome === PolicyOutcome.APPROVE &&
      this.signalStateVerifier
        ? await this.signalStateVerifier.findViolations(
            {
              action: transaction.intent.action,
              businessTransactionId: transaction.businessTransactionId,
              intentParameters: transaction.intent.parameters,
              intentTarget: transaction.intent.target,
              stage: "authorize",
              policy,
            },
            evaluatedSignals,
          )
        : [];

    //
    // No approval without a verifier. PolicyValidator makes every
    // approve rule require a signed approval signal, but only the
    // signalStateVerifier checks that the approval behind it is real.
    // Without one, a caller could set that signal true on its own, so
    // an approve decision is refused instead of trusted.
    //

    const policyDecision: PolicyDecision =
      provisionalDecision.outcome === PolicyOutcome.APPROVE &&
      this.signalStateVerifier === undefined
        ? {
            policyId: policy.policyId,
            policyVersion: policy.policyVersion,
            outcome: PolicyOutcome.REJECT,
            reason:
              "Rejected: no approval verifier is configured, so the signed human approval this action needs cannot be checked.",
            matchedRuleId: "approval-verifier-not-configured",
            evaluatedRules: 0,
            matchedPath: [],
          }
        : stateViolations.length > 0
          ? {
              policyId: policy.policyId,
              policyVersion: policy.policyVersion,
              outcome: PolicyOutcome.REJECT,
              reason:
                "Rejected: declared signal(s) do not match independently verified state (" +
                stateViolations
                  .map(
                    (violation) =>
                      `${violation.signalKey}=${JSON.stringify(violation.declaredValue)} != verified ${violation.signalKey}=${JSON.stringify(violation.actualValue)}`,
                  )
                  .join(", ") +
                ").",
              matchedRuleId: "signal-state-verification-violation",
              evaluatedRules: 0,
              matchedPath: [],
            }
          : provisionalDecision;

    await this.hookRunner.afterPolicyEvaluation(
      transaction,
      policy,
      policyDecision,
    );

    //
    // Decision
    //

    await this.hookRunner.beforeDecision(transaction, policyDecision);

    const assessment: DecisionAssessment = {
      authority,
      businessValidation,
      ...(policyDecision.outcome !== PolicyOutcome.APPROVE && {
        execution: {
          status: ExecutionAssessmentStatus.NOT_EXECUTED,
          reason:
            authority.status !== AuthorityStatus.AUTHORIZED
              ? "Not executed: authority was not established."
              : bindingViolations.length > 0 || businessValidationFailed
                ? "Not executed: business validation failed."
                : `Not executed: ${policyDecision.reason ?? "the policy refused the action."}`,
        },
      }),
    };

    const decision = this.decisionBuilder.build(
      transaction,
      policyDecision,
      assessment,
    );

    //
    // Refusal Record (RFC-0021)
    //
    // Evidentiary write only -- must never affect, delay past this
    // synchronous attempt, or block the enforce() call below in any
    // way. Scope is deliberately narrow: only decision.outcome !==
    // APPROVED reaches here at all, which for this method means
    // exactly the two paths RFC-0021 covers (an ordinary
    // PolicyEngine.evaluate REJECT, or the signal-intent-binding
    // REJECT built above) -- not PolicyNotFoundError,
    // PolicyValidationError, or any other couldn't-evaluate failure,
    // none of which reach this point at all.
    //
    if (decision.outcome !== DecisionOutcome.APPROVED) {
      await this.writeRefusalRecord(
        transaction,
        decision,
        bindingViolations,
        policyContentHash,
      );

      // Only a refusal by the policy's own rules, or by an approval
      // that did not verify, can be cured by an approval. A binding,
      // governance or business validation failure cannot.
      if (
        policyExecutionViolation === undefined &&
        capabilityBindingViolation === undefined &&
        !authorityGrantRefused &&
        bindingViolations.length === 0 &&
        !businessValidationFailed
      ) {
        await this.notifyApprovalNeeded(transaction, decision, policy, signals);
      }
    }

    //
    // Enforce
    //

    this.executionGate.enforce(decision);

    const executableContent: ExecutableContent = toExecutableContent({
      businessTransactionId: transaction.businessTransactionId,
      action: transaction.intent.action,
      target: transaction.intent.target,
      parameters: transaction.intent.parameters,
    });

    //
    // Authorization
    //

    await this.hookRunner.beforeAuthorization(transaction, policyDecision);

    const signalsHash = await this.signalsHasher.hash(signals);

    const authorization = await this.authorizationSigner.sign(
      {
        decisionId: decision.decisionId,
        // Reached only past executionGate.enforce(decision) above, so the
        // decision is APPROVED here. Signed into the authorization.
        decisionOutcome: "APPROVED",
        businessTransactionId: transaction.businessTransactionId,
        policyName: transaction.policy.name,
        policyVersion: transaction.policy.version,
        policyContentHash,
        signalsHash,
        ...(transaction.metadata?.submittedBy !== undefined && {
          submittedBy: transaction.metadata.submittedBy,
        }),
        ...(transaction.metadata?.grantedCapability !== undefined && {
          grantedCapability: transaction.metadata.grantedCapability,
        }),
        ...(transaction.metadata?.tenantId !== undefined && {
          tenantId: transaction.metadata.tenantId,
        }),
        // RFC-0023 phase 4: what the authorization rests on, signed, so
        // the release can be refused, and the endpoint can decline, once
        // a fact or the grant no longer holds.
        ...(businessValidation.status === BusinessValidationStatus.VALID &&
          businessValidation.signals !== undefined && {
            businessConditions: businessValidation.signals.map((signal) => ({
              signalId: signal.signalId,
              signalKey: signal.signalKey,
              source: signal.source,
              claim: signal.claim,
              subject: signal.subject,
              value: signal.observedValue,
              validUntil: signal.validUntil.toISOString(),
            })),
          }),
        ...(authority.grant !== undefined && {
          authorityGrant: {
            grantId: authority.grant.grantId,
            validUntil: authority.grant.validUntil.toISOString(),
          },
        }),
        executableContent,
      },
      this.authorizationTtlSeconds,
    );

    await this.hookRunner.afterAuthorization(
      transaction,
      policyDecision,
      authorization,
    );

    //
    // Execution
    //

    const execution = this.executionBuilder.build(transaction, decision);

    //
    // Runtime Context
    //

    const context: RuntimeContext = {
      transaction: {
        ...transaction,
        status: transaction.status ?? BusinessTransactionStatus.RECEIVED,
        // A copy, not a mutation of the caller-supplied transaction.policy
        // (already persisted, contentHash-free, by BusinessTransactionService.accept
        // before RuntimeEngine.execute ever runs) -- this contentHash-bearing
        // version exists only on the copy embedded in the Execution Trust
        // Record produced from this context.
        policy: {
          ...transaction.policy,
          contentHash: policyContentHash,
          ...(policyGovernanceAnchor !== undefined && {
            governanceAnchor: policyGovernanceAnchor,
          }),
        },
      },
      decision,
      authorization,
      execution,
    };

    await this.hookRunner.afterDecision(context);

    await this.hookRunner.beforeExecution(context);

    try {
      //
      // Signing readiness (G-52). Before anything is released to a
      // connector, prove the evidence signing path can currently produce
      // a signed Execution Trust Record. Fails closed with 503, and
      // nothing has been executed.
      //
      await this.signingReadiness?.assertReady();

      //
      // Execution Intent (ADR-0012). Sign and store what is about to be
      // released BEFORE releasing it. If this cannot complete, nothing is
      // released and the caller gets 503 EXECUTION_INTENT_UNAVAILABLE. From
      // here on, a released action always has signed evidence behind it.
      //
      await this.executionIntents?.prepare(context);

      //
      // Runtime Pipeline. The action is released to the connector inside
      // this call.
      //
      let processedContext: RuntimeContext;

      try {
        processedContext = await this.pipeline.execute(context);
      } catch (error) {
        //
        // The release stage raised an error. The action may still have been
        // executed, so the intent is marked ERRORED, not "not released".
        //
        await this.executionIntents?.markErrored(
          context.transaction.businessTransactionId,
          error,
        );

        throw this.outcomeUnknown(context, error);
      }

      //
      // Save the execution context before building the record. If the record
      // cannot be produced or stored, this is what lets it be rebuilt later
      // without calling the connector again. Best effort, never throws.
      //
      await this.executionIntents?.markReleased(processedContext);

      //
      // From here the action has been released. Any failure to produce
      // the record is reported as ExecutionRecordIncompleteError (an
      // executed action with no signed record), never as a generic error
      // that would invite a blind retry.
      //
      try {
        await this.hookRunner.afterExecution(processedContext);

        await this.hookRunner.beforeTrustRecord(processedContext);

        //
        // Business Trust Pipeline
        //

        const trustRecord = await this.trustPipeline.execute(processedContext);

        await this.hookRunner.afterTrustRecord(processedContext, trustRecord);

        return {
          transaction: processedContext.transaction,
          context: processedContext,
          trustRecord,
        };
      } catch (error) {
        throw this.recordIncomplete(processedContext, error);
      }
    } catch (error) {
      await this.hookRunner.onRuntimeError(context, error as Error);

      throw error;
    }
  }

  /**
   * Builds the error for a failure of the release itself (G-63): the action
   * was handed to the execution system and the call failed, so whether it
   * was performed is unknown, which is exactly what the ERRORED intent
   * records. An error that already has its own typed response (a
   * RuntimeError, a ParmanaError such as ConnectorNotRegisteredError, which
   * states that nothing was executed, or a PolicyError the API maps to 400
   * or 404) is passed through unchanged.
   * Anything else, typically a connector that could not be reached, timed
   * out or answered with an error, used to reach the API as a bare 500
   * with no identifiers; it is now EXECUTION_OUTCOME_UNKNOWN with the
   * businessTransactionId and authorizationId, logged at critical severity.
   */
  private outcomeUnknown(context: RuntimeContext, cause: unknown): unknown {
    if (
      cause instanceof RuntimeError ||
      cause instanceof ParmanaError ||
      cause instanceof PolicyError
    ) {
      return cause;
    }

    const businessTransactionId = context.transaction.businessTransactionId;

    const authorizationId = context.authorization?.payload.authorizationId;

    console.error({
      event: "execution_outcome_unknown",
      severity: "critical",
      businessTransactionId,
      authorizationId,
      error: cause instanceof Error ? cause.message : String(cause),
      // The whole error, so the underlying reason is in the log too: a
      // failed fetch reports only "fetch failed", with the real cause (for
      // example getaddrinfo ENOTFOUND) nested inside it.
      detail: cause,
    });

    return new ExecutionOutcomeUnknownError(
      businessTransactionId,
      authorizationId,
      cause,
    );
  }

  /**
   * Builds the error for a failure that happened AFTER the action was
   * released, and logs it at critical severity with every identifier an
   * operator needs to reconcile (G-52). Never swallows the cause: it is
   * carried in the error and in the log.
   */
  private recordIncomplete(
    context: RuntimeContext,
    cause: unknown,
  ): ExecutionRecordIncompleteError {
    const businessTransactionId = context.transaction.businessTransactionId;

    const authorizationId = context.authorization?.payload.authorizationId;

    console.error({
      event: "execution_released_record_failed",
      severity: "critical",
      businessTransactionId,
      authorizationId,
      executionStatus: context.execution?.status,
      error: cause instanceof Error ? cause.message : String(cause),
    });

    return new ExecutionRecordIncompleteError(
      businessTransactionId,
      authorizationId,
      cause,
    );
  }

  /**
   * Builds and persists a Refusal Record for a rejected Decision
   * (RFC-0021 §6).
   *
   * This is the single most important property in this method: a
   * failure here -- refusalRecordBuilder/refusalRecordRepository not
   * configured, a signing error, a storage outage, anything -- is
   * caught here and never rethrown. The caller (execute(), right
   * before executionGate.enforce()) always proceeds to enforce the
   * REJECT exactly as if this method did not exist. The refusal
   * itself must never depend on its own evidence being writable;
   * only the opposite (evidence depends on the refusal) would ever
   * be acceptable. A failure is still loud, not silent: logged via
   * console.error so an operator can find and reconcile the gap,
   * matching this codebase's existing severity-flagging pattern for
   * evidentiary write failures.
   */
  private async writeRefusalRecord(
    transaction: BusinessTransaction,
    decision: Decision,
    bindingViolations: SignalIntentBindingViolation[],
    policyContentHash: string,
  ): Promise<void> {
    if (!this.refusalRecordBuilder || !this.refusalRecordRepository) {
      return;
    }

    try {
      const refusalRecord = await this.refusalRecordBuilder.build(
        transaction.businessTransactionId,
        decision,
        {
          target: transaction.intent.target,
          parameters: transaction.intent.parameters,
        },
        bindingViolations,
        transaction.metadata?.submittedBy,
        policyContentHash,
      );

      await this.refusalRecordRepository.create(refusalRecord);
    } catch (error) {
      console.error({
        event: "refusal_record_write_failed",
        businessTransactionId: transaction.businessTransactionId,
        decisionId: decision.decisionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Notifies approvalNeededNotifier when the refused request would have
   * been authorized with its approval signals true. Like
   * writeRefusalRecord, a failure here is logged and never rethrown,
   * and the wait is bounded, so the refusal never depends on it.
   */
  private async notifyApprovalNeeded(
    transaction: BusinessTransaction,
    decision: Decision,
    policy: Policy,
    signals: PolicySignals,
  ): Promise<void> {
    if (!this.approvalNeededNotifier) {
      return;
    }

    try {
      const approvals = findNeededApprovals(
        this.policyEngine,
        policy,
        signals,
        {
          target: transaction.intent.target,
          parameters: transaction.intent.parameters,
        },
      );

      if (approvals === undefined) {
        return;
      }

      await this.approvalNeededNotifier.notify({
        type: "approval.needed",
        occurredAt: new Date().toISOString(),
        businessTransactionId: transaction.businessTransactionId,
        decisionId: decision.decisionId,
        action: transaction.intent.action,
        target: transaction.intent.target,
        policyId: policy.policyId,
        policyVersion: policy.policyVersion,
        reason: decision.reason,
        ...(transaction.metadata?.submittedBy !== undefined
          ? { submittedBy: transaction.metadata.submittedBy }
          : {}),
        approvals,
      });
    } catch (error) {
      console.error({
        event: "approval_needed_notification_failed",
        businessTransactionId: transaction.businessTransactionId,
        decisionId: decision.decisionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Returns true if the runtime pipeline is empty.
   */
  public isEmpty(): boolean {
    return this.pipeline.isEmpty();
  }

  /**
   * Returns the number of runtime stages.
   */
  public size(): number {
    return this.pipeline.size();
  }
}
