import crypto, { generateKeyPairSync } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ApprovalIssuerChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type ApprovalIssuerChange,
} from "@parmana/shared";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseApprovalIssuerRepository } from "../../src/supabase/SupabaseApprovalIssuerRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with every migration applied: CI's
 * Docker image workflow, or a disposable local database. Never point
 * it at production: it writes rows it does not delete.
 */
const databaseConfigured = resolveDatabaseGate(
  "Supabase Approval Issuer Repository",
);

describe.skipIf(!databaseConfigured)(
  "SupabaseApprovalIssuerRepository (live)",
  () => {
    // Created in beforeAll, not here: this body also runs when the suite
    // is skipped, and PostgresPoolFactory needs DATABASE_URL.
    let pool: ReturnType<typeof PostgresPoolFactory.create>;
    let repository: SupabaseApprovalIssuerRepository;

    beforeAll(() => {
      pool = PostgresPoolFactory.create();
      repository = new SupabaseApprovalIssuerRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    const pem = () =>
      generateKeyPairSync("ed25519")
        .publicKey.export({ type: "spki", format: "pem" })
        .toString();

    function change(
      overrides: Partial<ApprovalIssuerChange> = {},
    ): ApprovalIssuerChange {
      return {
        changeId: crypto.randomUUID(),
        action: "add",
        approverId: `live-${crypto.randomUUID()}`,
        keyId: "k1",
        publicKeyPem: pem(),
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        ...overrides,
      };
    }

    it("adds on approval, then revokes, keeping the row", async () => {
      const add = await repository.createChange(change());

      expect(await repository.findIssuer(add.approverId, add.keyId)).toBeNull();

      const at = new Date();
      const approved = await repository.approveChange(
        add.changeId,
        "checker",
        at,
      );
      expect(approved.status).toBe(PendingPolicyChangeStatus.APPROVED);
      expect((await repository.findChange(add.changeId))?.resolvedBy).toBe(
        "checker",
      );

      const issuer = await repository.findIssuer(add.approverId, add.keyId);
      expect(issuer).toMatchObject({
        publicKeyPem: add.publicKeyPem,
        revoked: false,
        addedByChangeId: add.changeId,
      });

      const revoke = await repository.createChange(
        change({
          action: "revoke",
          approverId: add.approverId,
          keyId: add.keyId,
          publicKeyPem: undefined,
        }),
      );
      await repository.approveChange(revoke.changeId, "checker", new Date());

      expect(
        await repository.findIssuer(add.approverId, add.keyId),
      ).toMatchObject({ revoked: true, revokedByChangeId: revoke.changeId });
      expect(
        (await repository.listIssuers()).some(
          (i) => i.approverId === add.approverId,
        ),
      ).toBe(true);
    });

    it("allows one pending change per approver and key", async () => {
      const first = await repository.createChange(change());

      await expect(
        repository.createChange(
          change({ approverId: first.approverId, keyId: first.keyId }),
        ),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("refuses to resolve twice, an unknown id, and revoking an unknown key, writing nothing", async () => {
      const add = await repository.createChange(change());
      await repository.rejectChange(add.changeId, "checker", "No.", new Date());

      await expect(
        repository.approveChange(add.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await repository.findIssuer(add.approverId, add.keyId)).toBeNull();

      await expect(
        repository.approveChange(crypto.randomUUID(), "checker", new Date()),
      ).rejects.toBeInstanceOf(ApprovalIssuerChangeNotFoundError);

      const revoke = await repository.createChange(
        change({ action: "revoke", publicKeyPem: undefined }),
      );
      await expect(
        repository.approveChange(revoke.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.findChange(revoke.changeId))?.status).toBe(
        PendingPolicyChangeStatus.PENDING_APPROVAL,
      );
    });

    it("lets only one of two simultaneous approvals apply", async () => {
      const add = await repository.createChange(change());

      const results = await Promise.allSettled([
        repository.approveChange(add.changeId, "checker-a", new Date()),
        repository.approveChange(add.changeId, "checker-b", new Date()),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });

    it("refuses maker as checker in the database too", async () => {
      const add = await repository.createChange(change());

      await expect(
        repository.approveChange(add.changeId, "maker", new Date()),
      ).rejects.toThrow();
      expect(await repository.findIssuer(add.approverId, add.keyId)).toBeNull();
    });
  },
);
