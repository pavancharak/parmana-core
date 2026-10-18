import { describe, expect, it } from "vitest";

import { PolicyValidator } from "../../src/PolicyValidator.js";
import { PolicyAction } from "../../src/types/PolicyAction.js";
import type { Policy } from "../../src/types/Policy.js";

/**
 * RFC-0023 phase 3: requireAuthorityGrant opts a policy into per-agent
 * authority. It is a boolean; anything else fails to load, so a typo
 * cannot silently leave grants unchecked.
 */

function policy(requireAuthorityGrant: unknown): Policy {
  return {
    policyId: "release-goods",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    requireAuthorityGrant: requireAuthorityGrant as boolean,
    signalsSchema: { amount: "number" },
    unboundSignalReasons: { amount: "Test only: refuses, never approves." },
    rules: [
      {
        id: "reject-large",
        condition: { fact: "amount", operator: "gt", value: 100 },
        outcome: { action: PolicyAction.REJECT, reason: "too large" },
      },
    ],
  };
}

describe("PolicyValidator: requireAuthorityGrant", () => {
  it.each([true, false, undefined])("accepts %s", (value) => {
    expect(() => new PolicyValidator().validate(policy(value))).not.toThrow();
  });

  it.each(["true", 1, null, {}])("refuses %j", (value) => {
    expect(() => new PolicyValidator().validate(policy(value))).toThrow(
      /requireAuthorityGrant must be true or false/,
    );
  });
});
