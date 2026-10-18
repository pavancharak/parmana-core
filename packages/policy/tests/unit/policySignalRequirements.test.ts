import { describe, expect, it } from "vitest";

import {
  collectReferencedFacts,
  describePolicySignalRequirements,
} from "../../src/index.js";
import type { Policy } from "../../src/index.js";

const policy: Policy = {
  policyId: "example",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  signalsSchema: { amount: "number", approved: "boolean", region: "string" },
  boundSignals: { amount: "parameters.amount" },
  approvalSignals: { approved: { resourceId: "target" } },
  rules: [
    {
      id: "approve",
      condition: {
        all: [
          { fact: "approved", operator: "is_true" },
          {
            any: [
              { fact: "region", operator: "eq", value: "IN" },
              { fact: "amount", operator: "lte", value: 10 },
            ],
          },
        ],
      },
      outcome: { action: "approve" },
    },
    {
      id: "reject",
      condition: { always: true },
      outcome: { action: "reject" },
    },
  ] as Policy["rules"],
};

describe("policy signal requirements", () => {
  it("collects every fact the rules read, nested, sorted and once", () => {
    expect(collectReferencedFacts(policy)).toEqual([
      "amount",
      "approved",
      "region",
    ]);
  });

  it("describes what a request must carry and nothing of the rules", () => {
    const described = describePolicySignalRequirements(policy);

    expect(described).toEqual({
      facts: ["amount", "approved", "region"],
      schema: { amount: "number", approved: "boolean", region: "string" },
      bound: { amount: "parameters.amount" },
      approval: { approved: { resourceId: "target" } },
    });
    expect(JSON.stringify(described)).not.toMatch(/"(condition|operator)"/);
  });

  it("returns empty objects when the policy declares none", () => {
    const bare: Policy = {
      policyId: "bare",
      policyVersion: "1.0.0",
      schemaVersion: "1.0.0",
      rules: policy.rules,
    };

    expect(describePolicySignalRequirements(bare)).toEqual({
      facts: ["amount", "approved", "region"],
      schema: {},
      bound: {},
      approval: {},
    });
  });
});
