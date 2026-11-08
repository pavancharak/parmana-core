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
    for (const approval of approvals) {
      if (this.consumedNonces.has(approval.nonce)) {
        throw new ApprovalAlreadyUsedError(approval.nonce);
      }
    }
    for (const approval of approvals) {
      this.consumedNonces.add(approval.nonce);
    }
    this.records.set(record.decisionId, record);
  }

  async findById(decisionId: string): Promise<InboundCheckRecord | null> {
    return this.records.get(decisionId) ?? null;
  }
}
