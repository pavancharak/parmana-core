import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseCallerKeyRevocationRepository } from "../../src/supabase/SupabaseCallerKeyRevocationRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with migration 20261030120000 applied:
 * CI's Docker image workflow, or a disposable local database. Never
 * point it at production. It inserts rows with random key hashes and
 * deletes them again afterwards.
 */
const databaseConfigured = resolveDatabaseGate(
  "Supabase Caller Key Revocation Repository",
);

describe.skipIf(!databaseConfigured)(
  "SupabaseCallerKeyRevocationRepository (live)",
  () => {
    // Created in beforeAll, not here: this body also runs when the suite
    // is skipped, and PostgresPoolFactory needs DATABASE_URL.
    let pool: ReturnType<typeof PostgresPoolFactory.create>;
    let repository: SupabaseCallerKeyRevocationRepository;
    const createdHashes: string[] = [];

    const newKeyHash = (): string => {
      const keyHash = createHash("sha256").update(randomUUID()).digest("hex");

      createdHashes.push(keyHash);

      return keyHash;
    };

    beforeAll(() => {
      pool = PostgresPoolFactory.create();
      repository = new SupabaseCallerKeyRevocationRepository(pool);
    });

    afterAll(async () => {
      if (createdHashes.length > 0) {
        await pool.query(
          "DELETE FROM caller_key_revocations WHERE key_hash = ANY($1)",
          [createdHashes],
        );
      }

      await pool.end();
    });

    it("reports a key that was never revoked as not revoked", async () => {
      await expect(repository.isRevoked(newKeyHash())).resolves.toBe(false);
    });

    it("reports a revoked key as revoked, and leaves other keys alone", async () => {
      const revoked = newKeyHash();
      const other = newKeyHash();

      await repository.revoke({
        keyHash: revoked,
        callerId: "integration-caller",
        revokedBy: "integration-operator",
        reason: "integration test",
        revokedAt: new Date(),
      });

      await expect(repository.isRevoked(revoked)).resolves.toBe(true);
      await expect(repository.isRevoked(other)).resolves.toBe(false);
    });

    it("keeps the first revocation when the same key is revoked again", async () => {
      const keyHash = newKeyHash();

      await repository.revoke({
        keyHash,
        callerId: "integration-caller",
        revokedBy: "first-operator",
        reason: "first revocation",
        revokedAt: new Date("2026-10-30T10:00:00Z"),
      });

      await repository.revoke({
        keyHash,
        callerId: "integration-caller",
        revokedBy: "second-operator",
        reason: "second revocation",
        revokedAt: new Date("2026-10-30T11:00:00Z"),
      });

      const { rows } = await pool.query(
        "SELECT revoked_by, reason FROM caller_key_revocations WHERE key_hash = $1",
        [keyHash],
      );

      expect(rows).toEqual([
        { revoked_by: "first-operator", reason: "first revocation" },
      ]);
    });
  },
);
