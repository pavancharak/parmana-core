import crypto from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  BusinessSignalSourceChangeNotFoundError,
  ConflictError,
  PendingPolicyChangeStatus,
  type BusinessSignalSourceChange,
} from "@parmana/shared";

import { PostgresPoolFactory } from "../../src/postgres/PostgresPoolFactory.js";
import { SupabaseBusinessSignalSourceRepository } from "../../src/supabase/SupabaseBusinessSignalSourceRepository.js";

import { resolveDatabaseGate } from "../helpers/database-availability.js";

/**
 * Runs against a real Postgres with every migration applied: CI's
 * Docker image workflow, or a disposable local database. Never point
 * it at production: it writes rows it does not delete.
 */
const databaseConfigured = resolveDatabaseGate(
  "Supabase Business Signal Source Repository",
);

const PUBLIC_KEY_PEM = crypto
  .generateKeyPairSync("ed25519")
  .publicKey.export({ format: "pem", type: "spki" })
  .toString();

describe.skipIf(!databaseConfigured)(
  "SupabaseBusinessSignalSourceRepository (live)",
  () => {
    // Created in beforeAll, not here: this body also runs when the suite
    // is skipped, and PostgresPoolFactory needs DATABASE_URL.
    let pool: ReturnType<typeof PostgresPoolFactory.create>;
    let repository: SupabaseBusinessSignalSourceRepository;

    beforeAll(() => {
      pool = PostgresPoolFactory.create();
      repository = new SupabaseBusinessSignalSourceRepository(pool);
    });

    afterAll(async () => {
      await pool.end();
    });

    const name = () => `live-${crypto.randomUUID()}`;

    function register(
      overrides: Partial<BusinessSignalSourceChange> = {},
    ): BusinessSignalSourceChange {
      return {
        changeId: crypto.randomUUID(),
        action: "register",
        name: name(),
        endpointUrl: "https://orders.example.com/parmana/signals",
        timeoutMs: 10000,
        publicKeyPem: PUBLIC_KEY_PEM,
        keyId: "orders-2026",
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
        ...overrides,
      };
    }

    function revoke(forName: string): BusinessSignalSourceChange {
      return {
        changeId: crypto.randomUUID(),
        action: "revoke",
        name: forName,
        reason: "Live test.",
        proposedBy: "maker",
        proposedAt: new Date(),
        status: PendingPolicyChangeStatus.PENDING_APPROVAL,
      };
    }

    it("registers on approval with its key, then revokes, keeping the row", async () => {
      const change = await repository.createChange(register());

      expect(await repository.findActive(change.name)).toBeNull();

      const approved = await repository.approveChange(
        change.changeId,
        "checker",
        new Date(),
      );
      expect(approved.status).toBe(PendingPolicyChangeStatus.APPROVED);
      expect(await repository.findChange(change.changeId)).toMatchObject({
        resolvedBy: "checker",
        publicKeyPem: PUBLIC_KEY_PEM,
        keyId: "orders-2026",
        timeoutMs: 10000,
      });

      expect(await repository.findActive(change.name)).toMatchObject({
        registrationId: change.changeId,
        endpointUrl: change.endpointUrl,
        publicKeyPem: PUBLIC_KEY_PEM,
        keyId: "orders-2026",
        timeoutMs: 10000,
        status: "active",
      });

      const revocation = await repository.createChange(revoke(change.name));
      await repository.approveChange(
        revocation.changeId,
        "checker",
        new Date(),
      );

      expect(await repository.findActive(change.name)).toBeNull();
      expect(
        (await repository.listRegistrations()).find(
          (r) => r.registrationId === change.changeId,
        ),
      ).toMatchObject({
        status: "revoked",
        revokedByChangeId: revocation.changeId,
      });
    });

    it("stores a source without a key", async () => {
      const change = await repository.createChange(
        register({ publicKeyPem: undefined, keyId: undefined }),
      );
      await repository.approveChange(change.changeId, "checker", new Date());

      const active = await repository.findActive(change.name);
      expect(active?.publicKeyPem).toBeUndefined();
      expect(active?.keyId).toBeUndefined();
    });

    it("allows one pending change per name, and one active registration", async () => {
      const first = await repository.createChange(register());

      await expect(
        repository.createChange(register({ name: first.name })),
      ).rejects.toBeInstanceOf(ConflictError);

      await repository.approveChange(first.changeId, "checker", new Date());

      const second = await repository.createChange(
        register({ name: first.name }),
      );
      await expect(
        repository.approveChange(second.changeId, "checker", new Date()),
      ).rejects.toBeInstanceOf(ConflictError);
      expect((await repository.findChange(second.changeId))?.status).toBe(
        PendingPolicyChangeStatus.PENDING_APPROVAL,
      );
    });

    it("refuses to resolve twice, an unknown id, and revoking an unregistered name, writing nothing", async () => {
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
      expect(await repository.findActive(change.name)).toBeNull();

      await expect(
        repository.approveChange(crypto.randomUUID(), "checker", new Date()),
      ).rejects.toBeInstanceOf(BusinessSignalSourceChangeNotFoundError);

      const revocation = await repository.createChange(revoke(name()));
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

    it("refuses maker as checker, a register without its fields, and a key id without a key, in the database too", async () => {
      const change = await repository.createChange(register());

      await expect(
        repository.approveChange(change.changeId, "maker", new Date()),
      ).rejects.toThrow();
      expect(await repository.findActive(change.name)).toBeNull();

      await expect(
        repository.createChange(register({ timeoutMs: undefined })),
      ).rejects.toThrow();
      await expect(
        repository.createChange(register({ publicKeyPem: undefined })),
      ).rejects.toThrow();
      await expect(
        repository.createChange(register({ name: "Not A Name" })),
      ).rejects.toThrow();
    });
  },
);
