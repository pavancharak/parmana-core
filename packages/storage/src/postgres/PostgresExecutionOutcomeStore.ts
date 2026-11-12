import type { Pool } from "pg";

import {
  reviveExecutionResult,
  type ExecutionOutcome,
  type ExecutionOutcomeStore,
  type ExecutionResult,
  type StuckExecutionOutcome,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Durable, PostgreSQL-backed ExecutionOutcomeStore. Closes the recording half
 * of G-125 (docs/internal/VERIFICATION-GAPS.md): each authorization's outcome is kept
 * against its nonce, so a retry after a lost response can return the result
 * or report the outcome as unknown, instead of being refused with no
 * information.
 *
 * Atomicity: `begin` is one INSERT with ON CONFLICT (nonce) DO NOTHING. The
 * primary key on `nonce` decides the winner at the database. `complete` only
 * updates a row that is still `in_flight`, so a completed row is never
 * overwritten.
 *
 * Fail-closed: any error other than the expected conflict is rethrown. An
 * unrecorded outcome must surface, never be treated as "nothing ran."
 *
 * Writes go through a direct Postgres connection, like PostgresNonceStore.
 */
export class PostgresExecutionOutcomeStore implements ExecutionOutcomeStore {
  constructor(private readonly pool: Pool) {}

  async begin(nonce: string, expiresAt: string): Promise<boolean> {
    try {
      const { rowCount } = await this.pool.query(BEGIN_OUTCOME_SQL, [
        nonce,
        expiresAt,
      ]);

      return rowCount === 1;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }

  async complete(nonce: string, result: ExecutionResult): Promise<void> {
    const { rowCount } = await this.pool.query(COMPLETE_OUTCOME_SQL, [
      nonce,
      JSON.stringify(result),
    ]);

    if (rowCount !== 1) {
      throw new Error(
        `No in-flight execution outcome recorded for nonce '${nonce}'.`,
      );
    }
  }

  async fail(nonce: string, reason: string): Promise<void> {
    const { rowCount } = await this.pool.query(FAIL_OUTCOME_SQL, [
      nonce,
      reason,
    ]);

    if (rowCount !== 1) {
      throw new Error(
        `No in-flight execution outcome recorded for nonce '${nonce}'.`,
      );
    }
  }

  async abort(nonce: string): Promise<void> {
    // Deletes only an in-flight row. A completed or failed row is never removed.
    await this.pool.query(ABORT_OUTCOME_SQL, [nonce]);
  }

  async listStuck(now: Date): Promise<readonly StuckExecutionOutcome[]> {
    const { rows } = await this.pool.query<{ nonce: string; expires_at: Date }>(
      LIST_STUCK_SQL,
      [now.toISOString()],
    );

    return rows.map((row) => ({
      nonce: row.nonce,
      expiresAt: new Date(row.expires_at).toISOString(),
    }));
  }

  async get(nonce: string): Promise<ExecutionOutcome | undefined> {
    const { rows } = await this.pool.query<{
      status: string;
      result: unknown;
      failure_reason: string | null;
    }>(GET_OUTCOME_SQL, [nonce]);

    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    if (row.status === "in_flight") {
      return { status: "in_flight" };
    }

    if (row.status === "failed") {
      return { status: "failed", reason: row.failure_reason ?? "" };
    }

    return { status: "completed", result: reviveExecutionResult(row.result) };
  }
}

const BEGIN_OUTCOME_SQL = `
  INSERT INTO execution_outcomes (nonce, status, expires_at)
  VALUES ($1, 'in_flight', $2)
  ON CONFLICT (nonce) DO NOTHING
`;

const COMPLETE_OUTCOME_SQL = `
  UPDATE execution_outcomes
  SET status = 'completed', result = $2::jsonb, updated_at = now()
  WHERE nonce = $1 AND status = 'in_flight'
`;

const LIST_STUCK_SQL = `
  SELECT nonce, expires_at
  FROM execution_outcomes
  WHERE status = 'in_flight' AND expires_at <= $1
  ORDER BY expires_at
  LIMIT 1000
`;

const GET_OUTCOME_SQL = `
  SELECT status, result, failure_reason
  FROM execution_outcomes
  WHERE nonce = $1
`;

const FAIL_OUTCOME_SQL = `
  UPDATE execution_outcomes
  SET status = 'failed', failure_reason = $2, updated_at = now()
  WHERE nonce = $1 AND status = 'in_flight'
`;

const ABORT_OUTCOME_SQL = `
  DELETE FROM execution_outcomes
  WHERE nonce = $1 AND status = 'in_flight'
`;
