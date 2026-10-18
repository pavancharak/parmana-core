import type { Pool } from "pg";

import type { NonceStore } from "@parmana/envelope-verifier";

import { isUniqueViolation } from "../errors/PostgresErrorCodes.js";

/**
 * Durable, Supabase-backed NonceStore for Policy Change Step-Up
 * Authorization nonces (Policy Governance, maker-checker, Layer 4).
 *
 * Deliberately backed by its own table (consumed_policy_change_step_up_
 * nonces), separate from both consumed_nonces (SupabaseNonceStore,
 * ExecutionGateway's own Authorization-envelope replay protection) and
 * consumed_approval_nonces (SupabaseApprovalNonceStore, Approval
 * Artifact replay protection) -- the same reasoning
 * SupabaseApprovalNonceStore's own comment gives: a step-up envelope's
 * nonce is issued by a distinct trust domain (an individual human
 * checker's own key, provisioned once via generate-api-key.ts) from
 * both of those, and sharing a table would let a coincidental nonce
 * collision between unrelated namespaces falsely report "already
 * consumed," and would couple three independent replay-protection
 * concerns' retention/cleanup lifecycles together for no benefit.
 *
 * Otherwise structurally identical to SupabaseNonceStore/
 * SupabaseApprovalNonceStore -- same interface, same atomicity
 * mechanism (a single INSERT whose PRIMARY KEY on `nonce` is the
 * entire mechanism; a 23505 unique_violation means "already
 * consumed", every other error is rethrown, fail closed), same
 * NODE_ENV=test / production split convention (see
 * packages/api/src/bootstrap/createPolicyChangeStepUpNonceStore.ts).
 */
export class SupabasePolicyChangeStepUpNonceStore implements NonceStore {
  constructor(private readonly pool: Pool) {}

  async checkAndRecord(nonce: string, expiresAt: string): Promise<boolean> {
    try {
      await this.pool.query(INSERT_CONSUMED_STEP_UP_NONCE_SQL, [
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

const INSERT_CONSUMED_STEP_UP_NONCE_SQL = `
  INSERT INTO consumed_policy_change_step_up_nonces (nonce, expires_at)
  VALUES ($1, $2)
`;
