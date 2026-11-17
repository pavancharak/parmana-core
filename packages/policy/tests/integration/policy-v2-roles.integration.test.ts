import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import {
  acquirePolicyV2SuiteLock,
  releasePolicyV2SuiteLock,
} from "../helpers/policy-v2-database-lock.js";
import { PolicyRegister, RegisterError } from "../../src/v2/register.js";
import {
  PersistenceConflictError,
  PolicyV2Store,
  type AuditRow,
} from "../../src/v2/persistence.js";

/**
 * Roles in the register, saved with their audit events in one transaction, against a real
 * database.
 */

const databaseConfigured = resolveDatabaseGate("Policy v2 roles");
const NOW = new Date("2026-11-18T09:00:00.000Z");

function rowsOf(register: PolicyRegister): AuditRow[] {
  return register.takeEvents().map((e) => ({
    component: "register",
    at: e.at,
    by: e.by,
    event: e.event,
    detail: e.detail,
  }));
}

describe.skipIf(!databaseConfigured)("policy v2 roles (live database)", () => {
  let pool: Pool;
  let lock: PoolClient | undefined;
  let store: PolicyV2Store;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    lock = await acquirePolicyV2SuiteLock(pool);
    store = new PolicyV2Store(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE policy_v2_state, policy_v2_audit");
  });

  afterAll(async () => {
    await releasePolicyV2SuiteLock(lock!);
    await pool.end();
  });

  it("saves roles and their audit events together, and reads both back", async () => {
    const register = new PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    await store.saveWithAudit(
      "register",
      register.snapshot(),
      0,
      rowsOf(register),
    );

    const saved =
      await store.load<ReturnType<PolicyRegister["snapshot"]>>("register");
    const restored = new PolicyRegister(() => NOW);
    restored.load(saved!.body);
    expect(restored.holdersOf("parmana-owner")).toEqual(["owner-1"]);

    const audit = await store.readAuditPage("register", {
      after: 0,
      limit: 100,
    });
    expect(audit.map((e) => e.event)).toEqual(["role.bootstrap"]);
    expect(audit[0]!.at).toBe(NOW.toISOString());
  });

  it("writes no audit rows when the version check refuses the save", async () => {
    const register = new PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    await store.saveWithAudit(
      "register",
      register.snapshot(),
      0,
      rowsOf(register),
    );

    register.grantRole(
      { id: "owner-1", roles: [] },
      "source-1",
      "source-owner",
    );
    await expect(
      store.saveWithAudit("register", register.snapshot(), 0, rowsOf(register)),
    ).rejects.toBeInstanceOf(PersistenceConflictError);

    const audit = await store.readAuditPage("register", {
      after: 0,
      limit: 100,
    });
    expect(audit.map((e) => e.event)).toEqual(["role.bootstrap"]);
    const saved = await store.load<{ roles: unknown[] }>("register");
    expect(saved!.body.roles).toHaveLength(1);
  });

  it("pages the audit rows by sequence number, without gaps or repeats", async () => {
    const register = new PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    register.grantRole({ id: "owner-1", roles: [] }, "a", "reviewer");
    register.grantRole({ id: "owner-1", roles: [] }, "b", "reviewer");
    await store.saveWithAudit(
      "register",
      register.snapshot(),
      0,
      rowsOf(register),
    );

    const first = await store.readAuditPage("register", { after: 0, limit: 2 });
    const second = await store.readAuditPage("register", {
      after: first[first.length - 1]!.seq,
      limit: 2,
    });
    const all = [...first, ...second];
    expect(all.map((e) => e.detail)).toEqual([
      "owner-1 parmana-owner",
      "a reviewer",
      "b reviewer",
    ]);
    expect(new Set(all.map((e) => e.seq)).size).toBe(3);
  });

  it("refuses to change an audit row", async () => {
    const register = new PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    await store.saveWithAudit(
      "register",
      register.snapshot(),
      0,
      rowsOf(register),
    );
    await expect(
      pool.query("UPDATE policy_v2_audit SET event = 'x'"),
    ).rejects.toThrow(/append only/);
    await expect(pool.query("DELETE FROM policy_v2_audit")).rejects.toThrow(
      /append only/,
    );
  });

  it("refuses to revoke the last owner, and the register is unchanged", async () => {
    const register = new PolicyRegister(() => NOW);
    register.bootstrapOwner("owner-1");
    await store.saveWithAudit(
      "register",
      register.snapshot(),
      0,
      rowsOf(register),
    );
    expect(() =>
      register.revokeRole(
        { id: "owner-1", roles: [] },
        "owner-1",
        "parmana-owner",
      ),
    ).toThrow(RegisterError);
    const saved = await store.load<{ roles: unknown[] }>("register");
    expect(saved!.body.roles).toHaveLength(1);
  });
});
