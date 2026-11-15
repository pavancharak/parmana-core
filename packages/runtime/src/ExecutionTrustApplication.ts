import {
  ExecutionIntentCrypto,
  RefusalCrypto,
  VerificationCrypto,
} from "@parmana/crypto";

import {
  BusinessTransaction,
  BusinessTransactionNotFoundError,
  EXECUTION_LOCK_TIMEOUT_MS,
  type TransactionDeclarationStore,
  type TransactionExecutionLock,
  ExecutionIntent,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  InvalidStatusTransitionError,
  Receipt,
  RefusalRecord,
  RefusalRecordRepository,
  StoredExecutionIntent,
  TransactionStatus,
  TransactionStatusEvent,
  Verification,
  VerificationStatus,
} from "@parmana/shared";

import type { ExecutionIntentFinalizer } from "./ExecutionIntentFinalizer.js";
import {
  exportTrustRecordsInWindow,
  type WindowExportResult,
} from "./services/trust-record-window-export.js";
import type {
  ExecutionIntentService,
  ResolveExecutionIntentInput,
  ResolveExecutionIntentResult,
} from "./ExecutionIntentService.js";
import { ExecutionIntentNotResolvableError } from "./errors/ExecutionIntentNotResolvableError.js";
import { ExecutionStatusPendingError } from "./errors/ExecutionStatusPendingError.js";
import { Runtime } from "./Runtime.js";
import type { DecisionRequest } from "./RuntimeEngine.js";
import { RuntimeError } from "./errors/RuntimeError.js";

import { VerificationFailedError } from "./errors/VerificationFailedError.js";
import { BusinessTransactionService } from "./services/business-transaction-service.js";
import { ReceiptService } from "./services/receipt-service.js";
import type { TransactionStatusRecorder } from "./services/TransactionStatusRecorder.js";
import { VerificationService } from "./services/verification-service.js";

/**
 * Execution Trust Application.
 *
 * Orchestrates the complete lifecycle:
 *
 * Business Transaction
 *        ↓
 * Runtime
 *        ↓
 * Verification
 *        ↓
 * Receipt
 *        ↓
 * Replay
 */
export class ExecutionTrustApplication {
  private readonly crypto = new VerificationCrypto();

  private readonly refusalCrypto = new RefusalCrypto();

  private readonly executionIntentCrypto = new ExecutionIntentCrypto();

  constructor(
    private readonly transactions: BusinessTransactionService,
    private readonly runtime: Runtime,
    private readonly verification: VerificationService,
    private readonly receipts: ReceiptService,
    private readonly trustRecords: ExecutionTrustRecordRepository,
    /**
     * RFC-0021. Optional so existing callers that construct
     * ExecutionTrustApplication directly (tests) keep compiling.
     * getRefusalRecord()/verifyRefusalRecord() return
     * null/false-shaped results rather than throwing when omitted --
     * see each method.
     */
    private readonly refusalRecords?: RefusalRecordRepository,
    /**
     * ADR-0012. Optional so existing callers that construct
     * ExecutionTrustApplication directly keep compiling. The intent methods
     * below return null or throw a clear "not enabled" error when omitted.
     */
    private readonly executionIntents?: ExecutionIntentService,
    private readonly executionIntentFinalizer?: ExecutionIntentFinalizer,
    /**
     * Transaction status events (decision D23). Optional and trailing. When
     * omitted, declare and execute run without recording status, and
     * reconcileTransaction refuses to run.
     */
    private readonly statusRecorder?: TransactionStatusRecorder,
    /**
     * Writes a declared transaction and its RECEIVED event in one step. Optional;
     * without it, declare writes them one after the other.
     */
    private readonly declarationStore?: TransactionDeclarationStore,
    /**
     * One lock per transaction, held for each execute and reconcile. Optional;
     * without it, two concurrent executes are not serialised.
     */
    private readonly executionLock?: TransactionExecutionLock,
  ) {
    Object.freeze(this);
  }

  /**
   * Decides an inbound request (RFC-0024) without executing it. Runs the same policy, verification
   * and binding checks as execute(), and returns the decision.
   */
  async decideInbound(request: DecisionRequest) {
    // Approvals are consumed with the decision record, in one transaction (G-143, O1).
    return this.runtime.decide(request, { deferApprovalConsumption: true });
  }

  /**
   * Declare: accepts a Business Transaction and records it as RECEIVED. Nothing
   * is decided, signed or released here (decision D23).
   */
  async declare(
    transaction: BusinessTransaction,
  ): Promise<BusinessTransaction> {
    //
    // With a declaration store, the transaction and its RECEIVED event are
    // written in one step (design section 3). Without one, they are written
    // one after the other, as before.
    //
    if (this.statusRecorder) {
      //
      // Fail closed: with status events on, a declaration written in two
      // steps can leave a transaction with no status, which nothing can
      // execute or reconcile. Without the store the server is misconfigured.
      //
      if (!this.declarationStore) {
        throw new Error(
          "Transaction declaration store is not configured: refusing to declare a transaction in two writes while status events are on.",
        );
      }

      await this.transactions.validateForAccept(transaction);
      await this.declarationStore.declare(
        transaction,
        this.statusRecorder.declarationEvent(transaction.businessTransactionId),
      );

      return transaction;
    }

    return this.transactions.accept(transaction);
  }

  /**
   * Execute an accepted Business Transaction through the complete Execution
   * Trust pipeline. Requires the transaction's status to be RECEIVED. A
   * transaction in EXECUTING is never released again here: its outcome is
   * pending until reconcileTransaction decides it (design section 6a).
   */
  async executeAccepted(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    return this.withTransactionLock(businessTransactionId, () =>
      this.runExecuteAccepted(businessTransactionId),
    );
  }

  /**
   * Runs `work` while holding the transaction's lock (design section 7a,
   * decision 4). A second call waits up to EXECUTION_LOCK_TIMEOUT_MS, then is
   * refused with 409, and nothing is decided or released.
   */
  private async withTransactionLock<T>(
    businessTransactionId: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!this.executionLock) {
      //
      // Fail closed: the status check is made inside the lock, and approvals
      // are consumed by the decision, which runs after that check. Without
      // a lock, two executes can both consume an approval (finding 3).
      //
      if (this.statusRecorder) {
        throw new Error(
          "Transaction execution lock is not configured: refusing to execute or reconcile while status events are on.",
        );
      }

      return work();
    }

    const lease = await this.executionLock.acquire(
      businessTransactionId,
      EXECUTION_LOCK_TIMEOUT_MS,
    );

    if (!lease) {
      throw new InvalidStatusTransitionError(
        businessTransactionId,
        "another execute or reconcile of this transaction is in progress; this call did not start",
      );
    }

    try {
      return await work();
    } finally {
      await lease.release();
    }
  }

  private async runExecuteAccepted(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    const transaction = await this.transactions.get(businessTransactionId);

    if (!transaction) {
      throw new BusinessTransactionNotFoundError(businessTransactionId);
    }

    if (this.statusRecorder) {
      const current = await this.statusRecorder.current(businessTransactionId);

      if (current?.status !== "RECEIVED") {
        throw new InvalidStatusTransitionError(
          businessTransactionId,
          notExecutableReason(current?.status ?? null),
        );
      }

      // A legacy transaction was declared before status events existed. It may
      // already have been released by the one-call route, and nothing records
      // that release, so the declared-transaction route refuses it.
      if (current.legacy) {
        throw new InvalidStatusTransitionError(
          businessTransactionId,
          "legacy transaction: declared before status events existed, so an earlier release is not recorded; it is not executed through this route",
        );
      }
    }

    //
    // Execute Runtime
    //
    try {
      await this.runtime.execute(transaction);
    } catch (error) {
      await this.failIfNotReleased(businessTransactionId, error);
      throw error;
    }

    //
    // Verification. Recorded as VERIFIED only when it passes; a failed
    // verification leaves the status EXECUTED (design section 6).
    //
    //
    // Status (D23, finding 18). After a successful release the status is
    // EXECUTED. If it is still EXECUTING, the EXECUTED write failed: the
    // action ran and the trust record exists, but the status is outcome
    // pending. VERIFIED is not attempted then, since EXECUTING has no move
    // to it, and the caller is answered with the pending outcome.
    //
    const outcomePending = await this.isOutcomePending(businessTransactionId);

    const verification = await this.verification.verify(businessTransactionId);

    if (
      this.statusRecorder &&
      !outcomePending &&
      verification.status === VerificationStatus.VERIFIED
    ) {
      try {
        await this.statusRecorder.advance(
          businessTransactionId,
          "VERIFIED",
          "verify",
        );
      } catch (error) {
        console.error({
          event: "transaction_status_write_failed",
          businessTransactionId,
          status: "VERIFIED",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    //
    // Receipt
    //
    await this.receipts.generate(businessTransactionId);

    //
    // Load completed Trust Record
    //
    const trustRecord = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (!trustRecord) {
      throw new Error("Execution Trust Record not found.");
    }

    if (outcomePending) {
      throw new ExecutionStatusPendingError(businessTransactionId, trustRecord);
    }

    return trustRecord;
  }

  /**
   * True when the status is EXECUTING after the release returned: the
   * EXECUTED write failed, so the outcome is pending (D23, finding 18).
   */
  private async isOutcomePending(
    businessTransactionId: string,
  ): Promise<boolean> {
    if (!this.statusRecorder) return false;

    const current = await this.statusRecorder.current(businessTransactionId);

    return current?.status === "EXECUTING";
  }

  /**
   * A failure after APPROVED and before EXECUTING means nothing was released
   * (the release is recorded as EXECUTING first), so the transaction ends as
   * FAILED and the caller declares it again. Any later status is left as it
   * is: EXECUTING is outcome pending, and reconciliation decides it.
   */
  private async failIfNotReleased(
    businessTransactionId: string,
    error: unknown,
  ): Promise<void> {
    if (!this.statusRecorder) return;

    const current = await this.statusRecorder.current(businessTransactionId);

    if (current?.status !== "APPROVED") return;

    try {
      await this.statusRecorder.advance(
        businessTransactionId,
        "FAILED",
        "execute",
        {
          reason: error instanceof Error ? error.message : String(error),
        },
      );
    } catch (recordError) {
      console.error({
        event: "transaction_status_write_failed",
        businessTransactionId,
        status: "FAILED",
        error:
          recordError instanceof Error
            ? recordError.message
            : String(recordError),
      });
    }
  }

  /**
   * Declares and then executes a Business Transaction in one call. Kept for
   * in-process callers; the API uses declare and executeAccepted separately.
   */
  async execute(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    const accepted = await this.declare(transaction);

    return this.executeAccepted(accepted.businessTransactionId);
  }

  /**
   * Returns the current status event of a Business Transaction, or null when no
   * status is recorded.
   */
  async getTransactionStatus(
    businessTransactionId: string,
  ): Promise<TransactionStatusEvent | null> {
    return this.statusRecorder?.current(businessTransactionId) ?? null;
  }

  /** Returns the status history of a Business Transaction, oldest first. */
  async getTransactionStatusHistory(
    businessTransactionId: string,
  ): Promise<readonly TransactionStatusEvent[]> {
    return this.statusRecorder
      ? this.statusRecorder.history(businessTransactionId)
      : [];
  }

  /**
   * Reconciliation (design section 6a). For a transaction left in EXECUTING, it
   * writes the terminal status from the execution intent for it: EXECUTED when
   * the release is recorded, FAILED when an operator recorded that nothing was
   * released. When the outcome cannot be established, it changes nothing and
   * refuses with the outcome unknown. It never releases anything. The route
   * allows only human operators.
   */
  async reconcileTransaction(
    businessTransactionId: string,
    operatorId: string,
  ): Promise<{ changed: boolean; status: TransactionStatus }> {
    return this.withTransactionLock(businessTransactionId, () =>
      this.runReconcile(businessTransactionId, operatorId),
    );
  }

  private async runReconcile(
    businessTransactionId: string,
    operatorId: string,
  ): Promise<{ changed: boolean; status: TransactionStatus }> {
    if (!this.statusRecorder) {
      throw new Error("Transaction status events are not configured.");
    }

    const transaction = await this.transactions.get(businessTransactionId);

    if (!transaction) {
      throw new BusinessTransactionNotFoundError(businessTransactionId);
    }

    const current = await this.statusRecorder.current(businessTransactionId);

    if (!current) {
      throw new InvalidStatusTransitionError(
        businessTransactionId,
        "no status is recorded for this transaction",
      );
    }

    // A terminal status is never changed here (design section 6a, rule 5).
    if (current.status !== "EXECUTING") {
      return { changed: false, status: current.status };
    }

    const stored = await this.executionIntents?.get(businessTransactionId);
    const state = stored?.status.state;
    const resolution = stored?.status.resolution;

    const released =
      state === "RELEASED" ||
      state === "FINALIZED" ||
      (state === "RESOLVED" && resolution === "EXECUTED");

    const notReleased = state === "RESOLVED" && resolution === "NOT_EXECUTED";

    if (released && stored) {
      const event = await this.statusRecorder.advance(
        businessTransactionId,
        "EXECUTED",
        "reconcile",
        {
          reason: `reconciled by operator ${operatorId}: the release is recorded`,
          recordRef: stored.intent.authorizationId,
        },
      );

      return { changed: true, status: event.status };
    }

    if (notReleased) {
      const event = await this.statusRecorder.advance(
        businessTransactionId,
        "FAILED",
        "reconcile",
        {
          reason: `reconciled by operator ${operatorId}: ${stored?.status.resolutionNote ?? "nothing was released"}`,
        },
      );

      return { changed: true, status: event.status };
    }

    throw new InvalidStatusTransitionError(
      businessTransactionId,
      "outcome unknown: the release is not confirmed; no automatic action was taken",
    );
  }

  /**
   * Verify an Execution Trust Record.
   */
  async verify(businessTransactionId: string): Promise<Verification> {
    return this.verification.verify(businessTransactionId);
  }

  /**
   * Generate a Receipt.
   */
  async generateReceipt(businessTransactionId: string): Promise<Receipt> {
    return this.receipts.generate(businessTransactionId);
  }

  /**
   * Re-verifies the stored Execution Trust Record: its signature and hash.
   * It does not re-run the policy decision or the connector, so a true
   * result proves the record is intact, not that the decision would be the
   * same today.
   */
  async replay(businessTransactionId: string): Promise<{
    businessTransactionId: string;
    trustRecordHash: string;
    verified: boolean;
  }> {
    const trustRecord = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (!trustRecord) {
      throw new VerificationFailedError("Execution Trust Record not found.");
    }

    const verified = await this.crypto.verify(trustRecord);

    return {
      businessTransactionId,
      trustRecordHash: trustRecord.trustRecordHash,
      verified,
    };
  }

  /**
   * Get Trust Record.
   */
  async getTrustRecord(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord | null> {
    return this.trustRecords.findByTransactionId(businessTransactionId);
  }

  /**
   * List Execution Trust Records — the bulk/compliance-export
   * counterpart to getTrustRecord()/listTransactions(). Paginates over
   * this.transactions (BusinessTransactionService.list(), the same
   * source listTransactions() above already uses) and resolves each
   * page entry to its full signed Execution Trust Record, rather than
   * adding a parallel pagination path directly against
   * ExecutionTrustRecordRepository — every Business Transaction that
   * exists has exactly one Trust Record (see Runtime.execute()), so
   * paginating the transactions and joining is equivalent to
   * paginating the trust records directly, without requiring every
   * ExecutionTrustRecordRepository implementation (in-memory, Supabase,
   * and any future one) to grow its own list() method.
   *
   * A transaction with no resolvable Trust Record yet (execution still
   * in flight) is silently skipped rather than surfaced as null/error —
   * this endpoint's purpose is exporting settled, signed evidence, not
   * reporting in-flight state.
   */
  async listTrustRecords(
    page = 1,
    pageSize = 25,
  ): Promise<readonly ExecutionTrustRecord[]> {
    const transactions = await this.transactions.list(page, pageSize);

    const records = await Promise.all(
      transactions.map((transaction) =>
        this.trustRecords.findByTransactionId(
          transaction.businessTransactionId,
        ),
      ),
    );

    return records.filter(
      (record): record is ExecutionTrustRecord => record !== null,
    );
  }

  /**
   * Complete export of Trust Records created inside [since, until].
   * Unlike listTrustRecords, the window is applied before paging, so
   * no matching record is lost to a page boundary (G-139). The result
   * is marked truncated when the scan limit was reached with more
   * transactions possibly remaining; callers must refuse it then.
   */
  async exportTrustRecordsInWindow(
    window: {
      readonly since?: Date | undefined;
      readonly until?: Date | undefined;
    },
    include?: ((transaction: BusinessTransaction) => boolean) | undefined,
  ): Promise<WindowExportResult<ExecutionTrustRecord>> {
    return exportTrustRecordsInWindow<
      BusinessTransaction,
      ExecutionTrustRecord
    >(
      {
        listPage: (page, pageSize) => this.transactions.list(page, pageSize),
        include,
        resolve: (transaction) =>
          this.trustRecords.findByTransactionId(
            transaction.businessTransactionId,
          ),
      },
      window,
    );
  }

  /**
   * Get Refusal Record (RFC-0021).
   *
   * Returns null when no RefusalRecordRepository is configured, the
   * same shape as "no record found" -- callers (the GET
   * /refusal/:id route) do not need to distinguish "not wired up"
   * from "nothing to find here."
   */
  async getRefusalRecord(
    businessTransactionId: string,
  ): Promise<RefusalRecord | null> {
    if (!this.refusalRecords) {
      return null;
    }

    return this.refusalRecords.findByTransactionId(businessTransactionId);
  }

  /**
   * Verify a Refusal Record's signature (RFC-0021).
   *
   * Takes the record itself, not an ID -- no database lookup, no
   * caller authentication required. This is the capability that
   * makes a refusal independently third-party-verifiable: anyone
   * holding a RefusalRecord (e.g. the caller who was refused) can
   * check it themselves against Parmana's public key alone.
   */
  async verifyRefusalRecord(refusalRecord: RefusalRecord): Promise<boolean> {
    return this.refusalCrypto.verify(refusalRecord);
  }

  /**
   * Get an Execution Intent and its operational status (ADR-0012). Returns
   * null when none exists, or when Execution Intents are not configured.
   */
  async getExecutionIntent(
    businessTransactionId: string,
  ): Promise<StoredExecutionIntent | null> {
    if (!this.executionIntents) {
      return null;
    }

    return this.executionIntents.get(businessTransactionId);
  }

  /**
   * Execution Intents that never reached a signed Trust Record, oldest first
   * (ADR-0012). Each is an action that may have been released with no signed
   * record, and needs an operator.
   */
  async listUnfinalizedExecutionIntents(
    limit = 50,
  ): Promise<readonly StoredExecutionIntent[]> {
    if (!this.executionIntents) {
      return [];
    }

    return this.executionIntents.listUnfinalized(limit);
  }

  /**
   * Verify an Execution Intent's hash and signature (ADR-0012). Takes the
   * intent itself, so it needs no database and no caller authentication, the
   * same as verifyRefusalRecord: anyone holding an intent can check it against
   * Parmana's public key alone.
   */
  async verifyExecutionIntent(intent: ExecutionIntent): Promise<boolean> {
    return this.executionIntentCrypto.verify(intent);
  }

  /**
   * Rebuild the signed Execution Trust Record for an action that was released
   * but whose record was never produced (ADR-0012, G-53). Never calls a
   * connector. Idempotent. Also completes verification and the receipt, which
   * the normal flow does after the record is stored, so a repaired record ends
   * in the same state as an ordinary one.
   */
  async finalizeExecutionIntent(businessTransactionId: string): Promise<{
    outcome: "FINALIZED" | "ALREADY_FINALIZED";
    trustRecord: ExecutionTrustRecord;
  }> {
    if (!this.executionIntentFinalizer) {
      throw new RuntimeError(
        "Execution Intents are not enabled on this deployment.",
        501,
        "EXECUTION_INTENTS_NOT_ENABLED",
      );
    }

    const result = await this.executionIntentFinalizer.finalize(
      businessTransactionId,
    );

    let trustRecord = result.trustRecord;

    if (trustRecord.verifications.length === 0) {
      await this.verification.verify(businessTransactionId);

      trustRecord = await this.reloadTrustRecord(businessTransactionId);
    }

    if (
      trustRecord.receipts.length === 0 &&
      trustRecord.verifications.at(-1)?.status === VerificationStatus.VERIFIED
    ) {
      await this.receipts.generate(businessTransactionId);

      trustRecord = await this.reloadTrustRecord(businessTransactionId);
    }

    return { outcome: result.outcome, trustRecord };
  }

  /**
   * Close a PREPARED or ERRORED Execution Intent that a verified human
   * reconciled at the connector (docs/internal/VERIFICATION-GAPS.md G-54). The
   * resolution and note are an attributed operator statement in unsigned
   * status, not a signed record. Refused when a signed Trust Record already
   * exists for the transaction, because that intent should be finalized.
   */
  async resolveExecutionIntent(
    businessTransactionId: string,
    input: ResolveExecutionIntentInput,
  ): Promise<ResolveExecutionIntentResult> {
    if (!this.executionIntents) {
      throw new RuntimeError(
        "Execution Intents are not enabled on this deployment.",
        501,
        "EXECUTION_INTENTS_NOT_ENABLED",
      );
    }

    const existing = await this.executionIntents.get(businessTransactionId);

    if (
      existing &&
      existing.status.state !== "RESOLVED" &&
      existing.status.state !== "FINALIZED" &&
      (await this.trustRecords.findByTransactionId(businessTransactionId))
    ) {
      throw new ExecutionIntentNotResolvableError(
        businessTransactionId,
        existing.status.state,
        "A signed Execution Trust Record already exists for it, so run finalize to mark it complete.",
      );
    }

    return this.executionIntents.resolve(businessTransactionId, input);
  }

  private async reloadTrustRecord(
    businessTransactionId: string,
  ): Promise<ExecutionTrustRecord> {
    const record = await this.trustRecords.findByTransactionId(
      businessTransactionId,
    );

    if (!record) {
      throw new Error("Execution Trust Record not found.");
    }

    return record;
  }

  /**
   * Get Business Transaction.
   */
  async getTransaction(
    businessTransactionId: string,
  ): Promise<BusinessTransaction | null> {
    return this.transactions.get(businessTransactionId);
  }

  /**
   * List Business Transactions.
   */
  async listTransactions(
    page = 1,
    pageSize = 25,
  ): Promise<readonly BusinessTransaction[]> {
    return this.transactions.list(page, pageSize);
  }
}

/**
 * Why a transaction cannot be executed now, stated for the caller (design
 * section 2). A transaction in EXECUTING is reported as outcome pending.
 */
function notExecutableReason(status: TransactionStatus | null): string {
  if (status === null) {
    return "no status is recorded for this transaction";
  }

  if (status === "EXECUTING") {
    return "status is EXECUTING: outcome pending";
  }

  return `status is ${status}; execution is allowed only from RECEIVED`;
}
