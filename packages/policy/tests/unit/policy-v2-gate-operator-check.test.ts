import { describe, expect, it } from "vitest";

import { PolicyRegister, type Person } from "../../src/v2/register.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const OWNER: Person = { id: "owner-1", roles: ["parmana-owner"] };
const CAP = "erp:pay-invoice";

/** A register whose stored roles include a gate owner outside Operations, as a snapshot saved before the rule could hold. */
function registerWithLegacyGateOwner(): PolicyRegister {
  const r = new PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  r.grantRole(OWNER, "action-1", "action-owner");
  r.registerAction(
    {
      capability: CAP,
      owner: "action-1",
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    OWNER,
  );
  const snapshot = r.snapshot();
  const roles = [
    ...snapshot.roles,
    { callerId: "legacy-gate", role: "gate-owner" as const },
    { callerId: "ops-1", role: "operator" as const },
    { callerId: "ops-1", role: "gate-owner" as const },
  ];
  const loaded = new PolicyRegister(() => NOW);
  loaded.load({ ...snapshot, roles });
  return loaded;
}

describe("the go-live gate and gate owners outside Operations", () => {
  it("lists a gate owner who does not hold the operator role as missing", () => {
    const missing = registerWithLegacyGateOwner().gateMissing(CAP, [], [], []);
    expect(missing).toContain(
      "gate owner legacy-gate does not hold the operator role",
    );
    expect(missing.some((m) => m.includes("ops-1"))).toBe(false);
  });
});
