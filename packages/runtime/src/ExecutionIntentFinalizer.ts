import type {
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
} from "@parmana/shared";

import { BusinessTrustPipeline } from "./BusinessTrustPipeline.js";
import type { RuntimeContext } from "./context/RuntimeContext.js";
import type { ExecutionIntentService } from "./ExecutionIntentService.js";
import { ExecutionIntentNotFinalizableError } from "./errors/ExecutionIntentNotFinalizableError.js";
import { ExecutionIntentNotFoundError } from "./errors/ExecutionIntentNotFoundError.js";

export type ExecutionIntentFinalizeOutcome = "FINALIZED" | "ALREADY_FINALIZED";

export interface ExecutionIntentFinalizeResult {
  readonly outcome: ExecutionIntentFinalizeOutcome;

  readonly trustRecord: ExecutionTrustRecord;
}

/**
 * Rebuilds the signed Execution Trust Record for an action that was released
 * but whose record could not be produced or stored (ADR-0012, G-53).
 *
 * Guarantees, each covered by a test:
 *
 * - It NEVER calls a connector. It only reads the execution context that was
 *   saved right after release and runs the same record building step the
 *   runtime uses.
 * - It is idempotent. If a Trust Record already exists it returns that record
 *   and builds nothing. Running it twice, or twice at once, produces one
 *   record.
 * - It refuses, with ExecutionIntentNotFinalizableError, when no execution
 *   result was saved, because a record cannot be rebuilt from nothing. That is
 *   the honest limit of this repair.
 */
export class ExecutionIntentFinalizer {
  constructor(
    private readonly intents: ExecutionIntentService,
    private readonly trustRecords: ExecutionTrustRecordRepository,
    private readonly trustPipeline: BusinessTrustPipeline = new BusinessTrustPipeline(),
  ) {}

  async finalize(
    businessTransactionId: string,
  ): Promise<ExecutionIntentFinalizeResult> {
    const stored = await this.intents.get(businessTransactionId);

    if (!stored) {
      throw new ExecutionIntentNotFoundError(businessTransactionId);
    }

    const existing = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (existing) {
      //
      // The record was produced inline. Only the intent's own status was
      // missing, which is repaired here so the two agree.
      //
      if (stored.status.state !== "FINALIZED") {
        await this.intents.markFinalized(
          businessTransactionId,
          existing.trustRecordId,
          "INLINE",
        );
      }

      return { outcome: "ALREADY_FINALIZED", trustRecord: existing };
    }

    if (stored.releasedContext === undefined) {
      throw new ExecutionIntentNotFinalizableError(
        businessTransactionId,
        stored.status.state,
      );
    }

    const trustRecord = await this.trustPipeline.execute(
      stored.releasedContext as RuntimeContext,
    );

    try {
      await this.trustRecords.create(trustRecord);
    } catch (error) {
      //
      // Another finalize call, or the original request, may have stored the
      // record between the check above and this write.
      //
      const raced = await this.trustRecords.findByTransactionId(
        businessTransactionId,
      );

      if (raced) {
        await this.intents.markFinalized(
          businessTransactionId,
          raced.trustRecordId,
          "REPAIRED",
        );

        return { outcome: "ALREADY_FINALIZED", trustRecord: raced };
      }

      throw error;
    }

    await this.intents.markFinalized(
      businessTransactionId,
      trustRecord.trustRecordId,
      "REPAIRED",
    );

    return { outcome: "FINALIZED", trustRecord };
  }
}
