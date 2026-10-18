import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  AuthorityGrantChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type AuthorityGrantChange,
} from "@parmana/shared";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseAuthorityGrantRepository } from "../../src/supabase/SupabaseAuthorityGrantRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with every migration applied: CI's
 * Docker image workflow, or a disposable local database. Never point
 * it at production: it writes rows it does not delete.
 */
const databaseConfigured = resolveDatabaseGate(
  "Supabase Authority Grant Repository",
);

const DAY = 86_400_000;

describe.skipIf(!databaseConfigured)(
  "SupabaseAuthorityGrantRepository (live)",
  () => {
    // Created in beforeAll, not here: this body also runs when the suite
    // is skipped, and PostgresPoolFactory needs DATABASE_URL.
    let pool: ReturnType<typeof PostgresPoolFactory.create>;
    let repository: SupabaseAuthorityGrantRepository;

    beforeAll(() => {
      pool = PostgresPoolFactory.create();
      repository = new SupabaseAuthorityGrantRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    const agent = () => `live-agent-${crypto.randomUUID()}`;

    function grant(
      overrides: Partial<AuthorityGrantChange> = {},
    ): AuthorityGrantChange {
      return {
        changeId: crypto.randomUUID(),
        action: "grant",
        callerId: agent(),
        capability: "erp:release-goods",
        limits: {
          "parameters.amount": { max: 100000 },
          "parameters.currency": { oneOf: ["INR"] },
        },
        validUntil: new Date(Date.now() + 30 * DAY),
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        ...overrides,
      };
    }

    function revoke(callerId: string): AuthorityGrantChange {
      return {
        changeId: crypto.randomUUID(),
        action: "revoke",
        callerId,
        capability: "erp:release-goods",
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      };
    }

    it("grants on approval with its limits and expiry, starting at approval, then revokes keeping the row", async () => {
      const change = await repository.createChange(grant());

      expect(
        await repository.findActive(change.callerId, change.capability),
      ).toBeNull();

      const at = new Date();
      await repository.approveChange(change.changeId, "checker", at);

      expect(await repository.findChange(change.changeId)).toMatchObject({
        status: PendingPolicyChangeStatus.APPROVED,
        limits: change.limits,
        validUntil: change.validUntil,
      });

      expect(
        await repository.findActive(change.callerId, change.capability),
      ).toMatchObject({
        grantId: change.changeId,
        limits: change.limits,
        validFrom: at,
        validUntil: change.validUntil,
        status: "active",
      });

      const revocation = await repository.createChange(revoke(change.callerId));
      await repository.approveChange(
        revocation.changeId,
        "checker",
        new Date(),
      );

      expect(
        await repository.findActive(change.callerId, change.capability),
      ).toBeNull();
      expect(
        (await repository.listGrants()).find(
          (g) => g.grantId === change.changeId,
        ),
      ).toMatchObject({
        status: "revoked",
        revokedByChangeId: revocation.changeId,
      });
    });

    it("keeps a given validFrom, and a grant without limits", async () => {
      const validFrom = new Date(Date.now() + DAY);
      const change = await repository.createChange(
        grant({ validFrom, limits: undefined }),
      );
      await repository.approveChange(change.changeId, "checker", new Date());

      const active = await repository.findActive(
        change.callerId,
        change.capability,
      );
      expect(active?.validFrom).toEqual(validFrom);
      expect(active?.limits).toBeUndefined();
    });

    it("allows one pending change and one active grant per caller and capability", async () => {
      const first = await repository.createChange(grant());

      await expect(
        repository.createChange(grant({ callerId: first.callerId })),
      ).rejects.toBeInstanceOf(ConflictError);

      await repository.approveChange(first.changeId, "checker", new Date());

      const second = await repository.createChange(
        grant({ callerId: first.callerId }),
      );
      await expect(
        repository.approveChange(second.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);

      // Another capability for the same caller is separate.
      await expect(
        repository.createChange(
          grant({ callerId: first.callerId, capability: "erp:create-invoice" }),
        ),
      ).resolves.toBeDefined();
    });

    it("refuses to resolve twice, an unknown id, and revoking a grant never made, writing nothing", async () => {
      const change = await repository.createChange(grant());
      await repository.rejectChange(
        change.changeId,
        "checker",
        "No.",
        new Date(),
      );

      await expect(
        repository.approveChange(change.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);

      await expect(
        repository.approveChange(crypto.randomUUID(), "checker", new Date()),
      ).rejects.toBeInstanceOf(AuthorityGrantChangeNotFoundError);

      const revocation = await repository.createChange(revoke(agent()));
      await expect(
        repository.approveChange(revocation.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.findChange(revocation.changeId))?.status).toBe(
        PendingPolicyChangeStatus.PENDING_APPROVAL,
      );
    });

    it("lets only one of two simultaneous approvals apply", async () => {
      const change = await repository.createChange(grant());

      const results = await Promise.allSettled([
        repository.approveChange(change.changeId, "checker-a", new Date()),
        repository.approveChange(change.changeId, "checker-b", new Date()),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    });

    it("refuses in the database a self grant, maker or grantee as checker, a grant without expiry, and a revoke with limits", async () => {
      await expect(
        repository.createChange(grant({ callerId: "maker" })),
      ).rejects.toThrow();

      const change = await repository.createChange(grant());
      await expect(
        repository.approveChange(change.changeId, "maker", new Date()),
      ).rejects.toThrow();
      await expect(
        repository.approveChange(change.changeId, change.callerId, new Date()),
      ).rejects.toThrow();
      expect(
        await repository.findActive(change.callerId, change.capability),
      ).toBeNull();

      await expect(
        repository.createChange(grant({ validUntil: undefined })),
      ).rejects.toThrow();
      await expect(
        repository.createChange({
          ...revoke(agent()),
          limits: { target: { oneOf: ["x"] } },
        }),
      ).rejects.toThrow();
    });
  },
);
