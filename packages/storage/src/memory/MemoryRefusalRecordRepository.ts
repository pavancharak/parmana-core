import { RefusalRecord, RefusalRecordRepository } from "@parmana/shared";

/**
 * In-memory Refusal Record repository (RFC-0021).
 */
export class MemoryRefusalRecordRepository implements RefusalRecordRepository {
  private readonly records = new Map<string, RefusalRecord>();

  async create(record: RefusalRecord): Promise<RefusalRecord> {
    this.records.set(record.businessTransactionId, record);

    return record;
  }

  async findByTransactionId(
    businessTransactionId: string,
  ): Promise<RefusalRecord | null> {
    return this.records.get(businessTransactionId) ?? null;
  }
}
