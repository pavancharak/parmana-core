import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  PolicyRegister,
  RegisterError,
  type Person,
} from "../../src/v2/register.js";

const NOW = new Date("2026-11-18T09:00:00Z");
const CAP = "erp:pay-invoice";
const PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

const OWNER: Person = { id: "owner-1", roles: ["parmana-owner"] };
const ACTION_OWNER: Person = { id: "action-1", roles: [] };
const SECOND: Person = { id: "second-1", roles: ["second-approver"] };
const GATE: Person = { id: "gate-1", roles: ["gate-owner"] };

/** A policy the validator accepts, with no source: it only refuses. */
function minimal(version = "2.0.0") {
  return {
    policyId: "minimal",
    policyVersion: version,
    schemaVersion: "2.0.0",
    capability: CAP,
    description: "A minimal policy for tests.",
    owner: "finance-owner",
    signals: {
      requestedAmount: { type: "number", provenance: "untrusted", unit: "USD" },
    },
    review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    rules: [
      {
        id: "reject-all",
        tier: "reject",
        when: { always: true },
        outcome: { action: "reject", reason: "Rejected." },
      },
    ],
  };
}

/** A policy that reads a source able to approve, so the Parmana owner must also approve it. */
function sourced(version = "2.0.0") {
  return {
    ...minimal(version),
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
      minimal().rules[0],
    ],
  };
}

/** A register with an owner, an action ready to go live, and a recorded test. */
function registerWithAction(): PolicyRegister {
  const r = new PolicyRegister(() => NOW);
  r.bootstrapOwner(OWNER.id);
  r.grantRole(OWNER, ACTION_OWNER.id, "action-owner");
  r.grantRole(OWNER, SECOND.id, "second-approver");
  r.grantRole(OWNER, GATE.id, "gate-owner");
  r.registerAction(
    {
      capability: CAP,
      owner: ACTION_OWNER.id,
      successor: "action-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    OWNER,
  );
  r.recordTest(CAP, "reject", GATE);
  return r;
}

function registerSource(r: PolicyRegister): void {
  r.grantRole(OWNER, "source-1", "source-owner");
  r.proposeSource(
    {
      name: "ledger",
      dataOwner: "finance",
      signer: { kind: "system" },
      keyId: "ledger-key",
      publicKeyPem: PEM,
      claims: { "funds.available": "" },
      canApprove: true,
    },
    { id: "source-1", roles: ["source-owner"] },
  );
  r.approveSource("ledger", SECOND);
  r.approveSource("ledger", OWNER);
}

describe("proposing a policy version", () => {
  it("lets only the action owner propose a policy for the action", () => {
    const r = registerWithAction();
    expect(() => r.proposePolicy(minimal(), OWNER)).toThrow(
      /Only the action owner/,
    );
    const record = r.proposePolicy(minimal(), ACTION_OWNER);
    expect(record.status).toBe("proposed");
  });

  it("refuses a policy for an action that is not registered", () => {
    const r = registerWithAction();
    expect(() =>
      r.proposePolicy({ ...minimal(), capability: "hr:hire" }, ACTION_OWNER),
    ).toThrow(RegisterError);
  });

  it("refuses a policy that the validator rejects, and names the check", () => {
    const r = registerWithAction();
    const broken = { ...minimal(), rules: [] };
    expect(() => r.proposePolicy(broken, ACTION_OWNER)).toThrow(/not valid/);
  });

  it("refuses a placeholder in the policy", () => {
    const r = registerWithAction();
    expect(() =>
      r.proposePolicy({ ...minimal(), owner: "<finance-owner>" }, ACTION_OWNER),
    ).toThrow(/Placeholder/);
  });

  it("refuses a version that already exists, since a change is a new version", () => {
    const r = registerWithAction();
    r.proposePolicy(minimal(), ACTION_OWNER);
    expect(() => r.proposePolicy(minimal(), ACTION_OWNER)).toThrow(
      /already exists/,
    );
  });
});

describe("approving a policy version", () => {
  it("is approved by a second approver who is not the proposer", () => {
    const r = registerWithAction();
    r.grantRole(OWNER, ACTION_OWNER.id, "second-approver");
    r.proposePolicy(minimal(), ACTION_OWNER);
    expect(() => r.approvePolicy(CAP, "2.0.0", ACTION_OWNER)).toThrow(
      /own proposal/,
    );
    const approved = r.approvePolicy(CAP, "2.0.0", SECOND);
    expect(approved.status).toBe("approved");
  });

  it("refuses an approval from someone who holds no needed role", () => {
    const r = registerWithAction();
    r.proposePolicy(minimal(), ACTION_OWNER);
    expect(() =>
      r.approvePolicy(CAP, "2.0.0", { id: "stranger", roles: [] }),
    ).toThrow(/no role that this policy version still needs/);
  });

  it("needs the Parmana owner too when the policy reads a source that can approve", () => {
    const r = registerWithAction();
    registerSource(r);
    r.proposePolicy(sourced(), ACTION_OWNER);
    const onlySecond = r.approvePolicy(CAP, "2.0.0", SECOND);
    expect(onlySecond.status).toBe("proposed");
    const withOwner = r.approvePolicy(CAP, "2.0.0", OWNER);
    expect(withOwner.status).toBe("approved");
    expect(withOwner.approvals.map((a) => a.role).sort()).toEqual([
      "parmana-owner",
      "second-approver",
    ]);
  });

  it("refuses an approval if the register no longer supports the policy", () => {
    const r = registerWithAction();
    registerSource(r);
    r.proposePolicy(sourced(), ACTION_OWNER);
    r.revokeSource("ledger", OWNER, "key exposed");
    expect(() => r.approvePolicy(CAP, "2.0.0", SECOND)).toThrow(/not valid/);
  });

  it("supersedes the approved version when a new one is approved", () => {
    const r = registerWithAction();
    r.proposePolicy(minimal("2.0.0"), ACTION_OWNER);
    r.approvePolicy(CAP, "2.0.0", SECOND);
    r.proposePolicy(minimal("2.0.1"), ACTION_OWNER);
    r.approvePolicy(CAP, "2.0.1", SECOND);
    expect(r.getPolicyVersion(CAP, "2.0.0")!.status).toBe("superseded");
    expect(r.getPolicyVersion(CAP, "2.0.1")!.status).toBe("approved");
  });
});

describe("using the approved version", () => {
  it("is not used until the action has passed the go-live gate", () => {
    const r = new PolicyRegister(() => NOW);
    r.bootstrapOwner(OWNER.id);
    r.grantRole(OWNER, ACTION_OWNER.id, "action-owner");
    r.grantRole(OWNER, SECOND.id, "second-approver");
    r.registerAction(
      {
        capability: CAP,
        owner: ACTION_OWNER.id,
        successor: "action-2",
        reviewers: ["rev-1", "rev-2", "rev-3"],
        review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
      },
      OWNER,
    );
    r.proposePolicy(minimal(), ACTION_OWNER);
    r.approvePolicy(CAP, "2.0.0", SECOND);
    expect(r.activePolicy(CAP)).toBeUndefined();
    r.recordTest(CAP, "reject", GATE);
    expect(r.activePolicy(CAP)?.policyVersion).toBe("2.0.0");
  });

  it("is not used once a source it reads has been revoked", () => {
    const r = registerWithAction();
    registerSource(r);
    r.proposePolicy(sourced(), ACTION_OWNER);
    r.approvePolicy(CAP, "2.0.0", SECOND);
    r.approvePolicy(CAP, "2.0.0", OWNER);
    expect(r.activePolicy(CAP)?.policyVersion).toBe("2.0.0");
    r.revokeSource("ledger", OWNER, "key exposed");
    expect(r.activePolicy(CAP)).toBeUndefined();
  });

  it("keeps approved versions through a snapshot and a load, and reads an older snapshot as none", () => {
    const r = registerWithAction();
    r.proposePolicy(minimal(), ACTION_OWNER);
    r.approvePolicy(CAP, "2.0.0", SECOND);
    const restored = new PolicyRegister(() => NOW);
    restored.load(JSON.parse(JSON.stringify(r.snapshot())));
    expect(restored.activePolicy(CAP)?.policyVersion).toBe("2.0.0");

    const older = {
      ...r.snapshot(),
      policyVersions: undefined,
    } as unknown as ReturnType<PolicyRegister["snapshot"]>;
    const fromOlder = new PolicyRegister(() => NOW);
    fromOlder.load(older);
    expect(fromOlder.listPolicyVersions()).toEqual([]);
  });
});
