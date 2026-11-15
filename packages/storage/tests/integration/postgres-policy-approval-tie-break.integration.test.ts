import { randomUUID } from "node:crypto";

import { afterAll, describe, expect, it } from "vitest";

import { Pool } from "pg";

import type { PolicyChangeApprovalRecord } from "@parmana/shared";

import { PostgresPolicyChangeApprovalRecordRepository } from "../../src/postgres/PostgresPolicyChangeApprovalRecordRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs the real "most recent" queries against a migrated database (migration
 * 20261115120000). Approval rows are append-only, so no row is deleted: each
 * run uses its own policy name.
 *
 * Gated like every other live suite: TEST_DATABASE_URL plus ALLOW_LIVE_SUPABASE=1.
 */
const databaseConfigured = resolveDatabaseGate(
  "Policy approval tie-break (PostgreSQL)",
);

describe.skipIf(!databaseConfigured)(
  "postgres policy approval records with the same approvedAt",
  () => {
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const repository = new PostgresPolicyChangeApprovalRecordRepository(pool);

    afterAll(async () => {
      await pool.end();
    });

    async function insertPendingChange(
      policyName: string,
      policyVersion: string,
      pendingPolicyChangeId: string,
    ): Promise<void> {
      await pool.query(
        `INSERT INTO pending_policy_changes
           (pending_policy_change_id, policy_name, policy_version, proposed_content_json,
            proposed_by, proposed_at, status, reason)
         VALUES ($1, $2, $3, '{}'::jsonb, 'maker', $4, 'APPROVED', 'tie-break test')`,
        [pendingPolicyChangeId, policyName, policyVersion, "2026-11-15T09:00:00.000Z"],
      );
    }

    function approval(
      policyName: string,
      policyVersion: string,
      recordId: string,
      approvedAt: string,
    ): PolicyChangeApprovalRecord {
      const pendingPolicyChangeId = `ppc-${recordId}`;
      return {
        policyChangeApprovalRecordId: recordId,
        pendingPolicyChangeId,
        policyName,
        policyVersion,
        proposedBy: "maker",
        approvedBy: "checker",
        proposedAt: new Date("2026-11-15T09:00:00.000Z"),
        approvedAt: new Date(approvedAt),
        contentHashAfter: `hash-${recordId}`,
        signature: {
          algorithm: "ed25519",
          keyId: "default",
          value: "sig",
          signedAt: new Date(approvedAt),
        },
      };
    }

    it("the later-inserted record wins on a tie, whatever its record id; the sequence is set by the database", async () => {
      const name = `tie-${randomUUID()}`;
      const at = "2026-11-15T10:00:00.000Z";

      await insertPendingChange(name, "1.1.0", `ppc-zzz-first-${name}`);
      await insertPendingChange(name, "1.0.0", `ppc-aaa-second-${name}`);

      // Inserted first, with the larger record id.
      await repository.create(
        approval(name, "1.1.0", `zzz-first-${name}`, at),
      );
      // Inserted second, with the smaller record id.
      await repository.create(
        approval(name, "1.0.0", `aaa-second-${name}`, at),
      );

      expect(
        (await repository.findMostRecentForName(name))?.policyChangeApprovalRecordId,
      ).toBe(`aaa-second-${name}`);
      expect(
        (await repository.findMostRecentFor(name, "1.1.0"))
          ?.policyChangeApprovalRecordId,
      ).toBe(`zzz-first-${name}`);

      const { rows } = await pool.query(
        `SELECT approval_sequence FROM policy_change_approval_records
          WHERE policy_name = $1 ORDER BY approval_sequence`,
        [name],
      );
      expect(rows).toHaveLength(2);
      expect(rows[0].approval_sequence).not.toBeNull();
      expect(Number(rows[1].approval_sequence)).toBeGreaterThan(
        Number(rows[0].approval_sequence),
      );
    });

    it("a record written before the column existed (NULL sequence) ranks below a new one on a tie", async () => {
      const name = `legacy-${randomUUID()}`;
      const at = "2026-11-15T11:00:00.000Z";
      const legacyId = `zzz-legacy-${name}`;

      await insertPendingChange(name, "1.0.0", `ppc-${legacyId}`);
      // An explicit NULL overrides the column default, as a row from before
      // the migration has.
      await pool.query(
        `INSERT INTO policy_change_approval_records
           (policy_change_approval_record_id, pending_policy_change_id, policy_name,
            policy_version, proposed_by, approved_by, proposed_at, approved_at,
            content_hash_before, content_hash_after, signature_json, previous_record_hash,
            approval_sequence)
         VALUES ($1, $2, $3, '1.0.0', 'maker', 'checker', $4, $4, NULL, 'hash-legacy',
                 '{"algorithm":"ed25519","keyId":"default","value":"sig","signedAt":"2026-11-15T11:00:00.000Z"}'::jsonb,
                 NULL, NULL)`,
        [legacyId, `ppc-${legacyId}`, name, at],
      );

      await insertPendingChange(name, "1.1.0", `ppc-aaa-new-${name}`);
      await repository.create(approval(name, "1.1.0", `aaa-new-${name}`, at));

      expect(
        (await repository.findMostRecentForName(name))?.policyChangeApprovalRecordId,
      ).toBe(`aaa-new-${name}`);
    });
  },
);
