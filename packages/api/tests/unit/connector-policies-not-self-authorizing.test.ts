import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HUBSPOT_VERIFIED_SIGNAL_KEYS } from "@parmana/connector-hubspot";
import {
  CANONICAL_CAPABILITY_POLICY_BINDINGS,
  type Policy,
  type PolicyCondition,
} from "@parmana/policy";

import { SLACK_VERIFIED_SIGNAL_KEYS } from "../../src/bootstrap/createSlackChannelSignalVerifier.js";

/**
 * G-77: no connector action that changes something can be authorized by
 * facts the caller declares alone.
 *
 * A refusal reason names the rule that refused, and the policy files are
 * public, so an agent manipulated by prompt injection can always learn
 * which fact to flip. Hiding reasons would not help. What helps is that
 * flipping a caller declared fact never authorizes a write: every approve
 * rule must require, on every path, at least one fact the caller cannot
 * fake. Those are facts declared in the policy's approvalSignals (a signed
 * approval, ApprovalSignalVerifier) and facts a server side verifier
 * checks itself for that capability. Bound facts do not count: they tie
 * a value to the Intent, they do not authorize it.
 *
 * Checked for the version in CANONICAL_CAPABILITY_POLICY_BINDINGS, which
 * is the version the next approval moves production to.
 */

/**
 * Capabilities that only read. A read changes nothing, so its policy may
 * approve on the caller's grant alone.
 */
const READ_CAPABILITIES = new Set(["hubspot:deal-fetch", "github:pr-fetch"]);

/**
 * Facts a server side verifier checks itself, per write capability.
 */
const SERVER_VERIFIED_FACTS: Readonly<Record<string, readonly string[]>> = {
  // HubSpotSignalStateVerifier: deal state from a real deal fetch, and
  // preAuthorizedForAmountChange from a signed approval.
  "hubspot:deal-update": [
    ...HUBSPOT_VERIFIED_SIGNAL_KEYS,
    "preAuthorizedForAmountChange",
  ],
  // SlackChannelSignalVerifier: the channel allowlist.
  "slack:post-message": SLACK_VERIFIED_SIGNAL_KEYS,
};

function loadPolicy(name: string, version: string): Policy {
  return JSON.parse(
    readFileSync(
      path.resolve(
        import.meta.dirname,
        "../../../../policies",
        name,
        version,
        "policy.json",
      ),
      "utf8",
    ),
  ) as Policy;
}

/**
 * True when the condition cannot hold without at least one trusted fact:
 * a trusted fact itself, an `all` with such a child, or an `any` whose
 * every branch has one.
 */
function requiresTrustedFact(
  condition: PolicyCondition,
  trusted: ReadonlySet<string>,
): boolean {
  if ("fact" in condition) {
    return trusted.has(condition.fact);
  }

  if ("all" in condition) {
    return condition.all.some((child) => requiresTrustedFact(child, trusted));
  }

  if ("any" in condition) {
    return condition.any.every((child) => requiresTrustedFact(child, trusted));
  }

  return false;
}

/**
 * Approve rules that caller declared facts alone can satisfy.
 */
function selfAuthorizingRules(
  policy: Policy,
  capability: string,
): readonly string[] {
  const trusted = new Set([
    ...Object.keys(policy.approvalSignals ?? {}),
    ...(SERVER_VERIFIED_FACTS[capability] ?? []),
  ]);

  return policy.rules
    .filter((rule) => rule.outcome.action === "approve")
    .filter((rule) => !requiresTrustedFact(rule.condition, trusted))
    .map((rule) => rule.id);
}

describe("connector policies cannot be satisfied by caller declared facts alone (G-77)", () => {
  // A new capability lands in this list and fails it until someone
  // decides whether it is a read or a write.
  it("classifies every bound capability as a read or a write", () => {
    const writes = [...CANONICAL_CAPABILITY_POLICY_BINDINGS.keys()].filter(
      (capability) => !READ_CAPABILITIES.has(capability),
    );

    expect(writes.sort()).toEqual([
      "github:pr-merge",
      "hubspot:deal-update",
      "paytm:refund",
      "slack:post-message",
    ]);
  });

  for (const [capability, reference] of CANONICAL_CAPABILITY_POLICY_BINDINGS) {
    if (READ_CAPABILITIES.has(capability)) {
      continue;
    }

    it(`${capability}: every approve rule of ${reference.name} ${reference.version} needs a fact the caller cannot fake`, () => {
      const policy = loadPolicy(reference.name, reference.version);

      expect(selfAuthorizingRules(policy, capability)).toEqual([]);
    });
  }

  it("has teeth: it flags the versions before the 2026-09-28 fixes", () => {
    expect(
      selfAuthorizingRules(
        loadPolicy("customer-refund", "1.1.0"),
        "paytm:refund",
      ),
    ).toEqual(["approve-refund-automatic"]);

    expect(
      selfAuthorizingRules(
        loadPolicy("github-pr-approval", "1.0.0"),
        "github:pr-merge",
      ),
    ).toEqual(["approve-pull-request"]);

    // Without the server's channel check, the Slack policy would be flagged.
    const slack = loadPolicy("slack-post-message", "1.0.0");
    expect(
      slack.rules
        .filter((rule) => rule.outcome.action === "approve")
        .filter(
          (rule) =>
            !requiresTrustedFact(
              rule.condition,
              new Set(Object.keys(slack.approvalSignals ?? {})),
            ),
        )
        .map((rule) => rule.id),
    ).toEqual(["approve-post"]);
  });
});
