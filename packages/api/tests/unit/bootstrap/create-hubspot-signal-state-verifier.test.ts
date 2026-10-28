import type { Signer } from "@parmana/crypto";
import type { ExecutionSystem } from "@parmana/execution-system";
import type { SignalStateVerificationRequest } from "@parmana/policy";
import { describe, expect, it, vi } from "vitest";

import {
  createHubSpotSignalStateVerifier,
  lazySignerBootstrap,
} from "../../../src/bootstrap/createHubSpotSignalStateVerifier.js";

/**
 * createHubSpotSignalStateVerifier resolves its Signer through
 * SignerBootstrap (KEY_PROVIDER), not the local key file, so the
 * verifier's own fetch is signed with the key the gateway verifies
 * against. The Signer is resolved on first use; a failure is not cached.
 */

const signer = {} as Signer;

describe("lazySignerBootstrap", () => {
  it("does not resolve until first use, then reuses the Signer", async () => {
    const create = vi.fn(async () => signer);
    const resolve = lazySignerBootstrap(create);

    expect(create).not.toHaveBeenCalled();

    await expect(resolve()).resolves.toBe(signer);
    await expect(resolve()).resolves.toBe(signer);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failed resolution instead of caching the failure", async () => {
    const create = vi
      .fn<() => Promise<Signer>>()
      .mockRejectedValueOnce(new Error("KMS unreachable"))
      .mockResolvedValueOnce(signer);
    const resolve = lazySignerBootstrap(create);

    await expect(resolve()).rejects.toThrow("KMS unreachable");
    await expect(resolve()).resolves.toBe(signer);
    expect(create).toHaveBeenCalledTimes(2);
  });
});

describe("createHubSpotSignalStateVerifier -- the deal fetch's policy", () => {
  it("signs the fetch under hubspot-deal-read, the policy bound to hubspot:deal-fetch", async () => {
    const policyNames: string[] = [];
    const deal = {
      id: "9005",
      properties: { dealstage: "appointmentscheduled", amount: "10000" },
    };
    const executionSystem = {
      async execute(request: {
        authorization: { payload: { policyName: string } };
      }) {
        policyNames.push(request.authorization.payload.policyName);
        return {
          businessTransactionId: "test",
          action: "hubspot:deal-fetch",
          target: "deals/9005",
          parameters: {},
          success: true,
          executedAt: new Date(),
          metadata: {
            connector: { responseSummary: { metadata: { deal } } },
          },
        };
      },
    } as unknown as ExecutionSystem;

    const fakeSigner = {
      async sign() {
        return "AAAA";
      },
      async getPublicKey() {
        return "";
      },
    } as unknown as Signer;

    const verifier = createHubSpotSignalStateVerifier(
      executionSystem,
      undefined,
      async () => fakeSigner,
    );

    const request: SignalStateVerificationRequest = {
      action: "hubspot:deal-update",
      businessTransactionId: "bt-policy-1",
      intentParameters: { dealId: "9005" },
      stage: "authorization",
    };

    await verifier.findViolations(request, {
      currentDealStage: "appointmentscheduled",
      dealStageChangeRequested: false,
      dealStageTransitionAllowed: true,
      amountChangeRequested: false,
      amountDeltaAbs: 0,
      amountChangeExceedsThreshold: false,
      preAuthorizedForAmountChange: false,
    });

    expect(policyNames).toEqual(["hubspot-deal-read"]);
  });
});
