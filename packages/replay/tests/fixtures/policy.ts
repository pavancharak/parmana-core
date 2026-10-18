export const TEST_POLICY = {
  policyId: "replay-policy",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",

  signalsSchema: {
    riskScore: "number",
  },

  rules: [
    {
      id: "approve-low-risk",

      condition: {
        fact: "riskScore",
        operator: "lte",
        value: 50,
      },

      outcome: {
        action: "approve",
        reason: "Risk score is acceptable.",
      },
    },

    {
      id: "reject-high-risk",

      condition: {
        fact: "riskScore",
        operator: "gt",
        value: 50,
      },

      outcome: {
        action: "reject",
        reason: "Risk score exceeds threshold.",
      },
    },

    {
      id: "reject-default",

      condition: {
        always: true,
      },

      outcome: {
        action: "reject",
        reason: "No policy rule matched.",
      },
    },
  ],
} as const;
