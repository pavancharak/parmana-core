import type { Pool } from "pg";

import type {
  CallerKeyRevocation,
  CallerKeyRevocationRepository,
} from "@parmana/shared";

/**
 * Postgres CallerKeyRevocationRepository, backed by
 * caller_key_revocations (20261030120000_add_caller_key_revocations.sql).
 *
 * The primary key on key_hash makes a repeated revoke a no-op, so no
 * separate check is needed. The caller-auth layer depends on isRevoked
 * for every request, so a query error propagates: the caller treats it
 * as refused, never as not revoked.
 */
export class SupabaseCallerKeyRevocationRepository implements CallerKeyRevocationRepository {
  constructor(private readonly pool: Pool) {}

  async isRevoked(keyHash: string): Promise<boolean> {
    const { rowCount } = await this.pool.query(SELECT_REVOCATION_SQL, [
      keyHash,
    ]);

    return (rowCount ?? 0) > 0;
  }

  async revoke(revocation: CallerKeyRevocation): Promise<void> {
    await this.pool.query(INSERT_REVOCATION_SQL, [
      revocation.keyHash,
      revocation.callerId,
      revocation.revokedBy,
      revocation.reason,
      revocation.revokedAt.toISOString(),
    ]);
  }
}

const SELECT_REVOCATION_SQL = `
  SELECT 1 FROM caller_key_revocations WHERE key_hash = $1
`;

const INSERT_REVOCATION_SQL = `
  INSERT INTO caller_key_revocations
    (key_hash, caller_id, revoked_by, reason, revoked_at)
  VALUES ($1, $2, $3, $4, $5)
  ON CONFLICT (key_hash) DO NOTHING
`;
