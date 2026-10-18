import { describe, expect, it } from "vitest";

import type { Pool } from "pg";

import {
  ConflictError,
  type ChallengeRecord,
  type ChallengeRecordRepository,
} from "@parmana/shared";

import { MemoryChallengeRecordRepository } from "../../src/memory/MemoryChallengeRecordRepository.js";
import { PostgresChallengeRecordRepository } from "../../src/postgres/PostgresChallengeRecordRepository.js";

/**
 * Same fake pg.Pool as postgres-challenge-record-repository.test.ts --
 * duplicated rather than shared, matching this repo's own precedent
 * for these small backend-specific test doubles (see
 * supabase-refusal-record-repository.test.ts vs.
 * business-transaction-repository-duplicate-consistency.test.ts,
 * which also each define their own fake client rather than sharing
 * one across files).
 */
function createFakePool(): Pool {
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

      throw new Error(`test fake: unexpected SQL: ${sql}`);
    },
  };

  return pool as unknown as Pool;
}

function buildChallengeRecord(challengeRecordId: string): ChallengeRecord {
  const now = new Date("2026-08-03T00:00:00.000Z");

  return {
    challengeRecordId,
    status: "open",
    claimChallenged: "docs/CLAIMS.md § 2 claims durable audit-sink evidence",
    source: {
      kind: "public-comment",
      raisedAt: now,
    },
    investigationSteps: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Same "consistent semantics across implementations" discipline G-1's
 * business-transaction-repository-duplicate-consistency.test.ts
 * established: callers must not be able to tell which backing store
 * enforced append-only semantics from the shape of the result alone.
 */
describe.each<[string, () => ChallengeRecordRepository]>([
  [
    "MemoryChallengeRecordRepository",
    () => new MemoryChallengeRecordRepository(),
  ],
  [
    "PostgresChallengeRecordRepository",
    () => new PostgresChallengeRecordRepository(createFakePool()),
  ],
])("%s", (_name, createRepository) => {
  it("carries a Challenge Record through its full lifecycle: open -> investigating -> resolved, with investigation steps, finding, outcome, and disclosure", async () => {
    const repository = createRepository();
    const record = buildChallengeRecord("lifecycle-1");

    await repository.create(record);

    await repository.append("lifecycle-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T01:00:00.000Z"),
        method: "grep for signature_json across packages/api/src",
        observation: "PostgREST returns PGRST204 only on insert, not select",
      },
    });

    let current = await repository.append("lifecycle-1", {
      kind: "status",
      status: "investigating",
    });

    expect(current.status).toBe("investigating");

    current = await repository.append("lifecycle-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T02:00:00.000Z"),
        method: "npm test",
        observation: "730 passed, 0 failed, confirming the bypass sink works",
      },
    });

    expect(current.investigationSteps).toHaveLength(2);

    await repository.append("lifecycle-1", {
      kind: "finding",
      finding: {
        outcome: "confirmed",
        statement:
          "PostgREST's schema cache is stuck at the REST layer specifically.",
      },
    });

    await repository.append("lifecycle-1", {
      kind: "outcome",
      outcome: {
        changed: true,
        description:
          "Shipped a direct-Postgres bypass for the two affected audit sinks.",
        references: ["docs/rfcs/RFC-0022-Challenge-Record.md"],
      },
    });

    await repository.append("lifecycle-1", {
      kind: "disclosure",
      disclosure: {
        disclosedPublicly: true,
        location: "docs/site/trust-and-claims/trl7-verification.mdx",
        disclosedAt: new Date("2026-08-03T03:00:00.000Z"),
      },
    });

    current = await repository.append("lifecycle-1", {
      kind: "status",
      status: "resolved",
    });

    expect(current.status).toBe("resolved");
    expect(current.finding?.outcome).toBe("confirmed");
    expect(current.outcome?.changed).toBe(true);
    expect(current.disclosure?.disclosedPublicly).toBe(true);
    expect(current.investigationSteps).toHaveLength(2);
    expect(current.updatedAt.getTime()).toBeGreaterThan(
      current.createdAt.getTime(),
    );

    const reloaded = await repository.findById("lifecycle-1");
    expect(reloaded).toEqual(current);
  });

  it("rejects a second finding once one is already set, leaving the original untouched", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("finding-1"));

    await repository.append("finding-1", {
      kind: "finding",
      finding: { outcome: "ruled-out", statement: "First finding." },
    });

    await expect(
      repository.append("finding-1", {
        kind: "finding",
        finding: {
          outcome: "confirmed",
          statement: "Attempted second finding.",
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const found = await repository.findById("finding-1");
    expect(found!.finding?.statement).toBe("First finding.");
  });

  it("rejects a second outcome once one is already set", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("outcome-1"));

    await repository.append("outcome-1", {
      kind: "outcome",
      outcome: {
        changed: false,
        description: "First outcome.",
        references: [],
      },
    });

    await expect(
      repository.append("outcome-1", {
        kind: "outcome",
        outcome: {
          changed: true,
          description: "Attempted second outcome.",
          references: [],
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a second disclosure once one is already set", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("disclosure-1"));

    await repository.append("disclosure-1", {
      kind: "disclosure",
      disclosure: { disclosedPublicly: false },
    });

    await expect(
      repository.append("disclosure-1", {
        kind: "disclosure",
        disclosure: { disclosedPublicly: true, location: "attempted-second" },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects a status transition backward (investigating -> open)", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("status-1"));

    await repository.append("status-1", {
      kind: "status",
      status: "investigating",
    });

    await expect(
      repository.append("status-1", { kind: "status", status: "open" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects setting status to its own current value", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("status-2"));

    await repository.append("status-2", {
      kind: "status",
      status: "investigating",
    });

    await expect(
      repository.append("status-2", {
        kind: "status",
        status: "investigating",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("never overwrites an existing investigationSteps entry -- each append only adds", async () => {
    const repository = createRepository();
    await repository.create(buildChallengeRecord("steps-1"));

    await repository.append("steps-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T01:00:00.000Z"),
        method: "step one",
        observation: "obs one",
      },
    });

    const afterSecond = await repository.append("steps-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T02:00:00.000Z"),
        method: "step two",
        observation: "obs two",
      },
    });

    expect(afterSecond.investigationSteps.map((s) => s.method)).toEqual([
      "step one",
      "step two",
    ]);
  });
});
