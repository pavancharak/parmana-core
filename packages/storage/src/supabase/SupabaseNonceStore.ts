import type { Pool } from "pg";

import type { NonceStore } from "@parmana/envelope-verifier";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Durable, Supabase-backed NonceStore. Closes G-13
 * (docs/VERIFICATION-GAPS.md): replay-nonce state now survives a
 * process restart and is shared across every process pointed at the
 * same Supabase project, rather than being scoped to one process's
 * in-memory Map (@parmana/envelope-verifier's MemoryNonceStore,
 * still the correct choice for tests — see
 * packages/api/src/bootstrap/createNonceStore.ts).
 *
 * Same interface, same semantics, same call-site behavior as
 * MemoryNonceStore — only the backing store changes. checkAndRecord
 * is still called as the last, side-effecting step of envelope
 * verification, strictly before execution (see
 * packages/execution-gateway/src/ExecutionGateway.ts).
 *
 * Atomicity: consumption is a single INSERT into consumed_nonces,
 * whose PRIMARY KEY on `nonce` is the entire mechanism — there is no
 * check-then-set. Two concurrent INSERTs of the same nonce race at
 * the database; exactly one succeeds, the other fails with a 23505
 * unique_violation, which this class maps to "already consumed"
 * (returns false) rather than treating it as a failure.
 *
 * Fail-closed: any other error (network failure, auth failure,
 * missing table, etc.) is rethrown, not swallowed. A rethrown error
 * propagates up through EnvelopeVerifier.consumeNonce ->
 * ExecutionGateway.verify/execute exactly like any other unexpected
 * error in that path already does — the caller marks the execution
 * failed rather than silently treating the nonce as accepted. An
 * unreachable NonceStore means no execution, never a silent fallback.
 *
 * Writes via a direct Postgres connection (PostgresPoolFactory), not
 * supabase-js/PostgREST — this codebase depended on PostgREST for
 * every Supabase-backed table until a stuck PostgREST schema cache on
 * a different table caused a full authenticated-API outage (see
 * SupabaseCallerAuditSink for the original incident). This migration
 * removes that entire class of
 * failure mode (schema cache, role config, exposed-schema settings)
 * from every remaining Supabase-backed table, not just the two that
 * broke first.
 */
export class SupabaseNonceStore implements NonceStore {
  constructor(private readonly pool: Pool) {}

  async checkAndRecord(nonce: string, expiresAt: string): Promise<boolean> {
    try {
      await this.pool.query(INSERT_CONSUMED_NONCE_SQL, [nonce, expiresAt]);

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }
}

const INSERT_CONSUMED_NONCE_SQL = `
  INSERT INTO consumed_nonces (nonce, expires_at)
  VALUES ($1, $2)
`;
