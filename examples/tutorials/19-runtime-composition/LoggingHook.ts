import type {
  BusinessTransaction,
  SignedExecutionAuthorization,
  ExecutionTrustRecord,
} from "@parmana/shared";

import type { Policy, PolicyDecision } from "@parmana/policy";

import type { RuntimeContext, RuntimeHook } from "@parmana/runtime";

/**
 * Demonstrates observing the complete
 * Runtime lifecycle.
 *
 * Runtime Hooks are observational only.
 * They must never modify Runtime state.
 */
export class LoggingHook implements RuntimeHook {
  async beforePolicyLoad(transaction: BusinessTransaction): Promise<void> {
    console.log(`[Hook] Loading policy for "${transaction.intent.action}".`);
  }

  async afterPolicyLoad(
    _transaction: BusinessTransaction,
    policy: Policy,
  ): Promise<void> {
    console.log(
      `[Hook] Loaded policy ${policy.policyId}@${policy.policyVersion}.`,
    );
  }

  async beforePolicyEvaluation(
    _transaction: BusinessTransaction,
    _policy: Policy,
  ): Promise<void> {
    console.log("[Hook] Evaluating policy.");
  }

  async afterPolicyEvaluation(
    _transaction: BusinessTransaction,
    _policy: Policy,
    decision: PolicyDecision,
  ): Promise<void> {
    console.log(`[Hook] Policy decision: ${decision.outcome}.`);
  }

  async beforeDecision(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
  ): Promise<void> {
    console.log("[Hook] Building Decision artifact.");
  }

  async afterDecision(context: RuntimeContext): Promise<void> {
    console.log(`[Hook] Decision created: ${context.decision.decisionId}.`);
  }

  async beforeAuthorization(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
  ): Promise<void> {
    console.log("[Hook] Signing execution authorization.");
  }

  async afterAuthorization(
    _transaction: BusinessTransaction,
    _decision: PolicyDecision,
    authorization: SignedExecutionAuthorization,
  ): Promise<void> {
    //
    // Temporary debug output.
    // This lets us discover the exact runtime
    // shape of SignedExecutionAuthorization.
    //
    console.log("[Hook] Authorization created:");

    console.dir(authorization, {
      depth: null,
    });
  }

  async beforeExecution(_context: RuntimeContext): Promise<void> {
    console.log("[Hook] Executing runtime pipeline.");
  }

  async afterExecution(_context: RuntimeContext): Promise<void> {
    console.log("[Hook] Runtime pipeline completed.");
  }

  async beforeTrustRecord(_context: RuntimeContext): Promise<void> {
    console.log("[Hook] Building Execution Trust Record.");
  }

  async afterTrustRecord(
    _context: RuntimeContext,
    trustRecord: ExecutionTrustRecord,
  ): Promise<void> {
    console.log(`[Hook] Trust Record created: ${trustRecord.trustRecordId}.`);
  }

  async onRuntimeError(
    _context: RuntimeContext | undefined,
    error: Error,
  ): Promise<void> {
    console.error(`[Hook] Runtime failed: ${error.message}`);
  }
}
