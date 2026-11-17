import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  ApproverKeys,
  signApproval,
  verifyApproval,
  viewDigest,
  type ApprovalView,
} from "../../src/v2/approvals.js";
import {
  decide,
  type ApprovedPolicy,
  type DecisionDeps,
  type DecisionRequest,
} from "../../src/v2/decision.js";
import {
  EvidenceLog,
  PolicyStore,
  provenanceMatchesPolicy,
  recordDecision,
  replay,
  snapshotFor,
  type EvidenceRecord,
} from "../../src/v2/evidence.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";
import {
  MemoryNonceStore,
  signAnswer,
  type AnswerPayload,
} from "../../src/v2/sourceAnswer.js";

/** Tests for evidence and replay (design 4.9; plan step 8). */

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
const approverPair = generateKeyPairSync("ed25519");
const APPROVER = "finance-lead-1";
const APPROVER_KEY = "finance-lead-1-key";

const sourceOwner: Person = { id: "src-owner", roles: ["source-owner"] };
const second: Person = { id: "second-1", roles: ["second-approver"] };
const parmana: Person = { id: "parmana-1", roles: ["parmana-owner"] };
const actionOwner: Person = { id: "action-owner-1", roles: ["action-owner"] };

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
  return register;
}

const policy = {
  policyId: "vendor-payment",
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
      outcome: { action: "reject", reason: "Not verified." },
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
      outcome: { action: "review", reason: "High risk." },
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
      outcome: { action: "approve", reason: "Automatic." },
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
      outcome: { action: "approve", reason: "Approved by finance." },
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

interface World {
  register: PolicyRegister;
  approvers: ApproverKeys;
  policies: PolicyStore;
  log: EvidenceLog;
  unavailable: Set<string>;
}

function world(): World {
  const register = buildRegister();
  const approvers = new ApproverKeys();
  approvers.register(
    APPROVER,
    APPROVER_KEY,
    approverPair.publicKey.export({ type: "spki", format: "pem" }).toString(),
  );
  const policies = new PolicyStore();
  policies.put(policy);
  return {
    register,
    approvers,
    policies,
    log: new EvidenceLog(),
    unavailable: new Set(),
  };
}

const funds = (invoice: number) => ({
  invoice,
  vendorVerified: true,
  fundsAvailable: true,
});

/** Decides a request against the live world and records it with its snapshot. */
async function decideAndRecord(
  w: World,
  invoice: number,
  extra: Partial<DecisionRequest> = {},
): Promise<EvidenceRecord> {
  const approved: ApprovedPolicy = { policy };
  const sourceClient: DecisionDeps["sources"] = async (query) => {
    if (w.unavailable.has(query.source)) throw new Error("down");
    const values: Record<string, string | number | boolean> = {
      "procurement-system:invoice.amount": invoice,
      "vendor-master:vendor.verified": true,
      "ledger:funds.available": true,
    };
    const payload: AnswerPayload = {
      source: query.source,
      keyId: `${query.source}-key`,
      claim: query.claim,
      subject: query.subject,
      value: values[`${query.source}:${query.claim}`]!,
      action: query.action,
      transactionId: query.transactionId,
      nonce: `n-${Math.random().toString(36).slice(2)}`,
      observedAt: new Date(NOW.getTime() - 1_000).toISOString(),
      expiresAt: new Date(NOW.getTime() + 86_400_000).toISOString(),
    };
    return signAnswer(payload, keys[query.source]!.privateKey);
  };
  const request: DecisionRequest = {
    capability: CAPABILITY,
    transactionId: `tx-${Math.random().toString(36).slice(2)}`,
    target: "INV-1001",
    parameters: { vendorId: "VEN-7", accountId: "ACC-1" },
    signals: { riskScore: 10 },
    ...extra,
  };
  const deps: DecisionDeps = {
    policies: (capability) =>
      capability === CAPABILITY ? approved : undefined,
    register: w.register,
    sources: sourceClient,
    nonces: new MemoryNonceStore(() => NOW),
    approvals: approvalChecker(w.approvers),
    now: () => NOW,
  };
  const decision = await decide(request, deps);
  const snapshot = snapshotFor(
    policy,
    CAPABILITY,
    decision.inputs,
    w.register,
    w.approvers,
  );
  return recordDecision(w.log, request, decision, snapshot, NOW);
}

/** Verifies approvals with the approver's key, as the approval checker does. */
function approvalChecker(approvers: ApproverKeys) {
  return async (
    signal: string,
    artifact: unknown,
    expected: {
      resource: string;
      value: string | number | boolean;
      action: string;
      now: Date;
    },
  ) => {
    return verifyApproval(
      artifact,
      {
        signal,
        capability: expected.action,
        resource: expected.resource,
        value: expected.value,
        now: expected.now,
      },
      { approvers, nonces: new MemoryNonceStore(() => NOW) },
    ).ok;
  };
}

function approvalFor(invoice: number): unknown {
  const view: ApprovalView = {
    capability: CAPABILITY,
    target: "INV-1001",
    values: { invoiceAmount: { value: invoice, provenance: "sourced" } },
    missing: [],
    callerReason: "Invoice due.",
  };
  return signApproval({
    view,
    signal: "invoiceAmount",
    value: invoice,
    confirmation: {
      digest: viewDigest(view),
      confirmedAt: NOW.toISOString(),
      approverId: APPROVER,
    },
    approverId: APPROVER,
    keyId: APPROVER_KEY,
    privateKey: approverPair.privateKey,
    validityMinutes: 15,
    nonce: `a-${Math.random().toString(36).slice(2)}`,
    now: NOW,
  });
}

describe("recording", () => {
  it("records the policy hash, the outcome, the signed inputs and the snapshot", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    expect(record.policyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(record.decision.outcome).toBe("APPROVE");
    expect(Object.keys(record.inputs.answers).sort()).toEqual([
      "fundsAvailable",
      "invoiceAmount",
      "vendorVerified",
    ]);
    expect(record.snapshot.sources.map((s) => s.source).sort()).toEqual([
      "ledger",
      "procurement-system",
      "vendor-master",
    ]);
    expect(
      record.snapshot.thresholds[`${CAPABILITY}/automaticLimit`],
    ).toMatchObject({ value: 5000, status: "approved" });
  });

  it("derives provenance from the policy, so the record matches the policy's declarations", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    expect(provenanceMatchesPolicy(record, policy)).toBe(true);
  });

  it("chains each record to the one before, and the chain verifies", async () => {
    const w = world();
    const first = await decideAndRecord(w, 4000);
    const second = await decideAndRecord(w, 9000);
    expect(first.prevHash).toBe("genesis");
    expect(second.prevHash).toBe(first.hash);
    expect(w.log.verifyChain()).toBe(true);
  });

  it("breaks the chain when any recorded field is altered", async () => {
    const w = world();
    await decideAndRecord(w, 4000);
    await decideAndRecord(w, 9000);
    const [first, second] = w.log.all();
    const altered = {
      ...first!,
      decision: { ...first!.decision, outcome: "REJECT" as const },
    };
    expect(w.log.verifyChain([altered, second!])).toBe(false);
  });
});

describe("replay", () => {
  it("reproduces a tier 1 approval from the record alone", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    const result = await replay(record, w.policies);
    expect(result).toMatchObject({ reproduced: true, differences: [] });
    expect(result.replayed?.matchedRuleId).toBe("tier1-automatic-payment");
  });

  it("reproduces a tier 2 approval after the approver has since been revoked", async () => {
    const w = world();
    const record = await decideAndRecord(w, 9000, {
      approvals: { financeApproval: approvalFor(9000) },
    });
    expect(record.decision.matchedRuleId).toBe(
      "tier2-finance-approved-payment",
    );
    w.approvers.revoke(APPROVER, APPROVER_KEY);
    expect(await replay(record, w.policies)).toMatchObject({
      reproduced: true,
    });
  });

  it("reproduces a decision after the source has since been revoked", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    w.register.revokeSource("ledger", parmana, "key exposed");
    expect(await replay(record, w.policies)).toMatchObject({
      reproduced: true,
    });
  });

  it("reproduces a recorded refusal", async () => {
    const w = world();
    w.unavailable.add("ledger");
    const record = await decideAndRecord(w, 4000);
    expect(record.decision.refusal?.code).toBe("SOURCE_UNAVAILABLE");
    expect(await replay(record, w.policies)).toMatchObject({
      reproduced: true,
    });
  });

  it("reports a difference when the recorded outcome has been altered", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    const altered: EvidenceRecord = {
      ...record,
      decision: { ...record.decision, outcome: "REJECT" },
    };
    const result = await replay(altered, w.policies);
    expect(result.reproduced).toBe(false);
    expect(result.differences.join(" ")).toMatch(/outcome/);
  });

  it("cannot replay when the policy is not in the store", async () => {
    const w = world();
    const record = await decideAndRecord(w, 4000);
    const result = await replay(record, new PolicyStore());
    expect(result.reproduced).toBe(false);
    expect(result.differences[0]).toMatch(/is not in the store/);
  });
});

describe("the policy store", () => {
  it("returns the policy under its hash, and nothing for an unknown hash", () => {
    const store = new PolicyStore();
    const hash = store.put(policy);
    expect(store.get(hash)).toEqual(JSON.parse(JSON.stringify(policy)));
    expect(store.get("0".repeat(64))).toBeUndefined();
  });
});
