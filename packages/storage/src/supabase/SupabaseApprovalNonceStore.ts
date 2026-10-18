import type { Pool } from "pg";

import type { NonceStore } from "@parmana/envelope-verifier";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Durable, Supabase-backed NonceStore for Approval Artifact nonces
 * (TD-23 closure, Phase 3C).
 *
 * Deliberately backed by its own table (consumed_approval_nonces),
 * separate from consumed_nonces (SupabaseNonceStore, ExecutionGateway's
 * own Authorization-envelope replay protection) -- per
 * §13 of the Phase 3A approval artifact design (in git history), an
 * Approval Artifact's nonce and a Gateway authorization envelope's
 * nonce are distinct trust domains issued by distinct parties (an
 * external business approver vs. Parmana's own runtime); sharing one
 * table would let a coincidental nonce collision between the two
 * unrelated namespaces falsely report "already consumed" for one
 * because of the other, and would couple two independent replay-
 * protection concerns' retention/cleanup lifecycles together for no
 * benefit.
 *
 * Otherwise structurally identical to SupabaseNonceStore -- same
 * interface, same atomicity mechanism (a single INSERT whose PRIMARY
 * KEY on `nonce` is the entire mechanism; a 23505 unique_violation
 * means "already consumed", every other error is rethrown, fail
 * closed), same NODE_ENV=test / production split convention
 * (see packages/api/src/bootstrap/createApprovalNonceStore.ts).
 */
export class SupabaseApprovalNonceStore implements NonceStore {
  constructor(private readonly pool: Pool) {}

  async checkAndRecord(nonce: string, expiresAt: string): Promise<boolean> {
    try {
      await this.pool.query(INSERT_CONSUMED_APPROVAL_NONCE_SQL, [
        nonce,
        expiresAt,
      ]);

      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }

      throw error;
    }
  }
}

const INSERT_CONSUMED_APPROVAL_NONCE_SQL = `
  INSERT INTO consumed_approval_nonces (nonce, expires_at)
  VALUES ($1, $2)
`;
