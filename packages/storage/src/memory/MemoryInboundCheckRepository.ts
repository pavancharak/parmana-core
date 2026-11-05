import type {
  InboundCheckRecord,
  InboundCheckRepository,
} from "@parmana/shared";

/** In-memory inbound check repository (RFC-0024). Lost on restart. */
export class MemoryInboundCheckRepository implements InboundCheckRepository {
  private readonly records = new Map<string, InboundCheckRecord>();

  async append(record: InboundCheckRecord): Promise<void> {
    if (this.records.has(record.decisionId)) {
      throw new Error(`Inbound check ${record.decisionId} already exists.`);
    }
    this.records.set(record.decisionId, record);
  }

  async findById(decisionId: string): Promise<InboundCheckRecord | null> {
    return this.records.get(decisionId) ?? null;
  }
}
