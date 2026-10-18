import { ExecutionMode } from "@parmana/shared";

import type { ExecutionSystem } from "@parmana/execution-system";

import { RuntimeContext } from "../context/RuntimeContext.js";
import type { RuntimeComponent } from "../RuntimeComponent.js";

import { ExecutionService } from "../services/execution-service.js";

import { ExecutionRequestBuilder } from "../ExecutionRequestBuilder.js";
import { ExecutionEvidenceBuilder } from "../ExecutionEvidenceBuilder.js";

/**
 * Execution Component.
 *
 * Runtime stage responsible for executing an
 * approved BusinessTransaction.
 *
 * Responsibilities:
 * - Create the Execution artifact.
 * - Build the ExecutionRequest.
 * - Invoke the Execution System.
 * - Build immutable ExecutionEvidence.
 * - Attach ExecutionEvidence.
 * - Complete or fail the Execution.
 */
export class ExecutionComponent implements RuntimeComponent {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly requestBuilder: ExecutionRequestBuilder,
    private readonly executionSystem: ExecutionSystem,
    private readonly evidenceBuilder: ExecutionEvidenceBuilder,
  ) {
    Object.freeze(this);
  }

  /**
   * Executes an approved BusinessTransaction.
   */
  public async execute(context: RuntimeContext): Promise<RuntimeContext> {
    if (!context.decision) {
      throw new Error("Decision must exist before Execution.");
    }

    if (!context.authorization) {
      throw new Error(
        "Signed Execution Authorization must exist before Execution.",
      );
    }

    //
    // Create the initial Execution artifact.
    //
    let execution = await this.executionService.create(
      context.transaction.businessTransactionId,
      context.decision,
      ExecutionMode.SYNC,
      {
        authorizationId: context.authorization.payload.authorizationId,
      },
    );

    try {
      //
      // Build the approved execution request.
      //
      const request = this.requestBuilder.build(
        context.transaction,
        context.authorization,
      );

      //
      // Forward the approved request to the
      // configured Execution System.
      //
      const response = await this.executionSystem.execute(request);

      //
      // Build immutable ExecutionEvidence.
      //
      const evidence = this.evidenceBuilder.build(response);

      //
      // Attach evidence.
      //
      execution = await this.executionService.attachEvidence(
        execution,
        evidence,
      );

      //
      // Mark execution completed.
      //
      execution = await this.executionService.complete(execution);
    } catch (error) {
      //
      // Mark execution failed.
      //
      await this.executionService.fail(execution);

      throw error;
    }

    return {
      ...context,
      execution,
    };
  }
}
