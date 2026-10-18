import type { Pool } from "pg";

import type { Policy } from "./types/Policy.js";
import type { PolicyRepository } from "./PolicyRepository.js";

import { PolicyNotFoundError } from "./errors/PolicyNotFoundError.js";
import { PolicyWriteRejectedError } from "./errors/PolicyWriteRejectedError.js";

/**
 * Same name/version validity guard as FilePolicyRepository -- kept
 * independently here (rather than exported/shared) because the reason
 * differs: FilePolicyRepository guards against path traversal, this
 * guards against malformed identifiers reaching a SQL parameter. Both
 * reject the same inputs, which is what PolicyRepository's own doc
 * comment on save() requires of every implementation.
 */
const VALID_NAME_OR_VERSION = /^[A-Za-z0-9._-]+$/;

/**
 * Postgres-backed implementation of PolicyRepository.
 *
 * Exists because Vercel's serverless Functions run on a read-only
 * filesystem -- FilePolicyRepository's save() (a temp-file write plus
 * rename) fails there with EROFS the moment a checker approves a
 * pending policy change in production. This repository gives
 * PolicyChangeApprovalService somewhere writable to persist to
 * instead, using the same (name, version) -> content.json model
 * FilePolicyRepository already established, just backed by the
 * `policies` table (migration 20260916060000) instead of the
 * filesystem.
 */
export class SupabasePolicyRepository implements PolicyRepository {
  constructor(private readonly pool: Pool) {}

  async load(name: string, version: string): Promise<Policy> {
    if (
      !VALID_NAME_OR_VERSION.test(name) ||
      !VALID_NAME_OR_VERSION.test(version)
    ) {
      throw new PolicyNotFoundError(name, version);
    }

    const { rows } = await this.pool.query(SELECT_POLICY_SQL, [name, version]);

    if (!rows[0]) {
      throw new PolicyNotFoundError(name, version);
    }

    return rows[0].content_json as Policy;
  }

  async save(name: string, version: string, content: Policy): Promise<void> {
    if (
      !VALID_NAME_OR_VERSION.test(name) ||
      !VALID_NAME_OR_VERSION.test(version)
    ) {
      throw new PolicyWriteRejectedError(name, version);
    }

    await this.pool.query(UPSERT_POLICY_SQL, [
      name,
      version,
      JSON.stringify(content),
    ]);
  }

  async listAll(): Promise<
    ReadonlyArray<{ readonly name: string; readonly version: string }>
  > {
    const { rows } = await this.pool.query(SELECT_ALL_SQL);

    return rows.map((row) => ({
      name: row.policy_name as string,
      version: row.policy_version as string,
    }));
  }
}

const SELECT_POLICY_SQL = `
  SELECT content_json FROM policies WHERE policy_name = $1 AND policy_version = $2
`;

const UPSERT_POLICY_SQL = `
  INSERT INTO policies (policy_name, policy_version, content_json, updated_at)
  VALUES ($1, $2, $3::jsonb, now())
  ON CONFLICT (policy_name, policy_version)
  DO UPDATE SET content_json = $3::jsonb, updated_at = now()
`;

const SELECT_ALL_SQL = `
  SELECT policy_name, policy_version FROM policies
`;
