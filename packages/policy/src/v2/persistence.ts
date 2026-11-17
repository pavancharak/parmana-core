/**
 * Persistence for policy version 2 (migrations 20261118120000, 20261118130000 and 20261118140000).
 *
 * The register, the review queue and the alert board are saved as snapshots, each with a
 * version. A save names the version it read; if another writer has saved since, the save is
 * refused, so no change is overwritten silently.
 *
 * A register change is saved with its audit events in one transaction: the snapshot and the
 * audit rows are written together or not at all. Audit rows are append only.
 *
 * Evidence is appended, never updated. Each append runs under a database lock and is refused
 * unless it links to the record before it.
 */

import type { Pool, PoolClient } from "pg";

import type { EvidenceRecord } from "./evidence.js";
import type { NonceStore } from "./sourceAnswer.js";

export type Component = "register" | "review" | "alerts";

export class PersistenceConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersistenceConflictError";
  }
}

export interface Saved<T> {
  readonly body: T;
  readonly version: number;
}

/** An audit event to append with a snapshot. */
export interface AuditRow {
  readonly component: Component;
  readonly at: string;
  readonly by: string;
  readonly event: string;
  readonly detail: string;
}

/** A fixed lock key for the evidence log, so only one append runs at a time. */
const EVIDENCE_LOCK = 0x70_6f_6c_79; // "poly"

/** Writes a snapshot on the given connection, checking the version it read. */
async function writeSnapshot(
  client: PoolClient,
  component: Component,
  body: unknown,
  readVersion: number,
): Promise<number> {
  const json = JSON.stringify(body);
  if (readVersion === 0) {
    const inserted = await client.query<{ version: number }>(
      `INSERT INTO policy_v2_state (component, body, version) VALUES ($1, $2, 1)
       ON CONFLICT (component) DO NOTHING RETURNING version`,
      [component, json],
    );
    if (inserted.rowCount === 0) {
      throw new PersistenceConflictError(
        `${component} was saved by another writer. Read it again and retry.`,
      );
    }
    return 1;
  }
  const updated = await client.query<{ version: number }>(
    `UPDATE policy_v2_state SET body = $2, version = version + 1, updated_at = now()
     WHERE component = $1 AND version = $3 RETURNING version`,
    [component, json, readVersion],
  );
  if (updated.rowCount === 0) {
    throw new PersistenceConflictError(
      `${component} changed since it was read (version ${readVersion}). Read it again and retry.`,
    );
  }
  return updated.rows[0]!.version;
}

export class PolicyV2Store {
  constructor(private readonly pool: Pool) {}

  /** The saved snapshot of a component, with its version. Undefined if it has never been saved. */
  async load<T>(component: Component): Promise<Saved<T> | undefined> {
    const result = await this.pool.query<{ body: T; version: number }>(
      "SELECT body, version FROM policy_v2_state WHERE component = $1",
      [component],
    );
    const row = result.rows[0];
    return row === undefined
      ? undefined
      : { body: row.body, version: row.version };
  }

  /**
   * Saves a snapshot. Pass the version you read; 0 means the component has never been saved.
   * Returns the new version. Throws if another writer saved first.
   */
  async save(
    component: Component,
    body: unknown,
    readVersion: number,
  ): Promise<number> {
    return this.saveWithAudit(component, body, readVersion, []);
  }

  /**
   * Saves a snapshot and appends its audit events in one transaction. If the version check
   * fails, neither is written.
   */
  async saveWithAudit(
    component: Component,
    body: unknown,
    readVersion: number,
    events: readonly AuditRow[],
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const version = await writeSnapshot(client, component, body, readVersion);
      for (const event of events) {
        await client.query(
          `INSERT INTO policy_v2_audit (component, at, by_id, event, detail)
           VALUES ($1, $2, $3, $4, $5)`,
          [event.component, event.at, event.by, event.event, event.detail],
        );
      }
      await client.query("COMMIT");
      return version;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** The audit events of a component, oldest first. */
  async readAudit(component: Component): Promise<AuditRow[]> {
    const result = await this.pool.query<{
      component: Component;
      at: Date;
      by_id: string;
      event: string;
      detail: string;
    }>(
      `SELECT component, at, by_id, event, detail FROM policy_v2_audit
       WHERE component = $1 ORDER BY seq`,
      [component],
    );
    return result.rows.map((row) => ({
      component: row.component,
      at: new Date(row.at).toISOString(),
      by: row.by_id,
      event: row.event,
      detail: row.detail,
    }));
  }

  /**
   * Appends one evidence record. Refused unless it links to the last record stored, and runs
   * under a lock so two appends cannot both link to the same record.
   */
  async appendEvidence(record: EvidenceRecord): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock($1)", [EVIDENCE_LOCK]);
      const last = await client.query<{ hash: string }>(
        "SELECT hash FROM policy_v2_evidence ORDER BY seq DESC LIMIT 1",
      );
      const lastHash = last.rows[0]?.hash ?? "genesis";
      if (record.prevHash !== lastHash) {
        throw new PersistenceConflictError(
          `The record does not link to the last stored record (${lastHash}).`,
        );
      }
      await client.query(
        `INSERT INTO policy_v2_evidence (record_id, policy_hash, prev_hash, hash, body, decided_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          record.recordId,
          record.policyHash,
          record.prevHash,
          record.hash,
          JSON.stringify(record),
          record.decidedAt,
        ],
      );
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  /** Every stored evidence record, oldest first. */
  async readEvidence(): Promise<EvidenceRecord[]> {
    const result = await this.pool.query<{ body: EvidenceRecord }>(
      "SELECT body FROM policy_v2_evidence ORDER BY seq ASC",
    );
    return result.rows.map((row) => row.body);
  }
}

/**
 * Nonces for source answers and approvals, stored in policy_v2_nonces. Each nonce is
 * recorded once. The insert is atomic, so two processes cannot both use the same nonce.
 * Expired rows are removed on each call, so the table holds only nonces still in force.
 */
export class PolicyV2NonceStore implements NonceStore {
  constructor(
    private readonly pool: Pool,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async consume(nonce: string, expiresAt: string): Promise<boolean> {
    await this.pool.query(
      "DELETE FROM policy_v2_nonces WHERE expires_at <= $1",
      [this.now().toISOString()],
    );
    const inserted = await this.pool.query(
      `INSERT INTO policy_v2_nonces (nonce, expires_at) VALUES ($1, $2)
       ON CONFLICT (nonce) DO NOTHING RETURNING nonce`,
      [nonce, expiresAt],
    );
    return (inserted.rowCount ?? 0) === 1;
  }
}
