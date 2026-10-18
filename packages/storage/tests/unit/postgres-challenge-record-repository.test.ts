import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import {
  ChallengeRecordNotFoundError,
  type ChallengeRecord,
} from "@parmana/shared";

import { PostgresChallengeRecordRepository } from "../../src/postgres/PostgresChallengeRecordRepository.js";

/**
 * Fake pg.Pool backing store. Mirrors the real driver's own behavior
 * relied on by PostgresChallengeRecordRepository's row mapping:
 * jsonb columns come back already parsed into JS objects (pg's
 * default type parser for oid 3802), and timestamptz columns come
 * back as Date instances -- this fake stores exactly what a real
 * driver would return, not the raw parameterized strings that were
 * sent.
 */
function createFakePool(): {
  pool: Pool;
  rows: Map<string, Record<string, unknown>>;
} {
  const rows = new Map<string, Record<string, unknown>>();

  const pool = {
    query(sql: string, values: readonly unknown[] = []) {
      if (sql.includes("INSERT INTO challenge_records")) {
        const [
          challengeRecordId,
          status,
          claimChallenged,
          sourceJson,
          investigationStepsJson,
          findingJson,
          outcomeJson,
          disclosureJson,
          supersedes,
          createdAt,
          updatedAt,
        ] = values;

        rows.set(challengeRecordId as string, {
          challenge_record_id: challengeRecordId,
          status,
          claim_challenged: claimChallenged,
          source_json: JSON.parse(sourceJson as string),
          investigation_steps_json: JSON.parse(
            investigationStepsJson as string,
          ),
          finding_json: findingJson ? JSON.parse(findingJson as string) : null,
          outcome_json: outcomeJson ? JSON.parse(outcomeJson as string) : null,
          disclosure_json: disclosureJson
            ? JSON.parse(disclosureJson as string)
            : null,
          supersedes: supersedes ?? null,
          created_at: new Date(createdAt as string),
          updated_at: new Date(updatedAt as string),
        });

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("UPDATE challenge_records")) {
        const [
          status,
          investigationStepsJson,
          findingJson,
          outcomeJson,
          disclosureJson,
          updatedAt,
          challengeRecordId,
        ] = values;

        const existing = rows.get(challengeRecordId as string);

        if (existing) {
          rows.set(challengeRecordId as string, {
            ...existing,
            status,
            investigation_steps_json: JSON.parse(
              investigationStepsJson as string,
            ),
            finding_json: findingJson
              ? JSON.parse(findingJson as string)
              : null,
            outcome_json: outcomeJson
              ? JSON.parse(outcomeJson as string)
              : null,
            disclosure_json: disclosureJson
              ? JSON.parse(disclosureJson as string)
              : null,
            updated_at: new Date(updatedAt as string),
          });
        }

        return Promise.resolve({ rows: [] });
      }

      if (sql.includes("SELECT * FROM challenge_records WHERE")) {
        const [id] = values;
        const row = rows.get(id as string);

        return Promise.resolve({ rows: row ? [row] : [] });
      }

      if (sql.includes("SELECT * FROM challenge_records ORDER BY")) {
        return Promise.resolve({ rows: [...rows.values()] });
      }

      throw new Error(
        `PostgresChallengeRecordRepository test fake: unexpected SQL: ${sql}`,
      );
    },
  };

  return { pool: pool as unknown as Pool, rows };
}

function buildChallengeRecord(challengeRecordId: string): ChallengeRecord {
  const now = new Date("2026-08-03T00:00:00.000Z");

  return {
    challengeRecordId,
    status: "open",
    claimChallenged: "docs/CLAIMS.md § 2 claims durable audit-sink evidence",
    source: {
      kind: "adversarial-exercise",
      attribution: "internal red-team session",
      raisedAt: now,
    },
    investigationSteps: [
      {
        performedAt: now,
        method: "read packages/api/src/auth/SupabaseCallerAuditSink.ts",
        observation:
          "confirmed the insert path now bypasses PostgREST entirely",
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
}

describe("PostgresChallengeRecordRepository", () => {
  it("creates a record and round-trips it through findById with all fields intact, including Date fields nested inside JSONB", async () => {
    const { pool } = createFakePool();
    const repository = new PostgresChallengeRecordRepository(pool);

    const record = buildChallengeRecord("challenge-1");
    await repository.create(record);

    const found = await repository.findById("challenge-1");

    expect(found).not.toBeNull();
    expect(found!.challengeRecordId).toBe("challenge-1");
    expect(found!.status).toBe("open");
    expect(found!.claimChallenged).toBe(record.claimChallenged);
    expect(found!.source).toEqual(record.source);
    expect(found!.source.raisedAt).toBeInstanceOf(Date);
    expect(found!.investigationSteps).toEqual(record.investigationSteps);
    expect(found!.investigationSteps[0]!.performedAt).toBeInstanceOf(Date);
    expect(found!.finding).toBeUndefined();
    expect(found!.outcome).toBeUndefined();
    expect(found!.disclosure).toBeUndefined();
    expect(found!.supersedes).toBeUndefined();
    expect(found!.createdAt).toBeInstanceOf(Date);
    expect(found!.updatedAt).toBeInstanceOf(Date);
  });

  it("returns null for an id with no record", async () => {
    const { pool } = createFakePool();
    const repository = new PostgresChallengeRecordRepository(pool);

    await expect(repository.findById("does-not-exist")).resolves.toBeNull();
  });

  it("lists every created record, ordered by createdAt", async () => {
    const { pool } = createFakePool();
    const repository = new PostgresChallengeRecordRepository(pool);

    await repository.create(buildChallengeRecord("challenge-1"));
    await repository.create(buildChallengeRecord("challenge-2"));

    const all = await repository.list();

    expect(all.map((r) => r.challengeRecordId).sort()).toEqual([
      "challenge-1",
      "challenge-2",
    ]);
  });

  it("appends an investigation step and persists it", async () => {
    const { pool } = createFakePool();
    const repository = new PostgresChallengeRecordRepository(pool);

    await repository.create(buildChallengeRecord("challenge-1"));

    await repository.append("challenge-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T02:00:00.000Z"),
        method: "npm test",
        observation: "730 passed, 0 failed",
      },
    });

    const found = await repository.findById("challenge-1");

    expect(found!.investigationSteps).toHaveLength(2);
    expect(found!.investigationSteps[1]!.observation).toBe(
      "730 passed, 0 failed",
    );
  });

  it("throws ChallengeRecordNotFoundError when appending to an unknown id", async () => {
    const { pool } = createFakePool();
    const repository = new PostgresChallengeRecordRepository(pool);

    await expect(
      repository.append("does-not-exist", {
        kind: "investigation-step",
        step: {
          performedAt: new Date(),
          method: "n/a",
          observation: "n/a",
        },
      }),
    ).rejects.toBeInstanceOf(ChallengeRecordNotFoundError);
  });
});
