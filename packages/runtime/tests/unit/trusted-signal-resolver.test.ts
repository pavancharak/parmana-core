import { describe, expect, it } from "vitest";

import { CryptoBootstrap, TrustRecordHasher } from "@parmana/crypto";
import { PolicyAction, type Policy } from "@parmana/policy";
import { BusinessValidationStatus } from "@parmana/shared";

import {
  StaticBusinessSignalSourceRegistry,
  type BusinessSignalSource,
  type BusinessSignalSourceAnswer,
} from "../../src/business-validation/BusinessSignalSource.js";
import { TrustedSignalResolver } from "../../src/business-validation/TrustedSignalResolver.js";

const NOW = new Date("2026-10-10T12:00:00.000Z");

const POLICY: Policy = {
  policyId: "refund",
  policyVersion: "1.0.0",
  schemaVersion: "1.0.0",
  signalsSchema: { refundEligible: "boolean", eligibleAmount: "number" },
  signalSources: {
    refundEligible: {
      source: "orders-system",
      claim: "refund.eligible",
      subject: "parameters.orderId",
      maxAgeSeconds: 60,
    },
  },
  rules: [
    {
      id: "reject-ineligible",
      condition: { fact: "refundEligible", operator: "eq", value: false },
      outcome: { action: PolicyAction.REJECT, reason: "not eligible" },
    },
  ],
};

function source(
  answer:
    BusinessSignalSourceAnswer | (() => Promise<BusinessSignalSourceAnswer>),
  name = "orders-system",
): BusinessSignalSource & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    name,
    calls,
    async resolve(query) {
      calls.push(query);
      return typeof answer === "function" ? answer() : answer;
    },
  };
}

function observed(
  value: unknown,
  overrides: Partial<
    Extract<BusinessSignalSourceAnswer, { kind: "observed" }>
  > = {},
): BusinessSignalSourceAnswer {
  return {
    kind: "observed",
    value: value as never,
    sourceIdentity: "orders.example.internal",
    observedAt: new Date(NOW.getTime() - 5_000),
    ...overrides,
  };
}

function resolver(
  sources: BusinessSignalSource[] | undefined,
  timeoutMs?: number,
): TrustedSignalResolver {
  return new TrustedSignalResolver(
    sources === undefined
      ? undefined
      : new StaticBusinessSignalSourceRegistry(sources),
    {
      now: () => NOW,
      newId: () => "signal-1",
      ...(timeoutMs && { timeoutMs }),
    },
  );
}

function request(
  overrides: {
    policy?: Policy;
    parameters?: Record<string, unknown>;
    proposed?: Record<string, never>;
  } = {},
) {
  return {
    policy: overrides.policy ?? POLICY,
    action: "paytm:refund",
    businessTransactionId: "txn-1",
    intent: {
      target: "paytm://orders/ORD-1",
      parameters: overrides.parameters ?? { orderId: "ORD-1", amount: 500 },
    },
    proposedSignals: overrides.proposed ?? {},
  };
}

describe("TrustedSignalResolver", () => {
  it("is NOT_EVALUATED, never VALID, when the policy declares no sources", async () => {
    const { signalSources: _, ...noSources } = POLICY;
    const result = await resolver([]).resolve(request({ policy: noSources }));

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.NOT_EVALUATED,
    );
    expect(result.trustedValues).toEqual({});
  });

  it("asks the source about the Intent's business object, not the caller's value", async () => {
    const orders = source(observed(true));
    const result = await resolver([orders]).resolve(request());

    expect(orders.calls).toEqual([
      {
        signalKey: "refundEligible",
        claim: "refund.eligible",
        subject: "ORD-1",
        subjectPath: "parameters.orderId",
        action: "paytm:refund",
        businessTransactionId: "txn-1",
      },
    ]);
    expect(result.assessment.status).toBe(BusinessValidationStatus.VALID);
    expect(result.trustedValues).toEqual({ refundEligible: true });
  });

  it("records a trusted signal bound to the object and action, with a recomputable digest", async () => {
    const result = await resolver([
      source(observed(true, { sourceProof: "sig-from-source" })),
    ]).resolve(request());

    const [signal] = result.assessment.signals ?? [];
    expect(signal).toMatchObject({
      signalKey: "refundEligible",
      source: "orders-system",
      sourceIdentity: "orders.example.internal",
      claim: "refund.eligible",
      subject: "ORD-1",
      observedValue: true,
      action: "paytm:refund",
      businessTransactionId: "txn-1",
      verificationStatus: "VERIFIED",
    });
    // Capped by maxAgeSeconds: observed 5 s ago, valid for 60 s.
    expect(signal?.validUntil.toISOString()).toBe("2026-10-10T12:00:55.000Z");
    expect(signal?.integrityProof.sourceProof).toBe("sig-from-source");

    const { integrityProof, ...unsigned } = signal!;
    expect(integrityProof.digest).toBe(
      await new TrustRecordHasher(CryptoBootstrap.create()).hash(unsigned),
    );
  });

  it("is INVALID when the caller proposed a different value than the source reports", async () => {
    const result = await resolver([source(observed(false))]).resolve(
      request({ proposed: { refundEligible: true } as never }),
    );

    expect(result.assessment.status).toBe(BusinessValidationStatus.INVALID);
    expect(result.assessment.reason).toContain("proposed true");
    expect(result.assessment.reason).toContain("reports false");
    expect(result.trustedValues).toEqual({});
    // The established fact is still recorded.
    expect(result.assessment.signals?.[0]?.observedValue).toBe(false);
  });

  it("accepts a proposal that matches the source", async () => {
    const result = await resolver([source(observed(true))]).resolve(
      request({ proposed: { refundEligible: true } as never }),
    );

    expect(result.assessment.status).toBe(BusinessValidationStatus.VALID);
  });

  it("is MISSING_DATA when the Intent has no business object", async () => {
    const orders = source(observed(true));
    const result = await resolver([orders]).resolve(
      request({ parameters: { amount: 500 } }),
    );

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.MISSING_DATA,
    );
    expect(orders.calls).toHaveLength(0);
  });

  it("is MISSING_DATA when the source has no such fact", async () => {
    const result = await resolver([
      source({ kind: "not_found", reason: "no refund for this order" }),
    ]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.MISSING_DATA,
    );
    expect(result.assessment.reason).toContain("no refund for this order");
  });

  it("is MISSING_DATA when the source answers with the wrong type", async () => {
    const result = await resolver([source(observed("yes"))]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.MISSING_DATA,
    );
  });

  it("is CONFLICTING_DATA when the source holds contradictory facts", async () => {
    const result = await resolver([
      source({ kind: "conflicting", reason: "two open refunds" }),
    ]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.CONFLICTING_DATA,
    );
  });

  it.each([
    ["no registry at all", undefined],
    ["the source is not registered", [source(observed(true), "other")]],
  ])("is SOURCE_UNAVAILABLE when %s", async (_, sources) => {
    const result = await resolver(sources).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
  });

  it("is SOURCE_UNAVAILABLE when the source throws", async () => {
    const result = await resolver([
      source(async () => {
        throw new Error("connection refused");
      }),
    ]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
    expect(result.assessment.reason).toContain("connection refused");
  });

  it("is SOURCE_UNAVAILABLE when the source does not answer in time", async () => {
    const result = await resolver(
      [source(() => new Promise(() => undefined))],
      20,
    ).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
  });

  it.each([
    ["no identity", observed(true, { sourceIdentity: " " })],
    ["an invalid time", observed(true, { observedAt: new Date("x") })],
    [
      "a time in the future",
      observed(true, { observedAt: new Date(NOW.getTime() + 120_000) }),
    ],
  ])("is SOURCE_UNAVAILABLE for an answer with %s", async (_, answer) => {
    const result = await resolver([source(answer)]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
  });

  it("is VALIDATION_EXPIRED when the answer is older than maxAgeSeconds", async () => {
    const result = await resolver([
      source(observed(true, { observedAt: new Date(NOW.getTime() - 61_000) })),
    ]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.VALIDATION_EXPIRED,
    );
  });

  it("is VALIDATION_EXPIRED when the source says the fact no longer holds", async () => {
    const result = await resolver([
      source(observed(true, { validUntil: new Date(NOW.getTime() - 1) })),
    ]).resolve(request());

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.VALIDATION_EXPIRED,
    );
  });

  it("refuses when any one of several facts fails, and reports every failure", async () => {
    const policy: Policy = {
      ...POLICY,
      signalSources: {
        ...POLICY.signalSources,
        eligibleAmount: {
          source: "ledger",
          claim: "refund.eligible_amount",
          subject: "parameters.orderId",
        },
      },
      rules: [
        ...POLICY.rules,
        {
          id: "reject-small",
          condition: { fact: "eligibleAmount", operator: "lt", value: 1 },
          outcome: { action: PolicyAction.REJECT, reason: "nothing to refund" },
        },
      ],
    };

    const result = await resolver([
      source(observed(true)),
      source(async () => {
        throw new Error("down");
      }, "ledger"),
    ]).resolve(request({ policy }));

    expect(result.assessment.status).toBe(
      BusinessValidationStatus.SOURCE_UNAVAILABLE,
    );
    expect(result.assessment.failures?.map((f) => f.signalKey)).toEqual([
      "eligibleAmount",
    ]);
    expect(result.assessment.signals?.map((s) => s.signalKey)).toEqual([
      "refundEligible",
    ]);
    expect(result.trustedValues).toEqual({});
  });
});
