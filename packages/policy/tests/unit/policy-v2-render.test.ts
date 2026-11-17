import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { AlertBoard } from "../../src/v2/alerts.js";
import {
  ConsoleError,
  type ConsoleSources,
  type Viewer,
} from "../../src/v2/console.js";
import { EvidenceLog } from "../../src/v2/evidence.js";
import { escapeHtml, renderScreen } from "../../src/v2/render.js";
import { PolicyRegister, type Person } from "../../src/v2/register.js";
import { ReviewQueue } from "../../src/v2/review.js";

/** Tests for the console rendering (governance design, sections 3 and 6). */

const NOW = new Date("2026-11-18T09:00:00.000Z");
const CAPABILITY = "erp:pay-invoice";
const PEM = generateKeyPairSync("ed25519")
  .publicKey.export({ type: "spki", format: "pem" })
  .toString();

const sourceOwner: Person = { id: "src-owner", roles: ["source-owner"] };
const parmana: Person = { id: "parmana-1", roles: ["parmana-owner"] };

const auditor: Viewer = { id: "aud-1", roles: ["auditor"] };
const reviewer: Viewer = { id: "rev-1", roles: ["reviewer"] };
const nobody: Viewer = { id: "anyone", roles: [] };

function sources(): ConsoleSources {
  const register = new PolicyRegister(() => NOW);
  register.proposeSource(
    {
      name: "ledger",
      dataOwner: "Finance & Co",
      signer: { kind: "system" },
      keyId: "k",
      publicKeyPem: PEM,
      claims: { "funds.available": "" },
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
  const reviews = new ReviewQueue(() => NOW);
  reviews.grant("parmana-1", {
    reviewerId: "rev-1",
    capability: CAPABILITY,
    maxAmount: 50_000,
  });
  reviews.open({
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
      values: {},
      missing: [],
      callerReason: "Due.",
    },
    highValue: false,
    amount: 9000,
    windowBusinessDays: 1,
  });
  const alerts = new AlertBoard(
    () => NOW,
    () => true,
  );
  alerts.raise({
    ref: "review-1",
    kind: "review.waiting",
    class: "immediate",
    assignee: "rev-1",
    openedAt: NOW.toISOString(),
    deadline: new Date(NOW.getTime() + 4 * 3600_000).toISOString(),
    explanation: "A payment <b>is</b> waiting for your decision.",
    consequence: "It expires and is refused.",
    steps: ["Read the request.", "Decide."],
    helpRef: "reviewers-decide",
  });
  return {
    register,
    reviews,
    alerts,
    evidence: new EvidenceLog(),
    audit: () => [],
  };
}

describe("access", () => {
  it("renders no screen for a viewer with no role, and renders nothing for a screen they may not open", () => {
    const src = sources();
    expect(() => renderScreen("home", nobody, src)).toThrow(ConsoleError);
    expect(() => renderScreen("audit", reviewer, src)).toThrow(ConsoleError);
    expect(() => renderScreen("approvals", reviewer, src)).toThrow(
      ConsoleError,
    );
  });
});

describe("alerts on every screen", () => {
  it("shows an open alert in full, with its next step, and no way to close it", () => {
    const html = renderScreen("home", reviewer, sources());
    expect(html).toContain("review.waiting");
    expect(html).toContain("Read the request.");
    expect(html).toContain("step 1 of 2");
    expect(html).not.toMatch(/dismiss|snooze|close alert|mark as read/i);
  });

  it("shows the same alert on every screen the viewer may open", () => {
    const src = sources();
    expect(renderScreen("reviews", reviewer, src)).toContain("review.waiting");
  });

  it("escapes the alert's text, so markup in a reason cannot run", () => {
    const html = renderScreen("home", reviewer, sources());
    expect(html).not.toContain("<b>is</b>");
    expect(html).toContain("&lt;b&gt;is&lt;/b&gt;");
  });
});

describe("the screens", () => {
  it("renders the review queue with a flag for each item", () => {
    const html = renderScreen("reviews", reviewer, sources());
    expect(html).toContain("INV-1001");
    expect(html).toContain("<td>yes</td>");
  });

  it("renders the register for an auditor, read only, with no action buttons anywhere", () => {
    const html = renderScreen("register", auditor, sources());
    expect(html).toContain("ledger");
    expect(html).not.toMatch(/<button|<form|<input/i);
  });

  it("renders the go-live checklist for an action, given its capability", () => {
    const html = renderScreen("gate", auditor, sources(), {
      capability: CAPABILITY,
      usedSources: ["ledger"],
      usedThresholds: [],
    });
    expect(html).toContain("source &quot;ledger&quot; is pending");
  });

  it("refuses the go-live checklist without a capability, rather than guessing", () => {
    expect(() => renderScreen("gate", auditor, sources())).toThrow(
      /capability/,
    );
  });

  it("produces a complete HTML page", () => {
    const html = renderScreen("register", auditor, sources());
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<title>Register</title>");
  });
});

describe("escaping", () => {
  it("escapes the characters that can break out of HTML", () => {
    expect(escapeHtml(`<script>"x" & 'y'</script>`)).toBe(
      "&lt;script&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/script&gt;",
    );
  });

  it("escapes a value supplied in a register entry", () => {
    const html = renderScreen("register", auditor, sources());
    expect(html).toContain("Finance &amp; Co");
    expect(html).not.toContain("Finance & Co");
  });
});
