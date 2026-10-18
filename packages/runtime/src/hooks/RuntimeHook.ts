import {
  BusinessTransaction,
  SignedExecutionAuthorization,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Policy, PolicyDecision } from "@parmana/policy";

import type { RuntimeContext } from "../context/RuntimeContext.js";

/**
 * Runtime lifecycle hooks.
 *
 * Hooks observe the Runtime lifecycle.
 *
 * Hooks must never modify deterministic
 * Runtime behavior.
 */
export interface RuntimeHook {
  //
  // Policy loading
  //

  beforePolicyLoad?(transaction: BusinessTransaction): Promise<void>;

  afterPolicyLoad?(
    transaction: BusinessTransaction,
    policy: Policy,
  ): Promise<void>;

  //
  // Policy evaluation
  //

  beforePolicyEvaluation?(
    transaction: BusinessTransaction,
    policy: Policy,
  ): Promise<void>;

  afterPolicyEvaluation?(
    transaction: BusinessTransaction,
    policy: Policy,
    decision: PolicyDecision,
  ): Promise<void>;

  //
  // Decision
  //

  beforeDecision?(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
  ): Promise<void>;

  afterDecision?(context: RuntimeContext): Promise<void>;

  //
  // Authorization
  //

  beforeAuthorization?(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
  ): Promise<void>;

  afterAuthorization?(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
    authorization: SignedExecutionAuthorization,
  ): Promise<void>;

  //
  // Runtime Pipeline
  //

  beforeExecution?(context: RuntimeContext): Promise<void>;

  afterExecution?(context: RuntimeContext): Promise<void>;

  //
  // Trust Pipeline
  //

  beforeTrustRecord?(context: RuntimeContext): Promise<void>;

  afterTrustRecord?(
    context: RuntimeContext,
    trustRecord: ExecutionTrustRecord,
  ): Promise<void>;

  //
  // Errors
  //

  onRuntimeError?(
    context: RuntimeContext | undefined,
    error: Error,
  ): Promise<void>;
}
