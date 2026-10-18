import {
  BusinessTransaction,
  SignedExecutionAuthorization,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Policy, PolicyDecision } from "@parmana/policy";

import type { RuntimeContext } from "../context/RuntimeContext.js";

import type { RuntimeHook } from "./RuntimeHook.js";

/**
 * Executes Runtime Hooks.
 *
 * Hooks execute sequentially in the order
 * they were registered.
 */
export class RuntimeHookRunner {
  public constructor(private readonly hooks: readonly RuntimeHook[] = []) {}

  //
  // Policy loading
  //

  public async beforePolicyLoad(
    transaction: BusinessTransaction,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforePolicyLoad?.(transaction);
    }
  }

  public async afterPolicyLoad(
    transaction: BusinessTransaction,
    policy: Policy,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterPolicyLoad?.(transaction, policy);
    }
  }

  //
  // Policy evaluation
  //

  public async beforePolicyEvaluation(
    transaction: BusinessTransaction,
    policy: Policy,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforePolicyEvaluation?.(transaction, policy);
    }
  }

  public async afterPolicyEvaluation(
    transaction: BusinessTransaction,
    policy: Policy,
    decision: PolicyDecision,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterPolicyEvaluation?.(transaction, policy, decision);
    }
  }

  //
  // Decision
  //

  public async beforeDecision(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforeDecision?.(transaction, decision);
    }
  }

  public async afterDecision(context: RuntimeContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterDecision?.(context);
    }
  }

  //
  // Authorization
  //

  public async beforeAuthorization(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforeAuthorization?.(transaction, decision);
    }
  }

  public async afterAuthorization(
    transaction: BusinessTransaction,
    decision: PolicyDecision,
    authorization: SignedExecutionAuthorization,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterAuthorization?.(transaction, decision, authorization);
    }
  }

  //
  // Runtime Pipeline
  //

  public async beforeExecution(context: RuntimeContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforeExecution?.(context);
    }
  }

  public async afterExecution(context: RuntimeContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterExecution?.(context);
    }
  }

  //
  // Trust Pipeline
  //

  public async beforeTrustRecord(context: RuntimeContext): Promise<void> {
    for (const hook of this.hooks) {
      await hook.beforeTrustRecord?.(context);
    }
  }

  public async afterTrustRecord(
    context: RuntimeContext,
    trustRecord: ExecutionTrustRecord,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.afterTrustRecord?.(context, trustRecord);
    }
  }

  //
  // Errors
  //

  public async onRuntimeError(
    context: RuntimeContext | undefined,
    error: Error,
  ): Promise<void> {
    for (const hook of this.hooks) {
      await hook.onRuntimeError?.(context, error);
    }
  }
}
