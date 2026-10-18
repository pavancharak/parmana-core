import { ExecutionEvidence, ExecutionResult } from "@parmana/shared";

/**
 * Builds canonical ExecutionEvidence from an
 * Enterprise ExecutionResult.
 */
export class ExecutionEvidenceBuilder {
  public build(result: ExecutionResult): ExecutionEvidence {
    return {
      businessTransactionId: result.businessTransactionId,

      action: result.action,

      target: result.target,

      parameters: result.parameters,

      success: result.success,

      executedAt: result.executedAt,

      ...(result.metadata && {
        attributes: result.metadata,
      }),
    };
  }
}
