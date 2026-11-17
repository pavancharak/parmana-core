import { describe, expect, it } from "vitest";

import {
  validatePolicyV2,
  type ValidationRegister,
} from "../../src/v2/validatePolicyV2.js";

/**
 * Tests for the policy version 2 validator (docs/internal/design/POLICY-V2-SPEC.md, section 7).
 *
 * The two examples come from the specification, with placeholders replaced by test values.
 * Tests on the placeholder form show that the validator refuses it.
 */

const register: ValidationRegister = {
  sources: {
    "procurement-system": {
      status: "trusted",
      signer: { kind: "system" },
      claims: { "invoice.amount": "USD" },
    },
    "vendor-master": {
      status: "trusted",
      signer: { kind: "system" },
      claims: { "vendor.verified": "" },
    },
    ledger: {
      status: "trusted",
      signer: { kind: "system" },
      claims: { "funds.available": "" },
    },
    "change-system": {
      status: "trusted",
      signer: { kind: "system" },
      claims: {
        "change.approved": "",
        "change.blastRadius": "services",
        "change.id": "",
      },
    },
    "change-calendar": {
      status: "trusted",
      signer: { kind: "system" },
      claims: { "window.open": "" },
    },
    "release-system": {
      status: "trusted",
      signer: { kind: "system" },
      claims: { "rollback.verified": "" },
    },
  },
};

const vendorPayment = {
  policyId: "vendor-payment",
  policyVersion: "2.0.0",
  schemaVersion: "2.0.0",
  capability: "erp:pay-invoice",
  description:
    "Pays an approved invoice to a verified vendor when the ledger has the funds. Payments above the automatic limit need a finance approver's signed approval for the exact amount. A caller's risk score can refuse or route a payment, never approve it.",
  owner: "finance-owner",
  signals: {
    invoiceAmount: {
      type: "number",
      provenance: "sourced",
      source: "procurement-system",
      claim: "invoice.amount",
      subject: "target",
      maxAgeSeconds: 60,
      unit: "USD",
    },
    vendorVerified: {
      type: "boolean",
      provenance: "sourced",
      source: "vendor-master",
      claim: "vendor.verified",
      subject: "parameters.vendorId",
      maxAgeSeconds: 300,
    },
    fundsAvailable: {
      type: "boolean",
      provenance: "sourced",
      source: "ledger",
      claim: "funds.available",
      subject: "parameters.accountId",
      maxAgeSeconds: 60,
    },
    financeApproval: {
      type: "approval",
      provenance: "approved",
      approvalFor: { resourceId: "target", value: "invoiceAmount" },
      scope: "exact",
    },
    requestedAmount: { type: "number", provenance: "untrusted", unit: "USD" },
    riskScore: { type: "number", provenance: "untrusted", unit: "points" },
  },
  thresholds: {
    automaticLimit: {
      value: 5000,
      unit: "USD",
      owner: "finance-owner",
      approvedBy: "second-approver",
      reason:
        "Payments up to this value are automated after trusted checks pass.",
      nextReview: "2027-05-01",
    },
    reviewRiskScoreAbove: {
      value: 80,
      unit: "points",
      owner: "risk-owner",
      approvedBy: "second-approver",
      reason:
        "A caller risk score above this needs a person to check the payment.",
      nextReview: "2027-05-01",
    },
  },
  review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
  rules: [
    {
      id: "refuse-vendor-not-verified",
      tier: "refuse",
      when: { fact: "vendorVerified", operator: "is_false" },
      outcome: {
        action: "reject",
        reason: "The vendor master does not verify this vendor.",
      },
    },
    {
      id: "refuse-no-funds",
      tier: "refuse",
      when: { fact: "fundsAvailable", operator: "is_false" },
      outcome: {
        action: "reject",
        reason: "The ledger does not show enough funds.",
      },
    },
    {
      id: "review-high-risk-score",
      tier: "review",
      when: {
        fact: "riskScore",
        operator: "gt",
        value: { threshold: "reviewRiskScoreAbove" },
      },
      outcome: {
        action: "review",
        reason:
          "The caller's risk score is high. A person should check the payment.",
      },
    },
    {
      id: "tier1-automatic-payment",
      tier: "tier1",
      when: {
        all: [
          { fact: "vendorVerified", operator: "is_true" },
          { fact: "fundsAvailable", operator: "is_true" },
          {
            fact: "invoiceAmount",
            operator: "lte",
            value: { threshold: "automaticLimit" },
          },
        ],
      },
      outcome: {
        action: "approve",
        reason:
          "Every check was confirmed by a trusted source, and the amount is within the automatic limit.",
      },
    },
    {
      id: "tier2-finance-approved-payment",
      tier: "tier2",
      when: {
        all: [
          { fact: "vendorVerified", operator: "is_true" },
          { fact: "fundsAvailable", operator: "is_true" },
          { fact: "financeApproval", operator: "is_true" },
        ],
      },
      outcome: {
        action: "approve",
        reason:
          "Every check was confirmed by a trusted source, and a finance approver approved this exact amount.",
      },
    },
    {
      id: "reject-default",
      tier: "reject",
      when: { always: true },
      outcome: {
        action: "reject",
        reason:
          "The payment does not meet the policy. Human approval or review is needed.",
      },
    },
  ],
};

const deployment = {
  policyId: "production-deployment",
  policyVersion: "2.0.0",
  schemaVersion: "2.0.0",
  capability: "deploy:release-to-production",
  description:
    "Releases a change to production when the change system confirms an approved change, the release is inside the maintenance window, and the rollback plan is confirmed. Other deployments need an approval from the service owner for that exact change.",
  owner: "platform-owner",
  signals: {
    changeApproved: {
      type: "boolean",
      provenance: "sourced",
      source: "change-system",
      claim: "change.approved",
      subject: "target",
      maxAgeSeconds: 300,
    },
    inMaintenanceWindow: {
      type: "boolean",
      provenance: "sourced",
      source: "change-calendar",
      claim: "window.open",
      subject: "parameters.service",
      maxAgeSeconds: 60,
    },
    rollbackVerified: {
      type: "boolean",
      provenance: "sourced",
      source: "release-system",
      claim: "rollback.verified",
      subject: "target",
      maxAgeSeconds: 300,
    },
    blastRadius: {
      type: "number",
      provenance: "sourced",
      source: "change-system",
      claim: "change.blastRadius",
      subject: "target",
      maxAgeSeconds: 300,
      unit: "services",
    },
    changeId: {
      type: "string",
      provenance: "sourced",
      source: "change-system",
      claim: "change.id",
      subject: "target",
      maxAgeSeconds: 300,
    },
    serviceOwnerApproval: {
      type: "approval",
      provenance: "approved",
      approvalFor: { resourceId: "target", value: "changeId" },
      scope: "exact",
    },
    assistantRiskNote: {
      type: "enum",
      provenance: "ai",
      model: "change-risk-classifier",
      values: ["low", "medium", "high"],
      permittedUse: ["review"],
    },
  },
  thresholds: {
    automaticBlastRadius: {
      value: 1,
      unit: "services",
      owner: "platform-owner",
      approvedBy: "second-approver",
      reason:
        "Changes touching at most this many services are automated after trusted checks pass.",
      nextReview: "2027-05-01",
    },
  },
  review: { reviewWindowBusinessDays: 2, approvalValidityMinutes: 30 },
  rules: [
    {
      id: "refuse-change-not-approved",
      tier: "refuse",
      when: { fact: "changeApproved", operator: "is_false" },
      outcome: {
        action: "reject",
        reason: "The change system has no approval for this change.",
      },
    },
    {
      id: "refuse-outside-window",
      tier: "refuse",
      when: { fact: "inMaintenanceWindow", operator: "is_false" },
      outcome: {
        action: "reject",
        reason: "The release falls outside the maintenance window.",
      },
    },
    {
      id: "review-high-risk-note",
      tier: "review",
      when: { fact: "assistantRiskNote", operator: "eq", value: "high" },
      outcome: {
        action: "review",
        reason:
          "The risk classifier flagged this change as high risk. A person should check it.",
      },
    },
    {
      id: "tier1-small-change",
      tier: "tier1",
      when: {
        all: [
          { fact: "changeApproved", operator: "is_true" },
          { fact: "inMaintenanceWindow", operator: "is_true" },
          { fact: "rollbackVerified", operator: "is_true" },
          {
            fact: "blastRadius",
            operator: "lte",
            value: { threshold: "automaticBlastRadius" },
          },
        ],
      },
      outcome: {
        action: "approve",
        reason:
          "The change is approved, inside the window, rollback is verified, and the change touches few services.",
      },
    },
    {
      id: "tier2-owner-approved-change",
      tier: "tier2",
      when: {
        all: [
          { fact: "changeApproved", operator: "is_true" },
          { fact: "inMaintenanceWindow", operator: "is_true" },
          { fact: "rollbackVerified", operator: "is_true" },
          { fact: "serviceOwnerApproval", operator: "is_true" },
        ],
      },
      outcome: {
        action: "approve",
        reason:
          "The change is approved and inside the window, rollback is verified, and the service owner approved this change.",
      },
    },
    {
      id: "reject-default",
      tier: "reject",
      when: { always: true },
      outcome: {
        action: "reject",
        reason:
          "The release does not meet the policy. Human approval or review is needed.",
      },
    },
  ],
};

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Returns the check numbers of every error, in order. */
function checks(policy: unknown, reg: ValidationRegister = register): number[] {
  return validatePolicyV2(policy, reg).errors.map((e) => e.check);
}

describe("validatePolicyV2: the two specification examples", () => {
  it("accepts the vendor payment example with its placeholders filled in", () => {
    const result = validatePolicyV2(copy(vendorPayment), register);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("accepts the deployment example with its placeholders filled in", () => {
    const result = validatePolicyV2(copy(deployment), register);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("refuses the vendor example while its placeholders remain, and names each one", () => {
    const placeholder = copy(vendorPayment);
    placeholder.owner = "<finance action owner>";
    placeholder.signals.invoiceAmount.unit = "<currency>";
    placeholder.thresholds.automaticLimit.approvedBy = "<second approver>";
    placeholder.thresholds.automaticLimit.nextReview = "<date>";
    const result = validatePolicyV2(placeholder, register);
    expect(result.ok).toBe(false);
    const placeholderErrors = result.errors.filter((e) => e.check === 20);
    expect(placeholderErrors.map((e) => e.path)).toEqual(
      expect.arrayContaining([
        "policy.owner",
        "policy.signals.invoiceAmount.unit",
        "policy.thresholds.automaticLimit.approvedBy",
        "policy.thresholds.automaticLimit.nextReview",
      ]),
    );
  });

  it("refuses the deployment example as written in the spec, because blastRadius is untrusted in a tier 1 rule", () => {
    const asWritten = copy(deployment);
    asWritten.signals.blastRadius = {
      type: "number",
      provenance: "untrusted",
      unit: "services",
    } as typeof asWritten.signals.blastRadius;
    expect(checks(asWritten)).toContain(5);
  });
});

describe("validatePolicyV2: individual checks", () => {
  it("check 1: refuses a rule that reads an undeclared value", () => {
    const p = copy(vendorPayment);
    p.rules[2]!.when = { fact: "unknownSignal", operator: "is_true" } as never;
    expect(checks(p)).toContain(1);
  });

  it("check 2: refuses a capability without the system:action form", () => {
    const p = copy(vendorPayment);
    p.capability = "payments";
    expect(checks(p)).toContain(2);
  });

  it("check 3: refuses rules that go backwards in tier order", () => {
    const p = copy(vendorPayment);
    const [first, third] = [p.rules[0]!, p.rules[2]!];
    p.rules[0] = third;
    p.rules[2] = first;
    expect(checks(p)).toContain(3);
  });

  it("check 4: refuses a policy with no reject rule at the end", () => {
    const p = copy(vendorPayment);
    p.rules.pop();
    expect(checks(p)).toContain(4);
  });

  it("check 5: refuses a tier 1 rule that reads an untrusted value", () => {
    const p = copy(vendorPayment);
    p.rules[3]!.when = {
      all: [
        {
          fact: "requestedAmount",
          operator: "lte",
          value: { threshold: "automaticLimit" },
        },
      ],
    } as never;
    expect(checks(p)).toContain(5);
  });

  it("check 6: refuses a tier 2 approved value that is not required is_true", () => {
    const p = copy(vendorPayment);
    p.rules[4]!.when = {
      all: [
        { fact: "vendorVerified", operator: "is_true" },
        { fact: "fundsAvailable", operator: "is_true" },
        { fact: "financeApproval", operator: "is_false" },
      ],
    } as never;
    expect(checks(p)).toContain(6);
  });

  it("check 7: refuses an approve outcome in a refuse rule", () => {
    const p = copy(vendorPayment);
    p.rules[0]!.outcome = { action: "approve", reason: "x" } as never;
    expect(checks(p)).toContain(7);
  });

  it("check 8: refuses an approval that is not exact, or whose value is not a declared signal", () => {
    const notExact = copy(vendorPayment);
    notExact.signals.financeApproval.scope = "upTo" as never;
    expect(checks(notExact)).toContain(8);

    const undeclared = copy(vendorPayment);
    undeclared.signals.financeApproval.approvalFor.value = "parameters.amount";
    expect(checks(undeclared)).toContain(8);
  });

  it("check 9: refuses a sourced value from a source that is not trusted", () => {
    const reg = copy(register);
    reg.sources["ledger"] = { ...reg.sources["ledger"]!, status: "untrusted" };
    expect(checks(copy(vendorPayment), reg)).toContain(9);
  });

  it("check 10: refuses an AI value that may approve", () => {
    const p = copy(deployment);
    p.signals.assistantRiskNote.permittedUse = ["approve"] as never;
    expect(checks(p)).toContain(10);
  });

  it("check 11: refuses a tier 1 threshold with no approver", () => {
    const p = copy(vendorPayment);
    delete (p.thresholds.automaticLimit as { approvedBy?: string }).approvedBy;
    expect(checks(p)).toContain(11);
  });

  it("check 13: refuses a rule with no reason", () => {
    const p = copy(vendorPayment);
    p.rules[0]!.outcome.reason = "";
    expect(checks(p)).toContain(13);
  });

  it("check 14: refuses a rule that compares one value with another", () => {
    const p = copy(vendorPayment);
    p.rules[3]!.when = {
      all: [
        {
          fact: "invoiceAmount",
          operator: "lte",
          value: { fact: "requestedAmount" },
        },
      ],
    } as never;
    expect(checks(p)).toContain(14);
  });

  it("check 15: refuses a literal number other than zero, and accepts zero", () => {
    const literal = copy(vendorPayment);
    literal.rules[2]!.when = {
      fact: "riskScore",
      operator: "gt",
      value: 80,
    } as never;
    expect(checks(literal)).toContain(15);

    const zero = copy(vendorPayment);
    zero.rules[2]!.when = {
      fact: "riskScore",
      operator: "gt",
      value: 0,
    } as never;
    expect(checks(zero)).not.toContain(15);
  });

  it("check 16: refuses a comparison between different units, and a number with no unit", () => {
    const mismatch = copy(vendorPayment);
    mismatch.thresholds.automaticLimit.unit = "points";
    expect(checks(mismatch)).toContain(16);

    const noUnit = copy(vendorPayment);
    delete (noUnit.signals.riskScore as { unit?: string }).unit;
    expect(checks(noUnit)).toContain(16);
  });

  it("check 17: refuses a source or claim that is not registered", () => {
    const p = copy(vendorPayment);
    p.signals.vendorVerified.source = "unknown-system";
    expect(checks(p)).toContain(17);
  });

  it("check 18: refuses review settings above the caps, and a missing review block", () => {
    const longWindow = copy(vendorPayment);
    longWindow.review.reviewWindowBusinessDays = 4;
    expect(checks(longWindow)).toContain(18);

    const longApproval = copy(vendorPayment);
    longApproval.review.approvalValidityMinutes = 90;
    expect(checks(longApproval)).toContain(18);

    const missing = copy(vendorPayment) as Partial<typeof vendorPayment>;
    delete missing.review;
    expect(checks(missing)).toContain(18);
  });

  it("check 19: refuses an intermediary signer with no named operator or review date", () => {
    const reg = copy(register);
    reg.sources["ledger"] = {
      ...reg.sources["ledger"]!,
      signer: { kind: "intermediary" },
    };
    expect(checks(copy(vendorPayment), reg)).toContain(19);
  });

  it("check 20: refuses a placeholder anywhere in the policy", () => {
    const p = copy(vendorPayment);
    p.description = "Pays for <vendor name>.";
    expect(checks(p)).toContain(20);
  });
});
