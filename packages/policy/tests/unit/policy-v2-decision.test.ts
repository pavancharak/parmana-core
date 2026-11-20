import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  decide,
  type ApprovedPolicy,
  type DecisionDeps,
  type DecisionRequest,
} from "../../src/v2/decision.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";
import {
  MemoryNonceStore,
  signAnswer,
  type AnswerPayload,
} from "../../src/v2/sourceAnswer.js";

/** Tests for the decision flow (design 4.4; plan step 4). */

const NOW = new Date("2026-11-18T09:00:00.000Z");
const CAPABILITY = "erp:pay-invoice";

const keys: Record<
  string,
  { publicKey: KeyObject; privateKey: KeyObject; pem: string }
> = {};
for (const name of ["procurement-system", "vendor-master", "ledger"]) {
  const pair = generateKeyPairSync("ed25519");
  keys[name] = {
    publicKey: pair.publicKey,
    privateKey: pair.privateKey,
    pem: pair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  };
}

const sourceOwner: Person = { id: "src-owner", roles: ["source-owner"] };
const second: Person = { id: "second-1", roles: ["second-approver"] };
const parmana: Person = { id: "parmana-1", roles: ["parmana-owner"] };
const actionOwner: Person = { id: "action-owner-1", roles: ["action-owner"] };
const gate: Person = { id: "gate-1", roles: ["gate-owner"] };

/** A register with three trusted sources, the action, and two approved thresholds. */
function buildRegister(): PolicyRegister {
  const register = new PolicyRegister(() => NOW);
  const sources: [string, Record<string, string>][] = [
    ["procurement-system", { "invoice.amount": "USD" }],
    ["vendor-master", { "vendor.verified": "" }],
    ["ledger", { "funds.available": "" }],
  ];
  for (const [name, claims] of sources) {
    register.proposeSource(
      {
        name,
        dataOwner: "owner",
        signer: { kind: "system" },
        keyId: `${name}-key`,
        publicKeyPem: keys[name]!.pem,
        claims,
        canApprove: false,
      },
      sourceOwner,
    );
    register.approveSource(name, second);
  }
  register.registerAction(
    {
      capability: CAPABILITY,
      owner: "action-owner-1",
      successor: "action-owner-2",
      reviewers: ["r1", "r2", "r3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    parmana,
  );
  const base = {
    action: CAPABILITY,
    owner: "action-owner-1",
    reason: "A reason.",
    evidence: "Evidence.",
    nextReview: "2027-05-01",
    highValue: false,
  };
  register.proposeThreshold(
    { ...base, name: "automaticLimit", value: 5000, unit: "USD" },
    actionOwner,
  );
  register.approveThreshold(CAPABILITY, "automaticLimit", second);
  register.proposeThreshold(
    { ...base, name: "reviewRiskScoreAbove", value: 80, unit: "points" },
    actionOwner,
  );
  register.approveThreshold(CAPABILITY, "reviewRiskScoreAbove", second);
  void gate;
  return register;
}

const policy = {
  policyId: "payment-limit",
  policyVersion: "2.0.0",
  schemaVersion: "2.0.0",
  capability: CAPABILITY,
  description: "Pays an invoice to a verified vendor when funds are available.",
  owner: "action-owner-1",
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
    riskScore: { type: "number", provenance: "untrusted", unit: "points" },
  },
  thresholds: {
    automaticLimit: {
      value: 5000,
      unit: "USD",
      owner: "action-owner-1",
      approvedBy: "second-1",
      reason: "A reason.",
      nextReview: "2027-05-01",
    },
    reviewRiskScoreAbove: {
      value: 80,
      unit: "points",
      owner: "action-owner-1",
      approvedBy: "second-1",
      reason: "A reason.",
      nextReview: "2027-05-01",
    },
  },
  review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
  rules: [
    {
      id: "refuse-vendor-not-verified",
      tier: "refuse",
      when: { fact: "vendorVerified", operator: "is_false" },
      outcome: { action: "reject", reason: "The vendor is not verified." },
    },
    {
      id: "refuse-no-funds",
      tier: "refuse",
      when: { fact: "fundsAvailable", operator: "is_false" },
      outcome: { action: "reject", reason: "No funds." },
    },
    {
      id: "review-high-risk-score",
      tier: "review",
      when: {
        fact: "riskScore",
        operator: "gt",
        value: { threshold: "reviewRiskScoreAbove" },
      },
      outcome: { action: "review", reason: "The risk score is high." },
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
      outcome: { action: "approve", reason: "Automatic payment." },
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
        reason: "Finance approved this exact amount.",
      },
    },
    {
      id: "reject-default",
      tier: "reject",
      when: { always: true },
      outcome: {
        action: "reject",
        reason: "Human approval or review is needed.",
      },
    },
  ],
};

interface Scenario {
  readonly sourceValues: Record<string, string | number | boolean>;
  readonly tamper?: Record<string, "unsigned" | "unavailable">;
  readonly observedAgoMs?: number;
  readonly policyOverride?: unknown;
}

/** Builds deps and a request. The source client signs each answer with the source's registered key. */
function setup(
  scenario: Scenario,
  requestOverrides: Partial<DecisionRequest> = {},
) {
  const register = buildRegister();
  const nonces = new MemoryNonceStore(() => NOW);
  const sourceClient: DecisionDeps["sources"] = async (query) => {
    const mode = scenario.tamper?.[query.source];
    if (mode === "unavailable") throw new Error("down");
    if (mode === "unsigned") {
      return { payload: { source: query.source } };
    }
    const value = scenario.sourceValues[`${query.source}:${query.claim}`];
    const observed = NOW.getTime() - (scenario.observedAgoMs ?? 1_000);
    const payload: AnswerPayload = {
      source: query.source,
      keyId: `${query.source}-key`,
      claim: query.claim,
      subject: query.subject,
      value: value as string | number | boolean,
      action: query.action,
      transactionId: query.transactionId,
      nonce: `n-${Math.random().toString(36).slice(2)}`,
      observedAt: new Date(observed).toISOString(),
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    };
    return signAnswer(payload, keys[query.source]!.privateKey);
  };
  const approved: ApprovedPolicy | undefined = {
    policy: scenario.policyOverride ?? policy,
  };
  const deps: DecisionDeps = {
    policies: (capability) =>
      capability === CAPABILITY ? approved : undefined,
    register,
    sources: sourceClient,
    nonces,
    approvals: async (_signal, artifact, expected) =>
      artifact === `approved:${String(expected.value)}`,
    now: () => NOW,
  };
  const request: DecisionRequest = {
    capability: CAPABILITY,
    transactionId: "tx-1",
    target: "INV-1001",
    parameters: { vendorId: "VEN-7", accountId: "ACC-1" },
    signals: { riskScore: 10 },
    ...requestOverrides,
  };
  return { deps, request };
}

const funds = (
  invoice: number,
  extra: Record<string, string | number | boolean> = {},
) => ({
  "procurement-system:invoice.amount": invoice,
  "vendor-master:vendor.verified": true,
  "ledger:funds.available": true,
  ...extra,
});

describe("decide: outcomes", () => {
  it("approves automatically when every value is sourced and the amount is within the limit (tier 1)", async () => {
    const { deps, request } = setup({ sourceValues: funds(4000) });
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("APPROVE");
    expect(decision.tier).toBe("tier1");
    expect(decision.matchedRuleId).toBe("tier1-automatic-payment");
    expect(decision.values["invoiceAmount"]?.provenance).toBe("sourced");
  });

  it("approves with a verified approval for the exact amount above the limit (tier 2)", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(9000) },
      { approvals: { financeApproval: "approved:9000" } },
    );
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("APPROVE");
    expect(decision.tier).toBe("tier2");
  });

  it("rejects an approval for a different amount, because approvals are exact", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(9000) },
      { approvals: { financeApproval: "approved:5000" } },
    );
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-default");
  });

  it("rejects above the limit with no approval", async () => {
    const { deps, request } = setup({ sourceValues: funds(9000) });
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("reject-default");
  });

  it("refuses by a trusted value's rule, before any tier", async () => {
    const { deps, request } = setup({
      sourceValues: funds(4000, { "ledger:funds.available": false }),
    });
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("REJECT");
    expect(decision.matchedRuleId).toBe("refuse-no-funds");
  });

  it("sends the request to review when an untrusted value would change the outcome", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(4000) },
      { signals: { riskScore: 90 } },
    );
    const decision = await decide(request, deps);
    expect(decision.outcome).toBe("REVIEW");
    expect(decision.matchedRuleId).toBe("review-high-risk-score");
  });

  it("records the policy hash, and the provenance of every value", async () => {
    const { deps, request } = setup({ sourceValues: funds(4000) });
    const decision = await decide(request, deps);
    expect(decision.policy.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(decision.values["riskScore"]).toMatchObject({
      value: 10,
      provenance: "untrusted",
    });
  });
});

describe("decide: refusals before any rule runs", () => {
  it("refuses when no approved policy is in force", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(4000) },
      { capability: "other:thing" },
    );
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("NO_APPROVED_POLICY");
  });

  it("refuses a policy that does not pass the validator", async () => {
    const broken = { ...policy, rules: policy.rules.slice(0, -1) };
    const { deps, request } = setup({
      sourceValues: funds(4000),
      policyOverride: broken,
    });
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("POLICY_INVALID");
  });

  it("refuses when a source does not answer", async () => {
    const { deps, request } = setup({
      sourceValues: funds(4000),
      tamper: { ledger: "unavailable" },
    });
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("SOURCE_UNAVAILABLE");
  });

  it("refuses an unsigned answer from a source", async () => {
    const { deps, request } = setup({
      sourceValues: funds(4000),
      tamper: { "vendor-master": "unsigned" },
    });
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("SOURCE_NOT_VERIFIED");
    expect(decision.refusal?.detail).toContain("vendorVerified");
  });

  it("refuses a stale answer", async () => {
    const { deps, request } = setup({
      sourceValues: funds(4000),
      observedAgoMs: 2 * 60 * 60 * 1000,
    });
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("STALE");
  });

  it("refuses when the caller's value disagrees with the source's (INVALID)", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(9000) },
      { signals: { riskScore: 10, invoiceAmount: 4000 } },
    );
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("INVALID");
  });

  it("refuses when a value a rule needs was not sent", async () => {
    const { deps, request } = setup(
      { sourceValues: funds(4000) },
      { signals: {} },
    );
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("MISSING_VALUE");
  });

  it("refuses when a threshold in the policy differs from the approved one in the register", async () => {
    const changed = {
      ...policy,
      thresholds: {
        ...policy.thresholds,
        automaticLimit: { ...policy.thresholds.automaticLimit, value: 9999 },
      },
    };
    const { deps, request } = setup({
      sourceValues: funds(4000),
      policyOverride: changed,
    });
    const decision = await decide(request, deps);
    expect(decision.refusal?.code).toBe("THRESHOLD_NOT_APPROVED");
  });
});
