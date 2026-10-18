import { describe, expect, it } from "vitest";

import {
  ChallengeRecordNotFoundError,
  type ChallengeRecord,
} from "@parmana/shared";

import { MemoryChallengeRecordRepository } from "../../src/memory/MemoryChallengeRecordRepository.js";

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

describe("MemoryChallengeRecordRepository", () => {
  it("creates a record and finds it by id", async () => {
    const repository = new MemoryChallengeRecordRepository();
    const record = buildChallengeRecord("challenge-1");

    await expect(repository.create(record)).resolves.toBe(record);
    await expect(repository.findById("challenge-1")).resolves.toEqual(record);
  });

  it("returns null for an id with no record", async () => {
    const repository = new MemoryChallengeRecordRepository();

    await expect(repository.findById("does-not-exist")).resolves.toBeNull();
  });

  it("lists every created record", async () => {
    const repository = new MemoryChallengeRecordRepository();

    await repository.create(buildChallengeRecord("challenge-1"));
    await repository.create(buildChallengeRecord("challenge-2"));

    const all = await repository.list();

    expect(all).toHaveLength(2);
    expect(all.map((r) => r.challengeRecordId).sort()).toEqual([
      "challenge-1",
      "challenge-2",
    ]);
  });

  it("appends an investigation step", async () => {
    const repository = new MemoryChallengeRecordRepository();
    await repository.create(buildChallengeRecord("challenge-1"));

    const updated = await repository.append("challenge-1", {
      kind: "investigation-step",
      step: {
        performedAt: new Date("2026-08-03T01:00:00.000Z"),
        method: "grep for signature_json across packages/api/src",
        observation:
          "PostgREST schema cache confirmed stuck at the REST layer only",
      },
    });

    expect(updated.investigationSteps).toHaveLength(1);
    expect(updated.investigationSteps[0]!.observation).toBe(
      "PostgREST schema cache confirmed stuck at the REST layer only",
    );
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      updated.createdAt.getTime(),
    );
  });

  it("throws ChallengeRecordNotFoundError when appending to an unknown id", async () => {
    const repository = new MemoryChallengeRecordRepository();

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
