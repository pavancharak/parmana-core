import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
  ApprovalArtifactSigner,
} from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type {
  Policy,
  PolicySignals,
  SignalStateVerificationRequest,
} from "@parmana/policy";
import type { ApprovalScope, SignedApproval } from "@parmana/shared";

import { ApprovalSignalVerifier } from "../../src/ApprovalSignalVerifier.js";
import { ApprovalVerifier } from "../../src/ApprovalVerifier.js";
import { StaticApprovalIssuerRegistry } from "../../src/ApprovalIssuerRegistry.js";

const approverKeys = generateKeyPairSync("ed25519");

function setup() {
  const nonceStore = new MemoryNonceStore();
  const approvalVerifier = new ApprovalVerifier({
    crypto: APPROVAL_ARTIFACT_CRYPTO_PROVIDER,
    issuerRegistry: new StaticApprovalIssuerRegistry([
      {
        approverId: "approver-1",
        keyId: "approver-1-key-1",
        publicKey: approverKeys.publicKey,
        revoked: false,
      },
    ]),
    nonceStore,
  });

  return {
    approvalVerifier,
    nonceStore,
    verifier: new ApprovalSignalVerifier(approvalVerifier),
  };
}

async function sign(
  capability: string,
  resourceId: string,
  scope: ApprovalScope,
): Promise<PolicySignals["approvalArtifact"]> {
  const approval: SignedApproval = await new ApprovalArtifactSigner().sign(
    {
      approverId: "approver-1",
      keyId: "approver-1-key-1",
      capability,
      resourceId,
      scope,
      ttlSeconds: 900,
    },
    approverKeys.privateKey,
  );

  // Arrives over HTTP as JSON.
  return JSON.parse(JSON.stringify(approval));
}

function policy(approvalSignals?: Policy["approvalSignals"]): Policy {
  return {
    policyId: "test-policy",
    policyVersion: "1.0.0",
    schemaVersion: "1.0.0",
    ...(approvalSignals !== undefined ? { approvalSignals } : {}),
    rules: [],
  } as unknown as Policy;
}

//
// A refund: resource and amount.
//
const REFUND_POLICY = policy({
  managerApproved: {
    resourceId: "parameters.orderId",
    value: "parameters.amount",
  },
});

function refundRequest(
  overrides: Partial<SignalStateVerificationRequest> = {},
): SignalStateVerificationRequest {
  return {
    action: "paytm:refund",
    businessTransactionId: "bt-1",
    intentParameters: { orderId: "order-1", amount: 75_000 },
    stage: "authorize",
    policy: REFUND_POLICY,
    ...overrides,
  };
}

//
// A merge: the pull request is the Intent's target, no amount.
//
const MERGE_POLICY = policy({
  releaseManagerApproved: { resourceId: "target" },
});

function mergeRequest(
  overrides: Partial<SignalStateVerificationRequest> = {},
): SignalStateVerificationRequest {
  return {
    action: "github:pr-merge",
    businessTransactionId: "bt-merge-1",
    intentTarget: "acme/api#42",
    intentParameters: { mergeMethod: "squash" },
    stage: "authorize",
    policy: MERGE_POLICY,
    ...overrides,
  };
}

const REFUSED = (signalKey: string) => ({
  signalKey,
  declaredValue: true,
  actualValue: false,
});

describe("ApprovalSignalVerifier", () => {
  describe("with a value (a refund)", () => {
    it("accepts a valid approval for this action, resource and amount", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest(), {
          managerApproved: true,
          approvalArtifact: await sign("paytm:refund", "order-1", {
            field: "value",
            comparator: "lte",
            value: 75_000,
          }),
        }),
      ).toEqual([]);
    });

    it("reads the amount from the Intent, not the caller's signals", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest(), {
          managerApproved: true,
          refundAmount: 20_000,
          amount: 20_000,
          approvalArtifact: await sign("paytm:refund", "order-1", {
            field: "value",
            comparator: "lte",
            value: 20_000,
          }),
        }),
      ).toEqual([REFUSED("managerApproved")]);
    });

    it.each([
      ["another resource", "paytm:refund", "order-2"],
      ["another action", "hubspot:deal-update", "order-1"],
    ])("refuses an approval for %s", async (_name, capability, resourceId) => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest(), {
          managerApproved: true,
          approvalArtifact: await sign(capability, resourceId, {
            field: "value",
            comparator: "lte",
            value: 75_000,
          }),
        }),
      ).toEqual([REFUSED("managerApproved")]);
    });

    it.each(["amount", "resourceId", "amountDeltaAbs"])(
      'refuses an approval whose scope names "%s" instead of "value"',
      async (field) => {
        const { verifier } = setup();

        expect(
          await verifier.findViolations(refundRequest(), {
            managerApproved: true,
            approvalArtifact: await sign("paytm:refund", "order-1", {
              field,
              comparator: "lte",
              value: 75_000,
            }),
          }),
        ).toEqual([REFUSED("managerApproved")]);
      },
    );

    it("refuses when the signal is true and there is no approval", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest(), {
          managerApproved: true,
        }),
      ).toEqual([REFUSED("managerApproved")]);
    });

    it.each([
      [{ amount: 75_000 }, "parameters.orderId"],
      [{ orderId: "", amount: 75_000 }, "parameters.orderId"],
      [{ orderId: "order-1" }, "parameters.amount"],
      [{ orderId: "order-1", amount: "75000" }, "parameters.amount"],
    ])(
      "fails closed on intent parameters %j",
      async (intentParameters, path) => {
        const { verifier } = setup();

        const violations = await verifier.findViolations(
          refundRequest({ intentParameters }),
          {
            managerApproved: true,
            approvalArtifact: await sign("paytm:refund", "order-1", {
              field: "value",
              comparator: "lte",
              value: 75_000,
            }),
          },
        );

        expect(violations).toHaveLength(1);
        expect(String(violations[0].actualValue)).toContain(path);
      },
    );
  });

  describe("without a value (a merge)", () => {
    it("accepts an approval naming exactly this pull request", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(mergeRequest(), {
          releaseManagerApproved: true,
          approvalArtifact: await sign("github:pr-merge", "acme/api#42", {
            field: "resourceId",
            comparator: "eq",
            value: "acme/api#42",
          }),
        }),
      ).toEqual([]);
    });

    it("compares a number resource as its decimal string", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(
          mergeRequest({
            policy: policy({
              releaseManagerApproved: { resourceId: "parameters.pullNumber" },
            }),
            intentParameters: { pullNumber: 42 },
          }),
          {
            releaseManagerApproved: true,
            approvalArtifact: await sign("github:pr-merge", "42", {
              field: "resourceId",
              comparator: "eq",
              value: "42",
            }),
          },
        ),
      ).toEqual([]);
    });

    it("fails closed when the target is missing", async () => {
      const { verifier } = setup();

      const violations = await verifier.findViolations(
        mergeRequest({ intentTarget: undefined }),
        {
          releaseManagerApproved: true,
          approvalArtifact: await sign("github:pr-merge", "acme/api#42", {
            field: "resourceId",
            comparator: "eq",
            value: "acme/api#42",
          }),
        },
      );

      expect(violations).toHaveLength(1);
      expect(String(violations[0].actualValue)).toContain("target");
    });

    it("refuses an approval for another pull request", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(mergeRequest(), {
          releaseManagerApproved: true,
          approvalArtifact: await sign("github:pr-merge", "acme/api#43", {
            field: "resourceId",
            comparator: "eq",
            value: "acme/api#43",
          }),
        }),
      ).toEqual([REFUSED("releaseManagerApproved")]);
    });

    it("refuses an approval whose scope names another resource", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(mergeRequest(), {
          releaseManagerApproved: true,
          approvalArtifact: await sign("github:pr-merge", "acme/api#42", {
            field: "resourceId",
            comparator: "eq",
            value: "acme/api#43",
          }),
        }),
      ).toEqual([REFUSED("releaseManagerApproved")]);
    });

    it('refuses an approval whose scope names "pullRequest" instead of "resourceId"', async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(mergeRequest(), {
          releaseManagerApproved: true,
          approvalArtifact: await sign("github:pr-merge", "acme/api#42", {
            field: "pullRequest",
            comparator: "eq",
            value: "acme/api#42",
          }),
        }),
      ).toEqual([REFUSED("releaseManagerApproved")]);
    });
  });

  describe("nothing to verify", () => {
    it("ignores a declared signal that is not true", async () => {
      const { verifier, approvalVerifier } = setup();
      const spy = vi.spyOn(approvalVerifier, "verify");

      expect(
        await verifier.findViolations(refundRequest(), {
          managerApproved: false,
        }),
      ).toEqual([]);
      expect(spy).not.toHaveBeenCalled();
    });

    it("ignores a policy with no approvalSignals, even when an approval is attached", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest({ policy: policy() }), {
          approvalArtifact: await sign("paytm:refund", "order-1", {
            field: "value",
            comparator: "lte",
            value: 1,
          }),
        }),
      ).toEqual([]);
    });
  });

  describe("without the policy", () => {
    it("refuses a request that carries an approval", async () => {
      const { verifier } = setup();

      const violations = await verifier.findViolations(
        refundRequest({ policy: undefined, stage: "release" }),
        {
          managerApproved: true,
          approvalArtifact: await sign("paytm:refund", "order-1", {
            field: "value",
            comparator: "lte",
            value: 75_000,
          }),
        },
      );

      expect(violations).toHaveLength(1);
      expect(String(violations[0].actualValue)).toContain("policy");
    });

    it("has nothing to say about a request with no approval", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(refundRequest({ policy: undefined }), {
          managerApproved: false,
        }),
      ).toEqual([]);
    });
  });

  describe("single use", () => {
    it("uses the approval at authorization, accepts it again at release, and refuses it on a new request", async () => {
      const { verifier } = setup();
      const signals = {
        managerApproved: true,
        approvalArtifact: await sign("paytm:refund", "order-1", {
          field: "value",
          comparator: "lte",
          value: 75_000,
        }),
      };

      expect(await verifier.findViolations(refundRequest(), signals)).toEqual(
        [],
      );
      expect(
        await verifier.findViolations(
          refundRequest({ stage: "release" }),
          signals,
        ),
      ).toEqual([]);
      expect(
        await verifier.findViolations(
          refundRequest({ businessTransactionId: "bt-2" }),
          signals,
        ),
      ).toEqual([REFUSED("managerApproved")]);
    });

    it("does not use an approval at release", async () => {
      const { verifier } = setup();
      const signals = {
        managerApproved: true,
        approvalArtifact: await sign("paytm:refund", "order-1", {
          field: "value",
          comparator: "lte",
          value: 75_000,
        }),
      };

      await verifier.findViolations(
        refundRequest({ stage: "release" }),
        signals,
      );

      expect(await verifier.findViolations(refundRequest(), signals)).toEqual(
        [],
      );
    });

    it("still runs every other check at release: an amount above the approval is refused", async () => {
      const { verifier } = setup();

      expect(
        await verifier.findViolations(
          refundRequest({
            stage: "release",
            intentParameters: { orderId: "order-1", amount: 90_000 },
          }),
          {
            managerApproved: true,
            approvalArtifact: await sign("paytm:refund", "order-1", {
              field: "value",
              comparator: "lte",
              value: 75_000,
            }),
          },
        ),
      ).toEqual([REFUSED("managerApproved")]);
    });
  });

  describe("two approval signals in one policy", () => {
    const TWO_POLICY = policy({
      financeApproved: {
        resourceId: "parameters.orderId",
        value: "parameters.amount",
        artifact: "financeApproval",
      },
      managerApproved: {
        resourceId: "parameters.orderId",
        value: "parameters.amount",
        artifact: "managerApproval",
      },
    });

    it("accepts when each signal has its own valid approval", async () => {
      const { verifier } = setup();
      const scope = {
        field: "value",
        comparator: "lte" as const,
        value: 75_000,
      };

      expect(
        await verifier.findViolations(refundRequest({ policy: TWO_POLICY }), {
          financeApproved: true,
          managerApproved: true,
          financeApproval: await sign("paytm:refund", "order-1", scope),
          managerApproval: await sign("paytm:refund", "order-1", scope),
        }),
      ).toEqual([]);
    });

    it("uses neither approval when one of them is invalid, so the valid one can still be used", async () => {
      const { verifier } = setup();
      const scope = {
        field: "value",
        comparator: "lte" as const,
        value: 75_000,
      };
      const good = await sign("paytm:refund", "order-1", scope);

      expect(
        await verifier.findViolations(refundRequest({ policy: TWO_POLICY }), {
          financeApproved: true,
          managerApproved: true,
          financeApproval: good,
          managerApproval: await sign("paytm:refund", "order-9", scope),
        }),
      ).toEqual([REFUSED("managerApproved")]);

      expect(
        await verifier.findViolations(refundRequest({ policy: TWO_POLICY }), {
          financeApproved: true,
          managerApproved: true,
          financeApproval: good,
          managerApproval: await sign("paytm:refund", "order-1", scope),
        }),
      ).toEqual([]);
    });
  });

  it("resolves nested parameter paths", async () => {
    const { verifier } = setup();

    expect(
      await verifier.findViolations(
        refundRequest({
          policy: policy({
            managerApproved: {
              resourceId: "parameters.order.id",
              value: "parameters.order.amount",
            },
          }),
          intentParameters: { order: { id: "order-1", amount: 500 } },
        }),
        {
          managerApproved: true,
          approvalArtifact: await sign("paytm:refund", "order-1", {
            field: "value",
            comparator: "lte",
            value: 500,
          }),
        },
      ),
    ).toEqual([]);
  });

  // Found by mutation testing: how a path is resolved, and which values
  // count as a number or a resource id, could change without a test
  // failing.
  describe("resolving the resource and the amount from the Intent", () => {
    const missingResource = (path: string) => ({
      signalKey: "managerApproved",
      declaredValue: true,
      actualValue: `<missing: ${path} is required to verify an approval>`,
    });
    const missingNumber = (path: string) => ({
      signalKey: "managerApproved",
      declaredValue: true,
      actualValue: `<missing: ${path} must be a number to verify an approval>`,
    });

    const approvalFor = (resourceId: string, scope?: ApprovalScope) =>
      sign(
        "paytm:refund",
        resourceId,
        scope ?? { field: "value", comparator: "lte", value: 75_000 },
      );

    it.each([
      ["a root other than parameters", "metadata.orderId"],
      ["parameters with no field", "parameters"],
    ])("refuses a resource path with %s", async (_label, resourcePath) => {
      const { verifier } = setup();
      expect(
        await verifier.findViolations(
          refundRequest({
            policy: policy({
              managerApproved: {
                resourceId: resourcePath,
                value: "parameters.amount",
              },
            }),
            intentParameters: {
              orderId: "order-1",
              amount: 75_000,
              metadata: { orderId: "order-1" },
            },
          }),
          {
            managerApproved: true,
            approvalArtifact: await approvalFor("order-1"),
          },
        ),
      ).toEqual([missingResource(resourcePath)]);
    });

    it.each([
      ["null", null],
      ["a string", "order-1"],
    ])(
      "refuses when the path passes through %s instead of an object",
      async (_label, order) => {
        const { verifier } = setup();
        expect(
          await verifier.findViolations(
            refundRequest({
              policy: policy({
                managerApproved: {
                  resourceId: "parameters.order.id",
                  value: "parameters.amount",
                },
              }),
              intentParameters: { order, amount: 75_000 },
            }),
            {
              managerApproved: true,
              approvalArtifact: await approvalFor("order-1"),
            },
          ),
        ).toEqual([missingResource("parameters.order.id")]);
      },
    );

    it("refuses an amount that is not a finite number, even if the scope would cover it", async () => {
      const { verifier } = setup();
      expect(
        await verifier.findViolations(
          refundRequest({
            intentParameters: { orderId: "order-1", amount: Infinity },
          }),
          {
            managerApproved: true,
            approvalArtifact: await approvalFor("order-1", {
              field: "value",
              comparator: "gt",
              value: 100,
            }),
          },
        ),
      ).toEqual([missingNumber("parameters.amount")]);
    });

    it("refuses a resource id that is not a finite number", async () => {
      const { verifier } = setup();
      expect(
        await verifier.findViolations(
          refundRequest({
            intentParameters: { orderId: Infinity, amount: 75_000 },
          }),
          {
            managerApproved: true,
            approvalArtifact: await approvalFor("Infinity"),
          },
        ),
      ).toEqual([missingResource("parameters.orderId")]);
    });
  });
});
