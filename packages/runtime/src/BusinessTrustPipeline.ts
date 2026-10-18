import { ExecutionTrustRecord } from "@parmana/shared";

import { RuntimeContext } from "./context/RuntimeContext.js";

import { BusinessTrustRecordBuilder } from "./BusinessTrustRecordBuilder.js";

/**
 * Execution Trust Pipeline.
 *
 * Canonical runtime pipeline responsible for producing
 * an immutable Execution Trust Record.
 *
 * The RuntimeContext is expected to contain the artifacts
 * produced by the runtime services:
 *
 * • Business Transaction
 * • Execution
 * • Override (optional)
 * • Verification (optional)
 * • Receipt (optional)
 *
 * The pipeline itself contains no business rules.
 * It simply assembles the canonical trust artifact.
 */
export class BusinessTrustPipeline {
  private readonly builder = new BusinessTrustRecordBuilder();

  /**
   * Executes the canonical Execution Trust Pipeline.
   */
  async execute(context: RuntimeContext): Promise<ExecutionTrustRecord> {
    this.validate(context);

    return await this.builder.build(context);
  }

  /**
   * Validates the minimum runtime requirements.
   */
  private validate(context: RuntimeContext): void {
    if (!context.transaction) {
      throw new Error("Business Transaction is required.");
    }

    if (!context.execution) {
      throw new Error("Execution artifact is required.");
    }
  }
}
