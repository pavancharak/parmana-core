import crypto from "node:crypto";

import {
  BusinessTransactionNotFoundError,
  BusinessTransactionRepository,
  Decision,
  Execution,
  ExecutionEvidence,
  ExecutionMode,
  ExecutionStatus,
  ExecutionTrustRecordRepository,
} from "@parmana/shared";

import { ExecutionChainCrypto } from "@parmana/crypto";

/**
 * Application service responsible for managing the
 * lifecycle of immutable Execution artifacts.
 *
 * Responsibilities:
 * - Create Execution artifacts.
 * - Attach Execution Evidence.
 * - Transition Execution lifecycle state.
 * - Persist Execution artifacts.
 *
 * ExecutionService does NOT:
 * - Evaluate policies.
 * - Execute enterprise business logic.
 * - Verify execution.
 * - Generate trust records.
 */
export class ExecutionService {
  private readonly chainCrypto = new ExecutionChainCrypto();

  constructor(
    private readonly transactions: BusinessTransactionRepository,
    private readonly trustRecords: ExecutionTrustRecordRepository,
  ) {
    Object.freeze(this);
  }

  /**
   * Creates the initial Execution artifact.
   */
  public async create(
    businessTransactionId: string,
    decision: Decision,
    mode: ExecutionMode,
    metadata?: Readonly<Record<string, unknown>>,
  ): Promise<Execution> {
    const transaction = await this.transactions.findById(businessTransactionId);

    if (!transaction) {
      throw new BusinessTransactionNotFoundError(businessTransactionId);
    }

    const draft: Execution = {
      executionId: crypto.randomUUID(),

      businessTransactionId,

      decision,

      status: ExecutionStatus.PROCESSING,

      mode,

      startedAt: new Date(),

      ...(metadata && { metadata }),
    };

    //
    // previousChainHash is always null here: the runtime persists
    // the Execution Trust Record header (trustRecords.create()) only
    // after this whole pipeline stage completes, and today's runtime
    // creates exactly one Execution per business transaction -- so
    // there is never a queryable chain predecessor at this point.
    // The chain-computation logic itself is fully general and will
    // link correctly whenever a genuine predecessor exists.
    //
    const chainFields = await this.chainCrypto.chain(draft, null);

    const execution: Execution = {
      ...draft,
      ...chainFields,
    };

    await this.trustRecords.appendExecution(businessTransactionId, execution);

    return execution;
  }

  /**
   * Attaches immutable ExecutionEvidence to an
   * previously created Execution.
   */
  public async attachEvidence(
    execution: Execution,
    evidence: ExecutionEvidence,
  ): Promise<Execution> {
    const draft: Execution = {
      ...execution,
      evidence,
    };

    const updated = await this.rechain(execution, draft);

    await this.trustRecords.replaceExecution(updated);

    return updated;
  }

  /**
   * Marks an Execution as completed.
   */
  public async complete(execution: Execution): Promise<Execution> {
    const draft: Execution = {
      ...execution,

      status: ExecutionStatus.COMPLETED,

      completedAt: new Date(),
    };

    const completed = await this.rechain(execution, draft);

    await this.trustRecords.replaceExecution(completed);

    return completed;
  }

  /**
   * Marks an Execution as failed.
   */
  public async fail(execution: Execution): Promise<Execution> {
    const draft: Execution = {
      ...execution,

      status: ExecutionStatus.FAILED,

      completedAt: new Date(),
    };

    const failed = await this.rechain(execution, draft);

    await this.trustRecords.replaceExecution(failed);

    return failed;
  }

  /**
   * Recomputes chainHash/chainSignature over an updated draft, fixed
   * to the original Execution's previousChainHash -- the chain
   * predecessor pointer must not move across this row's own
   * lifecycle transitions, only its own signed content does.
   */
  private async rechain(
    original: Execution,
    draft: Execution,
  ): Promise<Execution> {
    const chainFields = await this.chainCrypto.chain(
      draft,
      original.previousChainHash ?? null,
    );

    return {
      ...draft,
      ...chainFields,
    };
  }
}
