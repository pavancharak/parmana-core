import {
  applyChallengeRecordAppend,
  ChallengeRecord,
  ChallengeRecordAppendOperation,
  ChallengeRecordNotFoundError,
  ChallengeRecordRepository,
} from "@parmana/shared";

/**
 * In-memory Challenge Record repository (RFC-0022). Test wiring only
 * — mirrors MemoryRefusalRecordRepository's shape.
 */
export class MemoryChallengeRecordRepository implements ChallengeRecordRepository {
  private readonly records = new Map<string, ChallengeRecord>();

  async create(record: ChallengeRecord): Promise<ChallengeRecord> {
    this.records.set(record.challengeRecordId, record);

    return record;
  }

  async append(
    challengeRecordId: string,
    operation: ChallengeRecordAppendOperation,
  ): Promise<ChallengeRecord> {
    const existing = this.records.get(challengeRecordId);

    if (!existing) {
      throw new ChallengeRecordNotFoundError(challengeRecordId);
    }

    const updated = applyChallengeRecordAppend(existing, operation, new Date());

    this.records.set(challengeRecordId, updated);

    return updated;
  }

  async findById(challengeRecordId: string): Promise<ChallengeRecord | null> {
    return this.records.get(challengeRecordId) ?? null;
  }

  async list(): Promise<readonly ChallengeRecord[]> {
    return [...this.records.values()];
  }
}
