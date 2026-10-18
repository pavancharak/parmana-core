import {
  ExecutionIntentCrypto,
  RefusalCrypto,
  VerificationCrypto,
} from "@parmana/crypto";

import {
  BusinessTransaction,
  ExecutionIntent,
  ExecutionTrustRecord,
  ExecutionTrustRecordRepository,
  Receipt,
  RefusalRecord,
  RefusalRecordRepository,
  StoredExecutionIntent,
  Verification,
  VerificationStatus,
} from "@parmana/shared";

import type { ExecutionIntentFinalizer } from "./ExecutionIntentFinalizer.js";
import type {
  ExecutionIntentService,
  ResolveExecutionIntentInput,
  ResolveExecutionIntentResult,
} from "./ExecutionIntentService.js";
import { ExecutionIntentNotResolvableError } from "./errors/ExecutionIntentNotResolvableError.js";
import { Runtime } from "./Runtime.js";
import { RuntimeError } from "./errors/RuntimeError.js";

import { VerificationFailedError } from "./errors/VerificationFailedError.js";
import { BusinessTransactionService } from "./services/business-transaction-service.js";
import { ReceiptService } from "./services/receipt-service.js";
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
  ) {
    Object.freeze(this);
  }

  /**
   * Execute Business Transaction through the
   * complete Execution Trust pipeline.
   */
  async execute(
    transaction: BusinessTransaction,
  ): Promise<ExecutionTrustRecord> {
    //
    // Accept Business Transaction
    //
    await this.transactions.accept(transaction);

    //
    // Execute Runtime
    //
    await this.runtime.execute(transaction);

    //
    // Verification
    //
    await this.verification.verify(transaction.businessTransactionId);

    //
    // Receipt
    //
    await this.receipts.generate(transaction.businessTransactionId);

    //
    // Load completed Trust Record
    //
    const trustRecord = await this.trustRecords.findByTransactionId(
      transaction.businessTransactionId,
    );

    if (!trustRecord) {
      throw new Error("Execution Trust Record not found.");
    }

    return trustRecord;
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
   * reconciled at the connector (docs/VERIFICATION-GAPS.md G-54). The
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
