import type { BusinessSignalSourceRegistry } from "./business-validation/BusinessSignalSource.js";
import { TrustedSignalResolver } from "./business-validation/TrustedSignalResolver.js";
import {
  AuthorityGrantEvaluator,
  type AuthorityGrantSource,
} from "./authority/AuthorityGrantEvaluator.js";
import type { SigningReadiness } from "./SigningReadiness.js";
import type { ExecutionIntentService } from "./ExecutionIntentService.js";
import {
  ExecutionTrustRecordRepository,
  RefusalRecordRepository,
  loadConfig,
} from "@parmana/shared";

import {
  CapabilityPolicyBinder,
  PolicyEngine,
  PolicyRouter,
  SignalIntentBinder,
} from "@parmana/policy";

import type {
  CurrentPolicyVersionSource,
  ExternalPolicyBindingSource,
  PolicyExecutionVerifier,
  PolicyGovernanceAnchorResolver,
  PolicyRepository,
  SignalStateVerifier,
} from "@parmana/policy";

import { DecisionBuilder } from "./DecisionBuilder.js";
import { ExecutionBuilder } from "./ExecutionBuilder.js";
import { ExecutionGate } from "./ExecutionGate.js";
import { RuntimeAuthorizationSigner } from "./RuntimeAuthorizationSigner.js";
import { RefusalRecordBuilder } from "./RefusalRecordBuilder.js";

import { Runtime } from "./Runtime.js";
import { RuntimeEngine } from "./RuntimeEngine.js";
import { RuntimePipeline } from "./RuntimePipeline.js";
import { BusinessTrustPipeline } from "./BusinessTrustPipeline.js";

import type { RuntimeComponent } from "./RuntimeComponent.js";

import type { RuntimeHook } from "./hooks/RuntimeHook.js";
import type { ApprovalNeededNotifier } from "./ApprovalNeededNotifier.js";

/**
 * Canonical Runtime Builder.
 *
 * Responsible only for wiring the runtime.
 */
export class RuntimeBuilder {
  private readonly components: RuntimeComponent[] = [];

  private readonly hooks: RuntimeHook[] = [];

  private policyRepository?: PolicyRepository;

  private signalStateVerifier?: SignalStateVerifier;

  private policyExecutionVerifier?: PolicyExecutionVerifier;

  private currentPolicyVersions?: CurrentPolicyVersionSource;

  private externalPolicyBindings?: ExternalPolicyBindingSource;

  private policyGovernanceAnchorResolver?: PolicyGovernanceAnchorResolver;

  private signingReadiness?: SigningReadiness;

  private executionIntents?: ExecutionIntentService;

  private approvalNeededNotifier?: ApprovalNeededNotifier;

  private businessSignalSources?: BusinessSignalSourceRegistry;
  private authorityGrants?: AuthorityGrantSource;

  /**
   * Configure policy directory.
   */
  public withPolicyRepository(repository: PolicyRepository): this {
    this.policyRepository = repository;

    return this;
  }

  /**
   * Configure a Signal/State Verifier (G-24 residual closure,
   * RFC-0022). Optional -- omitting this leaves current behavior
   * unchanged.
   */
  public withSignalStateVerifier(verifier: SignalStateVerifier): this {
    this.signalStateVerifier = verifier;

    return this;
  }

  /**
   * Configure Policy Governance execution-time verification
   * (2026-09-07 hardening pass). Optional -- omitting this leaves
   * current behavior unchanged (no policy is checked against Policy
   * Governance before evaluation).
   */
  public withPolicyExecutionVerifier(verifier: PolicyExecutionVerifier): this {
    this.policyExecutionVerifier = verifier;

    return this;
  }

  /**
   * Take the version in effect for each bound capability's policy from
   * policy governance (G-66) instead of the version written in
   * CANONICAL_CAPABILITY_POLICY_BINDINGS. Configure it wherever
   * withPolicyExecutionVerifier is configured: both mean policy
   * governance decides.
   */
  /**
   * Capabilities bound to a policy by an external connector
   * registration (ADR-0013), checked after the canonical bindings.
   */
  public withExternalPolicyBindings(source: ExternalPolicyBindingSource): this {
    this.externalPolicyBindings = source;
    return this;
  }

  public withCurrentPolicyVersions(source: CurrentPolicyVersionSource): this {
    this.currentPolicyVersions = source;

    return this;
  }

  /**
   * Configure a Policy Governance evidence anchor resolver (G-45).
   * Optional -- omitting this leaves current behavior unchanged (no
   * governance anchor is resolved or recorded). Unlike
   * withPolicyExecutionVerifier above, safe to wire unconditionally:
   * this never blocks or rejects execution.
   */
  public withPolicyGovernanceAnchorResolver(
    resolver: PolicyGovernanceAnchorResolver,
  ): this {
    this.policyGovernanceAnchorResolver = resolver;

    return this;
  }

  /**
   * Configure signing readiness (G-52). Optional -- omitting this leaves
   * current behavior unchanged. When set, RuntimeEngine proves the
   * evidence signing path works BEFORE releasing an action to a connector
   * and fails closed with 503 if it does not.
   */
  public withSigningReadiness(readiness: SigningReadiness): this {
    this.signingReadiness = readiness;

    return this;
  }

  /**
   * Configure Execution Intents (ADR-0012). Optional -- omitting this leaves
   * current behavior unchanged. When set, RuntimeEngine signs and stores an
   * intent BEFORE releasing an action, and fails closed with 503 if it cannot.
   */
  /**
   * Tells a person when a refused request is waiting for their approval.
   */
  public withApprovalNeededNotifier(notifier: ApprovalNeededNotifier): this {
    this.approvalNeededNotifier = notifier;
    return this;
  }

  /**
   * Configure the business systems a policy's signalSources may ask
   * (RFC-0023). Without them, a policy that declares a signal source is
   * refused as SOURCE_UNAVAILABLE.
   */
  public withBusinessSignalSources(
    registry: BusinessSignalSourceRegistry,
  ): this {
    this.businessSignalSources = registry;
    return this;
  }

  /**
   * Configure where per-agent authority grants are read (RFC-0023 phase
   * 3). Without it, a policy with requireAuthorityGrant is refused as
   * AUTHORITY_UNCLEAR.
   */
  public withAuthorityGrants(source: AuthorityGrantSource): this {
    this.authorityGrants = source;
    return this;
  }

  public withExecutionIntents(executionIntents: ExecutionIntentService): this {
    this.executionIntents = executionIntents;

    return this;
  }

  /**
   * Add runtime stage.
   */
  public addStage(component: RuntimeComponent): this {
    this.components.push(component);

    return this;
  }

  /**
   * Add multiple runtime stages.
   */
  public addStages(...components: RuntimeComponent[]): this {
    this.components.push(...components);

    return this;
  }

  /**
   * Remove all stages.
   */
  public clearStages(): this {
    this.components.length = 0;

    return this;
  }

  /**
   * Add runtime hook.
   */
  public addHook(hook: RuntimeHook): this {
    this.hooks.push(hook);

    return this;
  }

  /**
   * Add multiple runtime hooks.
   */
  public addHooks(...hooks: RuntimeHook[]): this {
    this.hooks.push(...hooks);

    return this;
  }

  /**
   * Build immutable Runtime.
   *
   * refusalRecords is optional (RFC-0021) so every pre-existing
   * call site that builds a Runtime without caring about refusal
   * evidence keeps compiling unchanged. Production wiring
   * (RuntimeFactory.create) always passes a real repository.
   */
  public build(
    trustRecords: ExecutionTrustRecordRepository,
    refusalRecords?: RefusalRecordRepository,
  ): Runtime {
    //
    // Runtime pipeline
    //
    const pipeline = new RuntimePipeline(this.components);

    //
    // Policy subsystem
    //
    if (!this.policyRepository) {
      throw new Error("PolicyRepository is required.");
    }

    const router = new PolicyRouter(this.policyRepository);

    const engine = new PolicyEngine();

    const signalIntentBinder = new SignalIntentBinder();

    const capabilityPolicyBinder = new CapabilityPolicyBinder(
      this.currentPolicyVersions,
      this.externalPolicyBindings,
    );

    //
    // Trust subsystem
    //
    const trustPipeline = new BusinessTrustPipeline();

    //
    // Authorization subsystem
    //
    const authorizationSigner = new RuntimeAuthorizationSigner();

    const { ttlSeconds: authorizationTtlSeconds } = loadConfig().authorization;

    //
    // Refusal subsystem (RFC-0021)
    //
    const refusalRecordBuilder = refusalRecords
      ? new RefusalRecordBuilder()
      : undefined;

    //
    // Runtime engine
    //
    const runtimeEngine = new RuntimeEngine(
      pipeline,
      router,
      engine,
      signalIntentBinder,
      new DecisionBuilder(),
      new ExecutionGate(),
      new ExecutionBuilder(),
      trustPipeline,
      authorizationSigner,
      authorizationTtlSeconds,
      this.hooks,
      refusalRecordBuilder,
      refusalRecords,
      this.signalStateVerifier,
      capabilityPolicyBinder,
      this.policyExecutionVerifier,
      this.policyGovernanceAnchorResolver,
      this.signingReadiness,
      this.executionIntents,
      this.approvalNeededNotifier,
      new TrustedSignalResolver(this.businessSignalSources),
      new AuthorityGrantEvaluator(this.authorityGrants),
    );

    //
    // Runtime façade
    //
    return new Runtime(runtimeEngine, trustRecords, this.executionIntents);
  }
}
