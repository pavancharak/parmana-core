import type {
  InboundDecisionRecord,
  InboundDecisionRepository,
} from "@parmana/shared";

/** In-memory inbound decision repository (RFC-0025). Lost on restart. */
export class MemoryInboundDecisionRepository implements InboundDecisionRepository {
  private readonly records = new Map<string, InboundDecisionRecord>();

  async append(record: InboundDecisionRecord): Promise<void> {
    if (this.records.has(record.decisionId)) {
      throw new Error(`Inbound decision ${record.decisionId} already exists.`);
    }
    this.records.set(record.decisionId, record);
  }

  async findById(decisionId: string): Promise<InboundDecisionRecord | null> {
    return this.records.get(decisionId) ?? null;
  }
}
