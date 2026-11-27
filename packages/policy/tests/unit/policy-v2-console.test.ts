import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AlertBoard } from "../../src/v2/alerts.js";
import {
  ConsoleError,
  auditScreen,
  changesScreen,
  decisionsScreen,
  gateScreen,
  homeScreen,
  registerScreen,
  reviewsScreen,
  type ConsoleSources,
  type Viewer,
} from "../../src/v2/console.js";
import { EvidenceLog } from "../../src/v2/evidence.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";
import { ReviewQueue } from "../../src/v2/review.js";

/** Tests for the console's screens, as data (design: GOVERNANCE-CONSOLE-DESIGN, sections 2 and 3). */

const NOW = new Date("2026-11-18T09:00:00.000Z");
const CAPABILITY = "erp:pay-invoice";
const key = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

const sourceOwner: Person = { id: "src-owner", roles: ["source-owner"] };
const second: Person = { id: "second-1", roles: ["second-approver"] };
const parmana: Person = { id: "parmana-1", roles: ["parmana-owner"] };
const actionOwner: Person = { id: "action-owner-1", roles: ["action-owner"] };

const auditor: Viewer = { id: "aud-1", roles: ["auditor"] };
const reviewer: Viewer = { id: "rev-1", roles: ["reviewer"] };
const approver: Viewer = { id: "fin-1", roles: ["approver"] };
const nobody: Viewer = { id: "anyone", roles: [] };

function build(): ConsoleSources {
  const register = new PolicyRegister(() => NOW);
  // A source that can approve, with only the second approver signed: still awaiting the Parmana owner.
  register.proposeSource(
    {
      name: "ledger",
      dataOwner: "finance",
      signer: { kind: "system" },
      keyId: "ledger-key",
      publicKeyPem: key,
      claims: { "funds.available": "" },
      canApprove: true,
    },
    sourceOwner,
  );
  register.approveSource("ledger", second);
  // A plain pending source.
  register.proposeSource(
    {
      name: "vendor-master",
      dataOwner: "procurement",
      signer: { kind: "system" },
      keyId: "vm-key",
      publicKeyPem: key,
      claims: { "vendor.verified": "" },
      canApprove: false,
    },
    sourceOwner,
  );
  register.registerAction(
    {
      capability: CAPABILITY,
      owner: "action-owner-1",
      successor: "action-owner-2",
      reviewers: ["rev-1", "rev-2", "rev-3"],
      review: { reviewWindowBusinessDays: 1, approvalValidityMinutes: 15 },
    },
    parmana,
  );
  register.proposeThreshold(
    {
      action: CAPABILITY,
      name: "automaticLimit",
      value: 5000,
      unit: "USD",
      owner: "action-owner-1",
      reason: "A reason.",
      evidence: "Evidence.",
      nextReview: "2027-05-01",
      highValue: true,
    },
    actionOwner,
  );

  const reviews = new ReviewQueue(() => NOW);
  reviews.grant("parmana-1", {
    reviewerId: "rev-1",
    capability: CAPABILITY,
    maxAmount: 50_000,
  });
  reviews.grant("parmana-1", {
    reviewerId: "rev-2",
    capability: CAPABILITY,
    maxAmount: 50_000,
  });
  reviews.open({
    decisionRecord: { recordId: "ev-1", hash: "0".repeat(64) },
    capability: CAPABILITY,
    target: "INV-1001",
    requester: "agent-7",
    decisionRef: {
      policyHash: "a".repeat(64),
      matchedRuleId: "review-high-risk-score",
    },
    reason: "High risk.",
    view: {
      capability: CAPABILITY,
      target: "INV-1001",
      values: { invoiceAmount: { value: 9000, provenance: "sourced" } },
      missing: [],
      callerReason: "Due.",
    },
    highValue: false,
    amount: 9000,
    windowBusinessDays: 1,
  });

  return {
    register,
    reviews,
    alerts: new AlertBoard(
      () => NOW,
      () => true,
    ),
    evidence: new EvidenceLog(),
    audit: () => [
      { at: NOW.toISOString(), by: "system", event: "example", detail: "x" },
    ],
  };
}

describe("access", () => {
  it("refuses every screen to a viewer with no role", () => {
    const src = build();
    expect(() => registerScreen(nobody, src)).toThrow(ConsoleError);
    expect(() => changesScreen(nobody, src)).toThrow(ConsoleError);
    expect(() => reviewsScreen(nobody, src)).toThrow(ConsoleError);
    expect(() => homeScreen(nobody, src)).toThrow(ConsoleError);
    expect(() => auditScreen(nobody, src)).toThrow(ConsoleError);
  });

  it("gives the audit screen to auditors only", () => {
    const src = build();
    expect(auditScreen(auditor, src)).toHaveLength(1);
    expect(() => auditScreen(reviewer, src)).toThrow(/audit screen/);
    expect(() => auditScreen(parmana, src)).toThrow(/audit screen/);
  });

  it("gives the approvals screen to approvers only", () => {
    const src = build();
    expect(() => reviewsScreen(approver, src)).toThrow(ConsoleError);
  });
});

describe("the register and the changes", () => {
  it("shows every source, threshold and action to an auditor, read only", () => {
    const src = build();
    const screen = registerScreen(auditor, src);
    expect(screen.sources.map((s) => s.name).sort()).toEqual([
      "ledger",
      "vendor-master",
    ]);
    expect(screen.actions.map((a) => a.capability)).toEqual([CAPABILITY]);
    expect(screen.thresholds).toHaveLength(1);
  });

  it("says what each pending change still needs, in plain words", () => {
    const rows = changesScreen(parmana, build());
    const ledger = rows.find((r) => r.name === "ledger");
    expect(ledger?.awaiting).toEqual(["the Parmana owner's sign-off"]);
    const vendor = rows.find((r) => r.name === "vendor-master");
    expect(vendor?.awaiting).toEqual(["a second approver"]);
    const threshold = rows.find((r) => r.kind === "threshold");
    expect(threshold?.awaiting).toEqual([
      "a second approver",
      "the risk function",
    ]);
  });
});

describe("the review queue", () => {
  it("marks an item as decidable only for an eligible reviewer who is not the requester", () => {
    const src = build();
    const rev1 = reviewsScreen({ id: "rev-1", roles: ["reviewer"] }, src);
    expect(rev1[0]?.canDecide).toBe(true);
    const requester = reviewsScreen(
      { id: "agent-7", roles: ["reviewer"] },
      src,
    );
    expect(requester[0]?.canDecide).toBe(false);
    const noGrant = reviewsScreen({ id: "rev-9", roles: ["reviewer"] }, src);
    expect(noGrant[0]?.canDecide).toBe(false);
  });

  it("shows the exact view a reviewer decides on", () => {
    const row = reviewsScreen(reviewer, build())[0];
    expect(row?.view.values["invoiceAmount"]).toMatchObject({ value: 9000 });
  });
});

describe("the gate, the decisions and the home screen", () => {
  it("lists what is missing for an action's go-live", () => {
    const rows = gateScreen(
      { id: "gate-1", roles: ["gate-owner"] },
      build(),
      CAPABILITY,
      ["ledger"],
      ["automaticLimit"],
    );
    expect(
      rows.some((r) => r.item.includes('source "ledger" is pending')),
    ).toBe(true);
    expect(rows.every((r) => !r.done)).toBe(true);
  });

  it("shows recorded decisions to a reviewer, and not to an approver", () => {
    const src = build();
    expect(decisionsScreen(reviewer, src)).toEqual([]);
    expect(() => decisionsScreen(approver, src)).toThrow(ConsoleError);
  });

  it("gives the home screen the alerts, reviews and changes that concern the viewer", () => {
    const src = build();
    src.alerts.raise({
      ref: "review-1",
      kind: "review.waiting",
      class: "immediate",
      assignee: "rev-1",
      openedAt: NOW.toISOString(),
      deadline: new Date(NOW.getTime() + 4 * 3600_000).toISOString(),
      explanation: "A review is waiting.",
      consequence: "It expires.",
      steps: ["Decide."],
      helpRef: "reviewers-decide",
    });
    const home = homeScreen(reviewer, src);
    expect(home.alerts).toHaveLength(1);
    expect(home.reviews).toHaveLength(1);
    expect(home.changes).toEqual([]);
    expect(home.blocked.map((b) => b.capability)).toEqual([CAPABILITY]);
  });
});
