import {
  BusinessTransaction,
  SignedExecutionAuthorization,
  toExecutableContent,
} from "@parmana/shared";

import { ExecutionRequest } from "@parmana/execution-system";

/**
 * Builds the canonical ExecutionRequest forwarded
 * to the configured Execution System.
 *
 * Delegates the businessTransactionId/action/target/parameters mapping
 * to the shared toExecutableContent() helper (@parmana/shared) rather
 * than re-listing those four fields here — the same helper
 * RuntimeEngine.execute() already uses to build the ExecutableContent
 * an authorization is signed over. One canonical derivation means this
 * builder's output can never silently diverge from what was actually
 * authorized (Phase 2F, TD-9).
 */
export class ExecutionRequestBuilder {
  /**
   * Builds an ExecutionRequest from an approved
   * BusinessTransaction and its Signed Execution
   * Authorization.
   */
  public build(
    transaction: BusinessTransaction,
    authorization: SignedExecutionAuthorization,
  ): ExecutionRequest {
    return {
      ...toExecutableContent({
        businessTransactionId: transaction.businessTransactionId,

        action: transaction.intent.action,

        target: transaction.intent.target,

        parameters: transaction.intent.parameters,
      }),

      signals: transaction.signals,

      authorization,
    };
  }
}
