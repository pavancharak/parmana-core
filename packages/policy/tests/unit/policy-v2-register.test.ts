import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PolicyRegister,
  type RegisterSnapshot,
  RegisterError,
  type ActionInput,
  type Person,
  type SourceInput,
  type ThresholdInput,
} from "../../src/v2/register.js";
import { validatePolicyV2 } from "../../src/v2/validatePolicyV2.js";

/** Tests for the policy version 2 register (design: CONSOLIDATED-DESIGN-AND-DECISIONS.md, sections 4.2 and 5). */

const NOW = new Date("2026-11-18T09:00:00.000Z");

const ledgerKeys = generateKeyPairSync("ed25519");
const LEDGER_PUBLIC_PEM = ledgerKeys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const clock = () => NOW;

const sourceOwner: Person = { id: "src-owner-1", roles: ["source-owner"] };
const second: Person = { id: "second-1", roles: ["second-approver"] };
const parmanaOwner: Person = { id: "parmana-1", roles: ["parmana-owner"] };
const actionOwner: Person = { id: "action-owner-1", roles: ["action-owner"] };
const risk: Person = { id: "risk-1", roles: ["risk-function"] };
const second2: Person = { id: "second-2", roles: ["second-approver"] };
const gateOwner: Person = { id: "gate-1", roles: ["gate-owner"] };
const platformOwner: Person = { id: "parmana-2", roles: ["parmana-owner"] };

function systemSource(overrides: Partial<SourceInput> = {}): SourceInput {
  return {
    name: "ledger",
    dataOwner: "finance-team",
    signer: { kind: "system" },
    keyId: "ledger-key-1",
    publicKeyPem: LEDGER_PUBLIC_PEM,
    claims: { "funds.available": "" },
    canApprove: false,
    ...overrides,
  };
}

function action(overrides: Partial<ActionInput> = {}): ActionInput {
  return {
    capability: "erp:pay-invoice",
    owner: "action-owner-1",
    successor: "action-owner-2",
    reviewers: ["reviewer-1", "reviewer-2", "reviewer-3"],
    review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    ...overrides,
  };
}

function threshold(overrides: Partial<ThresholdInput> = {}): ThresholdInput {
  return {
    action: "erp:pay-invoice",
    name: "automaticLimit",
    value: 5000,
    unit: "USD",
    owner: "action-owner-1",
    reason:
      "Payments up to this value are automated after trusted checks pass.",
    evidence: "Losses from wrong approvals in the last two years.",
    nextReview: "2027-05-01",
    highValue: false,
    ...overrides,
  };
}

function trustedLedger(register: PolicyRegister): void {
  register.proposeSource(systemSource(), sourceOwner);
  register.approveSource("ledger", second);
}

describe("sources", () => {
  it("refuses a source without a public key, and a key that is not Ed25519", () => {
    const register = new PolicyRegister(clock);
    expect(() =>
      register.proposeSource(systemSource({ publicKeyPem: "" }), sourceOwner),
    ).toThrow(/public key/);
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .publicKey.export({ type: "spki", format: "pem" })
      .toString();
    expect(() =>
      register.proposeSource(systemSource({ publicKeyPem: rsa }), sourceOwner),
    ).toThrow(/Ed25519/);
  });

  it("gives the verifier the key while trusted, and refuses it once revoked or for another key id", () => {
    const register = new PolicyRegister(clock);
    expect(register.keyFor("ledger", "ledger-key-1")).toBeUndefined();
    trustedLedger(register);
    expect(register.keyFor("ledger", "ledger-key-1")).toBeDefined();
    expect(register.keyFor("ledger", "some-other-key")).toBeUndefined();
    register.revokeSource("ledger", parmanaOwner, "key exposed");
    expect(register.keyFor("ledger", "ledger-key-1")).toBe("revoked");
  });

  it("is pending until a second approver approves it", () => {
    const register = new PolicyRegister(clock);
    const proposed = register.proposeSource(systemSource(), sourceOwner);
    expect(proposed.status).toBe("pending");
    expect(register.approveSource("ledger", second).status).toBe("trusted");
  });

  it("refuses approval by the proposer", () => {
    const register = new PolicyRegister(clock);
    register.proposeSource(systemSource(), sourceOwner);
    expect(() => register.approveSource("ledger", sourceOwner)).toThrow(
      RegisterError,
    );
  });

  it("requires the Parmana owner for a source that can approve", () => {
    const register = new PolicyRegister(clock);
    register.proposeSource(systemSource({ canApprove: true }), sourceOwner);
    const afterSecond = register.approveSource("ledger", second);
    expect(afterSecond.status).toBe("pending");
    expect(register.approveSource("ledger", parmanaOwner).status).toBe(
      "trusted",
    );
  });

  it("requires the Parmana owner for any intermediary signer, and needs a named operator and review date", () => {
    const register = new PolicyRegister(clock);
    expect(() =>
      register.proposeSource(
        systemSource({ signer: { kind: "intermediary" } }),
        sourceOwner,
      ),
    ).toThrow(/operator and a review date/);

    register.proposeSource(
      systemSource({
        signer: {
          kind: "intermediary",
          operator: "ops-team-7",
          reviewDate: "2027-11-01",
        },
      }),
      sourceOwner,
    );
    expect(register.approveSource("ledger", second).status).toBe("pending");
    expect(register.approveSource("ledger", parmanaOwner).status).toBe(
      "trusted",
    );
  });

  it("refuses a placeholder anywhere in the proposal", () => {
    const register = new PolicyRegister(clock);
    expect(() =>
      register.proposeSource(
        systemSource({ dataOwner: "<data owner>" }),
        sourceOwner,
      ),
    ).toThrow(/Placeholder/);
  });

  it("refuses a proposal by someone without the source-owner role", () => {
    const register = new PolicyRegister(clock);
    expect(() => register.proposeSource(systemSource(), second)).toThrow(
      /source-owner/,
    );
  });

  it("revocation makes a trusted source untrusted at once, and needs a reason", () => {
    const register = new PolicyRegister(clock);
    trustedLedger(register);
    expect(() => register.revokeSource("ledger", parmanaOwner, " ")).toThrow(
      /reason/,
    );
    expect(
      register.revokeSource("ledger", parmanaOwner, "key exposed").status,
    ).toBe("untrusted");
  });

  it("produces a register that the validator reads: only trusted sources count as trusted", () => {
    const register = new PolicyRegister(clock);
    trustedLedger(register);
    register.proposeSource(
      systemSource({
        name: "vendor-master",
        claims: { "vendor.verified": "" },
      }),
      sourceOwner,
    );
    const reg = register.toValidationRegister();
    expect(reg.sources["ledger"]?.status).toBe("trusted");
    expect(reg.sources["vendor-master"]?.status).toBe("untrusted");
  });
});

describe("thresholds", () => {
  it("is proposed by the action owner and approved by a second person who is not the proposer", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    expect(register.proposeThreshold(threshold(), actionOwner).status).toBe(
      "proposed",
    );
    expect(
      register.approveThreshold("erp:pay-invoice", "automaticLimit", second)
        .status,
    ).toBe("approved");
  });

  it("refuses a proposal by someone other than the owner, and an approval by the proposer", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    expect(() =>
      register.proposeThreshold(
        threshold({ owner: "someone-else" }),
        actionOwner,
      ),
    ).toThrow(/owner/);
    register.proposeThreshold(threshold(), actionOwner);
    const selfApprover: Person = {
      id: "action-owner-1",
      roles: ["second-approver"],
    };
    expect(() =>
      register.approveThreshold(
        "erp:pay-invoice",
        "automaticLimit",
        selfApprover,
      ),
    ).toThrow(/own threshold/);
  });

  it("needs a reason and evidence", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    expect(() =>
      register.proposeThreshold(threshold({ evidence: "" }), actionOwner),
    ).toThrow(/reason and evidence/);
  });

  it("a high-value threshold also needs the risk function", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    register.proposeThreshold(threshold({ highValue: true }), actionOwner);
    expect(
      register.approveThreshold("erp:pay-invoice", "automaticLimit", second)
        .status,
    ).toBe("proposed");
    expect(
      register.approveThreshold("erp:pay-invoice", "automaticLimit", risk)
        .status,
    ).toBe("approved");
  });

  it("refuses a placeholder value, unit, or approver", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    expect(() =>
      register.proposeThreshold(threshold({ unit: "<currency>" }), actionOwner),
    ).toThrow(/Placeholder/);
  });
});

describe("actions and the go-live gate", () => {
  it("refuses a successor who is the owner, and a window above the cap", () => {
    const register = new PolicyRegister(clock);
    expect(() =>
      register.registerAction(
        action({ successor: "action-owner-1" }),
        parmanaOwner,
      ),
    ).toThrow(/successor/);
    expect(() =>
      register.registerAction(
        action({
          review: { reviewWindowBusinessDays: 4, approvalValidityMinutes: 15 },
        }),
        parmanaOwner,
      ),
    ).toThrow(/business days/);
    expect(() =>
      register.registerAction(
        action({
          review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 90 },
        }),
        parmanaOwner,
      ),
    ).toThrow(/minutes/);
  });

  it("refuses to go live with a missing source, threshold, reviewer or tier test", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(
      action({ reviewers: ["reviewer-1"] }),
      parmanaOwner,
    );
    const result = register.goLive(
      "erp:pay-invoice",
      ["ledger"],
      ["automaticLimit"],
      gateOwner,
    );
    expect(result.ok).toBe(false);
    expect(result.missing).toEqual(
      expect.arrayContaining([
        'source "ledger" is not registered',
        'threshold "automaticLimit" is not registered',
        "at least two eligible reviewers",
        "a test run for each tier",
      ]),
    );
    expect(register.getAction("erp:pay-invoice")?.live).toBe(false);
  });

  it("does not count the owner or successor as eligible reviewers", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(
      action({ reviewers: ["action-owner-1", "action-owner-2", "reviewer-1"] }),
      parmanaOwner,
    );
    const result = register.goLive("erp:pay-invoice", [], [], gateOwner);
    expect(result.missing).toContain("at least two eligible reviewers");
  });

  it("refuses to go live with an untrusted source or an unapproved threshold", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    register.proposeSource(systemSource(), sourceOwner);
    register.proposeThreshold(threshold(), actionOwner);
    register.recordTest("erp:pay-invoice", "tier1", gateOwner);
    const result = register.goLive(
      "erp:pay-invoice",
      ["ledger"],
      ["automaticLimit"],
      gateOwner,
    );
    expect(result.missing).toEqual(
      expect.arrayContaining([
        'source "ledger" is pending',
        'threshold "automaticLimit" is proposed',
      ]),
    );
  });

  it("goes live when every item is in place", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    trustedLedger(register);
    register.proposeThreshold(threshold(), actionOwner);
    register.approveThreshold("erp:pay-invoice", "automaticLimit", second);
    register.recordTest("erp:pay-invoice", "tier1", gateOwner);
    register.recordTest("erp:pay-invoice", "tier2", gateOwner);
    const result = register.goLive(
      "erp:pay-invoice",
      ["ledger"],
      ["automaticLimit"],
      gateOwner,
    );
    expect(result).toEqual({ ok: true, missing: [] });
    expect(register.getAction("erp:pay-invoice")?.live).toBe(true);
  });

  it("refuses a go-live gate run by someone without the gate-owner role", () => {
    const register = new PolicyRegister(clock);
    register.registerAction(action(), parmanaOwner);
    expect(() => register.goLive("erp:pay-invoice", [], [], second2)).toThrow(
      /gate-owner/,
    );
  });
});

describe("audit log", () => {
  it("records every change in order, with its actor and time", () => {
    const register = new PolicyRegister(clock);
    trustedLedger(register);
    register.revokeSource("ledger", platformOwner, "rotation");
    const events = register.auditLog().map((e) => e.event);
    expect(events).toEqual([
      "source.proposed",
      "source.approved",
      "source.revoked",
    ]);
    expect(register.auditLog()[0]?.at).toBe(NOW.toISOString());
  });
});

describe("the register and the validator", () => {
  it("a policy that uses a register-approved source passes the validator's source checks", () => {
    const register = new PolicyRegister(clock);
    trustedLedger(register);
    const policy = {
      policyId: "payment",
      policyVersion: "2.0.0",
      schemaVersion: "2.0.0",
      capability: "erp:pay-invoice",
      description: "Pays when funds are available.",
      owner: "action-owner-1",
      signals: {
        fundsAvailable: {
          type: "boolean",
          provenance: "sourced",
          source: "ledger",
          claim: "funds.available",
          subject: "parameters.accountId",
          maxAgeSeconds: 60,
        },
      },
      rules: [
        {
          id: "refuse-no-funds",
          tier: "refuse",
          when: { fact: "fundsAvailable", operator: "is_false" },
          outcome: { action: "reject", reason: "No funds." },
        },
        {
          id: "reject-default",
          tier: "reject",
          when: { always: true },
          outcome: { action: "reject", reason: "Not allowed." },
        },
      ],
    };
    expect(
      validatePolicyV2(policy, register.toValidationRegister()).errors,
    ).toEqual([]);
  });
});

describe("roles in the register", () => {
  const owner: Person = { id: "owner-1", roles: [] };
  const other: Person = { id: "other-1", roles: [] };

  it("sets up one Parmana owner, and only while none exists", () => {
    const r = new PolicyRegister(() => NOW);
    expect(r.bootstrapOwner("owner-1")).toBe(true);
    expect(r.bootstrapOwner("owner-2")).toBe(false);
    expect(r.holdersOf("parmana-owner")).toEqual(["owner-1"]);
  });

  it("lets only the Parmana owner grant a role", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    r.grantRole(owner, "source-1", "source-owner");
    expect(r.rolesOf("source-1")).toEqual(["source-owner"]);
    r.grantRole(owner, "source-1", "source-owner");
    expect(r.auditLog().filter((e) => e.event === "role.grant")).toHaveLength(
      1,
    );
    expect(() => r.grantRole(other, "x", "reviewer")).toThrow(RegisterError);
  });

  it("refuses to revoke the last Parmana owner, and allows it when another remains", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    expect(() => r.revokeRole(owner, "owner-1", "parmana-owner")).toThrow(
      /last Parmana owner/,
    );
    r.grantRole(owner, "owner-2", "parmana-owner");
    r.revokeRole(owner, "owner-1", "parmana-owner");
    expect(r.holdersOf("parmana-owner")).toEqual(["owner-2"]);
  });

  it("queues each role change's audit event once, until it is taken", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    r.grantRole(owner, "source-1", "source-owner");
    const taken = r.takeEvents().map((e) => e.event);
    expect(taken).toEqual(["role.bootstrap", "role.grant"]);
    expect(r.takeEvents()).toEqual([]);
  });

  it("keeps roles through a snapshot and a load", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    r.grantRole(owner, "source-1", "source-owner");
    const restored = new PolicyRegister(() => NOW);
    restored.load(JSON.parse(JSON.stringify(r.snapshot())));
    expect(restored.rolesOf("source-1")).toEqual(["source-owner"]);
    expect(restored.holdersOf("parmana-owner")).toEqual(["owner-1"]);
  });
});

describe("approver keys in the register", () => {
  const ownerPerson: Person = { id: "owner-1", roles: [] };
  const confirmer: Person = { id: "second-1", roles: [] };
  const input = {
    approverId: "approver-1",
    keyId: "k1",
    publicKeyPem: LEDGER_PUBLIC_PEM,
  };

  function withRoles() {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner("owner-1");
    r.grantRole(ownerPerson, "second-1", "second-approver");
    return r;
  }

  it("lets only the Parmana owner propose a key, and keeps it pending", () => {
    const r = withRoles();
    expect(() =>
      r.proposeApproverKey(input, { id: "second-1", roles: [] }),
    ).toThrow(RegisterError);
    const key = r.proposeApproverKey(input, ownerPerson);
    expect(key.status).toBe("pending");
  });

  it("activates a key only when a second approver confirms it", () => {
    const r = withRoles();
    r.proposeApproverKey(input, ownerPerson);
    expect(() =>
      r.approveApproverKey("approver-1", "k1", { id: "owner-1", roles: [] }),
    ).toThrow(RegisterError);
    const active = r.approveApproverKey("approver-1", "k1", confirmer);
    expect(active.status).toBe("active");
    expect(active.approvals.map((a) => a.role)).toEqual(["second-approver"]);
  });

  it("refuses a confirmation by the approver whose key it is", () => {
    const r = withRoles();
    r.grantRole(ownerPerson, "approver-1", "second-approver");
    r.proposeApproverKey(input, ownerPerson);
    expect(() =>
      r.approveApproverKey("approver-1", "k1", { id: "approver-1", roles: [] }),
    ).toThrow(/own key/);
  });

  it("revokes a key at once, and needs the Parmana owner and a reason", () => {
    const r = withRoles();
    r.proposeApproverKey(input, ownerPerson);
    r.approveApproverKey("approver-1", "k1", confirmer);
    expect(() =>
      r.revokeApproverKey("approver-1", "k1", confirmer, "lost"),
    ).toThrow(RegisterError);
    expect(() =>
      r.revokeApproverKey("approver-1", "k1", ownerPerson, " "),
    ).toThrow(RegisterError);
    expect(
      r.revokeApproverKey("approver-1", "k1", ownerPerson, "lost").status,
    ).toBe("revoked");
  });

  it("refuses a second key with the same id, and a key that is not Ed25519", () => {
    const r = withRoles();
    r.proposeApproverKey(input, ownerPerson);
    expect(() => r.proposeApproverKey(input, ownerPerson)).toThrow(
      /already exists/,
    );
    expect(() =>
      r.proposeApproverKey(
        { ...input, keyId: "k2", publicKeyPem: "not a key" },
        ownerPerson,
      ),
    ).toThrow(RegisterError);
  });

  it("keeps keys through a snapshot and a load, and reads an older snapshot as none", () => {
    const r = withRoles();
    r.proposeApproverKey(input, ownerPerson);
    const restored = new PolicyRegister(() => NOW);
    restored.load(JSON.parse(JSON.stringify(r.snapshot())));
    expect(restored.getApproverKey("approver-1", "k1")?.status).toBe("pending");

    const older = {
      ...r.snapshot(),
      approverKeys: undefined,
    } as unknown as RegisterSnapshot;
    const fromOlder = new PolicyRegister(() => NOW);
    fromOlder.load(older);
    expect(fromOlder.listApproverKeys()).toEqual([]);
  });
});
