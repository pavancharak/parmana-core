import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { resolveDatabaseGate } from "../../../../test-support/database-gate.js";
import {
  PolicyV2RoleStore,
  RoleChangeError,
} from "../../src/v2/persistence.js";

/** Role grants and revocations for policy version 2 against a real database. */

const databaseConfigured = resolveDatabaseGate("Policy v2 roles");

describe.skipIf(!databaseConfigured)("policy v2 roles (live database)", () => {
  let pool: Pool;
  let roles: PolicyV2RoleStore;

  beforeAll(() => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    roles = new PolicyV2RoleStore(pool);
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE policy_v2_role_events");
  });

  afterAll(async () => {
    await pool.end();
  });

  it("reports a role as held after a grant and not after a revoke", async () => {
    await roles.changeRole({
      callerId: "a",
      role: "reviewer",
      action: "grant",
      byCaller: "owner",
    });
    expect(await roles.rolesOf("a")).toEqual(["reviewer"]);
    await roles.changeRole({
      callerId: "a",
      role: "reviewer",
      action: "revoke",
      byCaller: "owner",
    });
    expect(await roles.rolesOf("a")).toEqual([]);
  });

  it("lists the callers that hold a role", async () => {
    await roles.changeRole({
      callerId: "b",
      role: "source-owner",
      action: "grant",
      byCaller: "owner",
    });
    await roles.changeRole({
      callerId: "a",
      role: "source-owner",
      action: "grant",
      byCaller: "owner",
    });
    expect(await roles.holdersOf("source-owner")).toEqual(["a", "b"]);
  });

  it("refuses to revoke the last Parmana owner", async () => {
    await roles.changeRole({
      callerId: "owner",
      role: "parmana-owner",
      action: "grant",
      byCaller: "bootstrap",
    });
    await expect(
      roles.changeRole({
        callerId: "owner",
        role: "parmana-owner",
        action: "revoke",
        byCaller: "owner",
      }),
    ).rejects.toBeInstanceOf(RoleChangeError);
    expect(await roles.holdersOf("parmana-owner")).toEqual(["owner"]);
  });

  it("allows revoking a Parmana owner when another owner remains", async () => {
    await roles.changeRole({
      callerId: "owner",
      role: "parmana-owner",
      action: "grant",
      byCaller: "bootstrap",
    });
    await roles.changeRole({
      callerId: "second",
      role: "parmana-owner",
      action: "grant",
      byCaller: "owner",
    });
    await roles.changeRole({
      callerId: "owner",
      role: "parmana-owner",
      action: "revoke",
      byCaller: "second",
    });
    expect(await roles.holdersOf("parmana-owner")).toEqual(["second"]);
  });

  it("refuses an edit or a delete of a role event", async () => {
    await roles.changeRole({
      callerId: "a",
      role: "reviewer",
      action: "grant",
      byCaller: "owner",
    });
    await expect(
      pool.query("UPDATE policy_v2_role_events SET role = 'gate-owner'"),
    ).rejects.toThrow(/append only/);
    await expect(
      pool.query("DELETE FROM policy_v2_role_events"),
    ).rejects.toThrow(/append only/);
  });
});
