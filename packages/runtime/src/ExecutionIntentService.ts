import type {
  ExecutionIntent,
  ExecutionIntentFinalizationMode,
  ExecutionIntentRepository,
  ExecutionIntentResolution,
  StoredExecutionIntent,
} from "@parmana/shared";

import type { RuntimeContext } from "./context/RuntimeContext.js";
import { ExecutionIntentBuilder } from "./ExecutionIntentBuilder.js";
import { ExecutionIntentNotFoundError } from "./errors/ExecutionIntentNotFoundError.js";
import { ExecutionIntentNotResolvableError } from "./errors/ExecutionIntentNotResolvableError.js";
import { ExecutionIntentResolutionInvalidError } from "./errors/ExecutionIntentResolutionInvalidError.js";
import { ExecutionIntentUnavailableError } from "./errors/ExecutionIntentUnavailableError.js";

const RESOLUTIONS: readonly ExecutionIntentResolution[] = [
  "NOT_EXECUTED",
  "EXECUTED",
];

/** The longest note accepted when closing an intent by hand. */
export const MAX_RESOLUTION_NOTE_LENGTH = 2000;

export interface ResolveExecutionIntentInput {
  readonly resolution: unknown;

  readonly note: unknown;

  readonly resolvedBy?: string;
}

export interface ResolveExecutionIntentResult {
  readonly outcome: "RESOLVED" | "ALREADY_RESOLVED";

  readonly stored: StoredExecutionIntent;
}

/**
 * Coordinates the Execution Intent lifecycle for the runtime (ADR-0012).
 *
 * Two different failure rules apply on purpose:
 *
 * - `prepare` is FAIL CLOSED. It runs before an action is released. If the
 *   intent cannot be signed and stored, it throws
 *   ExecutionIntentUnavailableError and the caller must not release anything.
 * - `markReleased`, `markErrored` and `markFinalized` are BEST EFFORT. They run
 *   after release, when the action can no longer be undone, so a bookkeeping
 *   failure must not turn a completed execution into a failed request. They
 *   never throw. They log at critical severity, because an intent left in the
 *   wrong state is exactly what an operator needs to find. The unfinalized
 *   list is the safety net: an intent that never reaches FINALIZED stays
 *   visible.
 */
export class ExecutionIntentService {
  constructor(
    private readonly repository: ExecutionIntentRepository,
    private readonly builder: ExecutionIntentBuilder = new ExecutionIntentBuilder(),
  ) {}

  /**
   * Signs and stores the intent. Call this immediately before release.
   */
  async prepare(context: RuntimeContext): Promise<ExecutionIntent> {
    const businessTransactionId = context.transaction.businessTransactionId;

    try {
      const intent = await this.builder.build(context);

      return await this.repository.create(intent);
    } catch (error) {
      console.error({
        event: "execution_intent_prepare_failed",
        severity: "critical",
        businessTransactionId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new ExecutionIntentUnavailableError(businessTransactionId, error);
    }
  }

  /**
   * Saves the execution context right after the release stage returned, so the
   * Trust Record can be rebuilt if it cannot be produced inline. The context is
   * saved as plain JSON so memory and Postgres storage behave identically.
   */
  async markReleased(context: RuntimeContext): Promise<void> {
    const businessTransactionId = context.transaction.businessTransactionId;

    try {
      await this.repository.markReleased(
        businessTransactionId,
        JSON.parse(JSON.stringify(context)) as unknown,
        new Date(),
      );
    } catch (error) {
      this.logStatusFailure(
        "execution_intent_mark_released_failed",
        businessTransactionId,
        error,
      );
    }
  }

  /**
   * Records that the release stage raised an error. The action may still have
   * been executed, so this is not a claim that nothing happened.
   */
  async markErrored(
    businessTransactionId: string,
    cause: unknown,
  ): Promise<void> {
    try {
      await this.repository.markErrored(
        businessTransactionId,
        cause instanceof Error ? cause.message : String(cause),
      );
    } catch (error) {
      this.logStatusFailure(
        "execution_intent_mark_errored_failed",
        businessTransactionId,
        error,
      );
    }
  }

  async markFinalized(
    businessTransactionId: string,
    trustRecordId: string,
    mode: ExecutionIntentFinalizationMode,
  ): Promise<void> {
    try {
      await this.repository.markFinalized(
        businessTransactionId,
        trustRecordId,
        mode,
        new Date(),
      );
    } catch (error) {
      this.logStatusFailure(
        "execution_intent_mark_finalized_failed",
        businessTransactionId,
        error,
      );
    }
  }

  /**
   * Closes a PREPARED or ERRORED intent that a verified human reconciled at the
   * connector (docs/VERIFICATION-GAPS.md G-54). Records what they found and a
   * required note, attributed and timestamped, in the intent's unsigned status.
   *
   * Never touches a connector. Idempotent: resolving an intent that is already
   * RESOLVED changes nothing and returns ALREADY_RESOLVED with the original
   * resolution. A RELEASED intent is refused, because its execution result is
   * saved and finalize is the right operation. A FINALIZED intent is refused.
   * A lost race is resolved by reading the winner back.
   */
  async resolve(
    businessTransactionId: string,
    input: ResolveExecutionIntentInput,
  ): Promise<ResolveExecutionIntentResult> {
    const resolution = RESOLUTIONS.find((value) => value === input.resolution);

    if (resolution === undefined) {
      throw new ExecutionIntentResolutionInvalidError(
        `resolution must be one of ${RESOLUTIONS.join(", ")}.`,
      );
    }

    const note = typeof input.note === "string" ? input.note.trim() : "";

    if (note.length === 0) {
      throw new ExecutionIntentResolutionInvalidError(
        "note is required. Record what you found at the connector.",
      );
    }

    if (note.length > MAX_RESOLUTION_NOTE_LENGTH) {
      throw new ExecutionIntentResolutionInvalidError(
        `note must be at most ${MAX_RESOLUTION_NOTE_LENGTH} characters.`,
      );
    }

    const stored = await this.repository.findByTransactionId(
      businessTransactionId,
    );

    if (!stored) {
      throw new ExecutionIntentNotFoundError(businessTransactionId);
    }

    if (stored.status.state === "RESOLVED") {
      return { outcome: "ALREADY_RESOLVED", stored };
    }

    this.assertResolvable(businessTransactionId, stored);

    const moved = await this.repository.markResolved(businessTransactionId, {
      resolution,
      note,
      ...(input.resolvedBy !== undefined && { resolvedBy: input.resolvedBy }),
      resolvedAt: new Date(),
    });

    const after = await this.repository.findByTransactionId(
      businessTransactionId,
    );

    if (!after) {
      throw new ExecutionIntentNotFoundError(businessTransactionId);
    }

    if (!moved) {
      if (after.status.state === "RESOLVED") {
        return { outcome: "ALREADY_RESOLVED", stored: after };
      }

      this.assertResolvable(businessTransactionId, after);

      // Still resolvable, yet the update did not apply. Never report success.
      throw new Error(
        `The Execution Intent for '${businessTransactionId}' could not be resolved. Try again.`,
      );
    }

    console.log({
      event: "execution_intent_resolved",
      businessTransactionId,
      resolution,
      resolvedBy: input.resolvedBy,
    });

    return { outcome: "RESOLVED", stored: after };
  }

  private assertResolvable(
    businessTransactionId: string,
    stored: StoredExecutionIntent,
  ): void {
    const state = stored.status.state;

    if (state === "PREPARED" || state === "ERRORED") {
      return;
    }

    throw new ExecutionIntentNotResolvableError(
      businessTransactionId,
      state,
      state === "RELEASED"
        ? "Its execution result was saved, so rebuild the signed Trust Record with finalize instead."
        : "It is already complete.",
    );
  }

  async get(
    businessTransactionId: string,
  ): Promise<StoredExecutionIntent | null> {
    return this.repository.findByTransactionId(businessTransactionId);
  }

  async listUnfinalized(
    limit: number,
  ): Promise<readonly StoredExecutionIntent[]> {
    return this.repository.listUnfinalized(limit);
  }

  private logStatusFailure(
    event: string,
    businessTransactionId: string,
    error: unknown,
  ): void {
    console.error({
      event,
      severity: "critical",
      businessTransactionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
