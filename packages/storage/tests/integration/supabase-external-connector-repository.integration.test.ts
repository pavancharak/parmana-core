import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  ConflictError,
  ExternalConnectorChangeNotFoundError,
  PendingPolicyChangeStatus,
  type ExternalConnectorChange,
} from "@parmana/shared";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseExternalConnectorRepository } from "../../src/supabase/SupabaseExternalConnectorRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with every migration applied: CI's
 * Docker image workflow, or a disposable local database. Never point
 * it at production: it writes rows it does not delete.
 */
const databaseConfigured = resolveDatabaseGate(
  "Supabase External Connector Repository",
);

describe.skipIf(!databaseConfigured)(
  "SupabaseExternalConnectorRepository (live)",
  () => {
    // Created in beforeAll, not here: this body also runs when the suite
    // is skipped, and PostgresPoolFactory needs DATABASE_URL.
    let pool: ReturnType<typeof PostgresPoolFactory.create>;
    let repository: SupabaseExternalConnectorRepository;

    beforeAll(() => {
      pool = PostgresPoolFactory.create();
      repository = new SupabaseExternalConnectorRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    const capability = () =>
      `live${crypto.randomUUID().replaceAll("-", "")}:create-invoice`;

    function register(
      overrides: Partial<ExternalConnectorChange> = {},
    ): ExternalConnectorChange {
      return {
        changeId: crypto.randomUUID(),
        action: "register",
        capability: capability(),
        endpointUrl: "https://erp.example.com/parmana/release",
        policy: "erp-invoice",
        allowedParameters: ["amount", "currency"],
        timeoutMs: 10000,
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        ...overrides,
      };
    }

    function revoke(forCapability: string): ExternalConnectorChange {
      return {
        changeId: crypto.randomUUID(),
        action: "revoke",
        capability: forCapability,
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      };
    }

    it("registers on approval, then revokes, keeping the row", async () => {
      const change = await repository.createChange(register());

      expect(await repository.findActive(change.capability)).toBeNull();

      const approved = await repository.approveChange(
        change.changeId,
        "checker",
        new Date(),
      );
      expect(approved.status).toBe(PendingPolicyChangeStatus.APPROVED);
      expect(await repository.findChange(change.changeId)).toMatchObject({
        resolvedBy: "checker",
        allowedParameters: ["amount", "currency"],
        timeoutMs: 10000,
      });

      expect(await repository.findActive(change.capability)).toMatchObject({
        registrationId: change.changeId,
        endpointUrl: change.endpointUrl,
        policy: "erp-invoice",
        allowedParameters: ["amount", "currency"],
        timeoutMs: 10000,
        status: "active",
      });

      const revocation = await repository.createChange(
        revoke(change.capability),
      );
      await repository.approveChange(
        revocation.changeId,
        "checker",
        new Date(),
      );

      expect(await repository.findActive(change.capability)).toBeNull();
      expect(
        (await repository.listRegistrations()).find(
          (r) => r.registrationId === change.changeId,
        ),
      ).toMatchObject({
        status: "revoked",
        revokedByChangeId: revocation.changeId,
      });
    });

    it("allows one pending change per capability, and one active registration", async () => {
      const first = await repository.createChange(register());

      await expect(
        repository.createChange(register({ capability: first.capability })),
      ).rejects.toBeInstanceOf(ConflictError);

      await repository.approveChange(first.changeId, "checker", new Date());

      const second = await repository.createChange(
        register({ capability: first.capability }),
      );
      await expect(
        repository.approveChange(second.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.findChange(second.changeId))?.status).toBe(
        PendingPolicyChangeStatus.PENDING_APPROVAL,
      );
    });

    it("refuses to resolve twice, an unknown id, and revoking an unregistered capability, writing nothing", async () => {
      const change = await repository.createChange(register());
      await repository.rejectChange(
        change.changeId,
        "checker",
        "No.",
        new Date(),
      );

      await expect(
        repository.approveChange(change.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(await repository.findActive(change.capability)).toBeNull();

      await expect(
        repository.approveChange(crypto.randomUUID(), "checker", new Date()),
      ).rejects.toBeInstanceOf(ExternalConnectorChangeNotFoundError);

      const revocation = await repository.createChange(revoke(capability()));
      await expect(
        repository.approveChange(revocation.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.findChange(revocation.changeId))?.status).toBe(
        PendingPolicyChangeStatus.PENDING_APPROVAL,
      );
    });

    it("lets only one of two simultaneous approvals apply", async () => {
      const change = await repository.createChange(register());

      const results = await Promise.allSettled([
        repository.approveChange(change.changeId, "checker-a", new Date()),
        repository.approveChange(change.changeId, "checker-b", new Date()),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    });

    it("refuses maker as checker, and a register without its fields, in the database too", async () => {
      const change = await repository.createChange(register());

      await expect(
        repository.approveChange(change.changeId, "maker", new Date()),
      ).rejects.toThrow();
      expect(await repository.findActive(change.capability)).toBeNull();

      await expect(
        repository.createChange(register({ timeoutMs: undefined })),
      ).rejects.toThrow();
    });
  },
);
