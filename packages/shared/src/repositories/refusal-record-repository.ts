import { RefusalRecord } from "../domain/index.js";

/**
 * Repository for immutable Refusal Records (RFC-0021).
 *
 * At most one RefusalRecord exists per businessTransactionId — unlike
 * ExecutionTrustRecordRepository, there is no append-only sub-history
 * to extend, so this interface is deliberately smaller.
 */
export interface RefusalRecordRepository {
  create(record: RefusalRecord): Promise<RefusalRecord>;

  findByTransactionId(
    businessTransactionId: string,
  ): Promise<RefusalRecord | null>;
}
