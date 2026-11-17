import { describe, expect, it } from "vitest";

import { PolicyRegister, type Person } from "../../src/v2/register.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: Person = { id: "owner-1", roles: ["parmana-owner"] };

function register(): PolicyRegister {
  const r = new PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  return r;
}

describe("the gate-owner role needs the operator role", () => {
  it("refuses a gate-owner grant to someone who is not in Operations", () => {
    const r = register();
    expect(() => r.grantRole(OWNER, "builder-1", "gate-owner")).toThrow(
      /operator role before/,
    );
  });

  it("grants the gate-owner role once the person holds the operator role", () => {
    const r = register();
    r.grantRole(OWNER, "ops-1", "operator");
    r.grantRole(OWNER, "ops-1", "gate-owner");
    expect(r.rolesOf("ops-1")).toEqual(["gate-owner", "operator"]);
  });

  it("refuses to remove the operator role while the person still holds gate-owner", () => {
    const r = register();
    r.grantRole(OWNER, "ops-1", "operator");
    r.grantRole(OWNER, "ops-1", "gate-owner");
    expect(() => r.revokeRole(OWNER, "ops-1", "operator")).toThrow(
      /Revoke gate-owner first/,
    );
    r.revokeRole(OWNER, "ops-1", "gate-owner");
    r.revokeRole(OWNER, "ops-1", "operator");
    expect(r.rolesOf("ops-1")).toEqual([]);
  });
});
