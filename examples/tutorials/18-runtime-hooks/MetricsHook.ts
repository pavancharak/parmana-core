import type {
  BusinessTransaction,
  SignedExecutionAuthorization,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Policy, PolicyDecision } from "@parmana/policy";

import type { RuntimeContext, RuntimeHook } from "@parmana/runtime";

/**
 * Measures the duration of each Runtime phase.
 */
export class MetricsHook implements RuntimeHook {
  private readonly started = new Map<string, number>();

  private start(phase: string): void {
    this.started.set(phase, performance.now());
  }

  private finish(phase: string): void {
    const started = this.started.get(phase);

    if (started === undefined) {
      return;
    }

    const elapsed = performance.now() - started;

    console.log(`[Metrics] ${phase}: ${elapsed.toFixed(2)} ms`);

    this.started.delete(phase);
  }

  async beforePolicyLoad(_transaction: BusinessTransaction): Promise<void> {
    this.start("Policy Load");
  }

  async afterPolicyLoad(
    _transaction: BusinessTransaction,
    _policy: Policy,
  ): Promise<void> {
    this.finish("Policy Load");
  }

  async beforePolicyEvaluation(
    _transaction: BusinessTransaction,
    _policy: Policy,
  ): Promise<void> {
    this.start("Policy Evaluation");
  }

  async afterPolicyEvaluation(
    _transaction: BusinessTransaction,
    _policy: Policy,
    _decision: PolicyDecision,
  ): Promise<void> {
    this.finish("Policy Evaluation");
  }

  async beforeDecision(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
  ): Promise<void> {
    this.start("Decision");
  }

  async afterDecision(_context: RuntimeContext): Promise<void> {
    this.finish("Decision");
  }

  async beforeAuthorization(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
  ): Promise<void> {
    this.start("Authorization");
  }

  async afterAuthorization(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
    _authorization: SignedExecutionAuthorization,
  ): Promise<void> {
    this.finish("Authorization");
  }

  async beforeExecution(_context: RuntimeContext): Promise<void> {
    this.start("Runtime Pipeline");
  }

  async afterExecution(_context: RuntimeContext): Promise<void> {
    this.finish("Runtime Pipeline");
  }

  async beforeTrustRecord(_context: RuntimeContext): Promise<void> {
    this.start("Trust Pipeline");
  }

  async afterTrustRecord(
    _context: RuntimeContext,
    _trustRecord: ExecutionTrustRecord,
  ): Promise<void> {
    this.finish("Trust Pipeline");
  }

  async onRuntimeError(
    _context: RuntimeContext | undefined,
    error: Error,
  ): Promise<void> {
    console.log(`[Metrics] Runtime failed: ${error.message}`);
  }
}
