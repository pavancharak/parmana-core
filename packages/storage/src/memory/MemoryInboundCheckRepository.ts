import {
  ApprovalAlreadyUsedError,
  type ConsumedApprovalNonce,
  type InboundCheckRecord,
  type InboundCheckRepository,
} from "@parmana/shared";

/** In-memory inbound check repository (RFC-0024). Lost on restart. */
export class MemoryInboundCheckRepository implements InboundCheckRepository {
  private readonly records = new Map<string, InboundCheckRecord>();
  private readonly consumedNonces = new Set<string>();

  async append(record: InboundCheckRecord): Promise<void> {
    if (this.records.has(record.decisionId)) {
      throw new Error(`Inbound check ${record.decisionId} already exists.`);
    }
    this.records.set(record.decisionId, record);
  }

  async redeem(decisionId: string, _expiresAt: string): Promise<boolean> {
    const key = `redeem:${decisionId}`;
    if (this.consumedNonces.has(key)) return false;
    this.consumedNonces.add(key);
    return true;
  }

  /**
   * Checks every approval and records the decision in one synchronous step, so nothing can interleave.
   * Refuses without writing anything if an approval was already used.
   */
  async appendConsumingApprovals(
    record: InboundCheckRecord,
    approvals: readonly ConsumedApprovalNonce[],
  ): Promise<void> {
    if (this.records.has(record.decisionId)) {
      throw new Error(`Inbound check ${record.decisionId} already exists.`);
    }
    // A nonce is refused when it was consumed before, or when this batch names it twice. The Postgres
    // store gets the second case from its unique constraint inside one transaction; this must match it.
    const batchNonces = new Set<string>();
    for (const approval of approvals) {
      if (this.consumedNonces.has(approval.nonce) || batchNonces.has(approval.nonce)) {
        throw new ApprovalAlreadyUsedError(approval.nonce);
      }
      batchNonces.add(approval.nonce);
    }
    for (const nonce of batchNonces) {
      this.consumedNonces.add(nonce);
    }
    this.records.set(record.decisionId, record);
  }

  async findById(decisionId: string): Promise<InboundCheckRecord | null> {
    return this.records.get(decisionId) ?? null;
  }
}
