import type { Pool } from "pg";

import {
  reviveExecutionResult,
  type ExecutionOutcome,
  type ExecutionOutcomeStore,
  type ExecutionResult,
} from "@parmana/shared";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Durable, Supabase-backed ExecutionOutcomeStore. Closes the recording half
 * of G-125 (docs/VERIFICATION-GAPS.md): each authorization's outcome is kept
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
 * Writes go through a direct Postgres connection, like SupabaseNonceStore.
 */
export class SupabaseExecutionOutcomeStore implements ExecutionOutcomeStore {
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

  async get(nonce: string): Promise<ExecutionOutcome | undefined> {
    const { rows } = await this.pool.query<{ status: string; result: unknown }>(
      GET_OUTCOME_SQL,
      [nonce],
    );

    const row = rows[0];

    if (row === undefined) {
      return undefined;
    }

    if (row.status === "in_flight") {
      return { status: "in_flight" };
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

const GET_OUTCOME_SQL = `
  SELECT status, result
  FROM execution_outcomes
  WHERE nonce = $1
`;
