interface PolicyLike {
  readonly policyId?: string;
  readonly policyVersion?: string;
  readonly schemaVersion?: string;
  readonly signalsSchema?: Record<string, string>;
  readonly rules?: readonly unknown[];
}

export function normalizePolicy(policy: PolicyLike | null | undefined): {
  readonly policyId: string;
  readonly policyVersion: string;
  readonly schemaVersion: string;
  readonly signalsSchema: Record<string, string>;
  readonly rules: unknown[];
} {
  return {
    policyId: policy?.policyId ?? "replay-policy",

    policyVersion: policy?.policyVersion ?? "1.0.0",

    schemaVersion: policy?.schemaVersion ?? "1.0.0",

    signalsSchema: policy?.signalsSchema ?? {},

    rules: Array.isArray(policy?.rules) ? [...policy.rules] : [],
  };
}
