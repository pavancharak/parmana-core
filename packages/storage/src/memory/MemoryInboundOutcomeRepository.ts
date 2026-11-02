import type {
  InboundOutcomeRecord,
  InboundOutcomeRepository,
} from "@parmana/shared";

/** In-memory inbound outcome repository (RFC-0025). Lost on restart. */
export class MemoryInboundOutcomeRepository implements InboundOutcomeRepository {
  private readonly records = new Map<string, InboundOutcomeRecord>();

  async append(record: InboundOutcomeRecord): Promise<boolean> {
    if (this.records.has(record.decisionId)) return false;
    this.records.set(record.decisionId, record);
    return true;
  }

  async findByDecisionId(
    decisionId: string,
  ): Promise<InboundOutcomeRecord | null> {
    return this.records.get(decisionId) ?? null;
  }
}
