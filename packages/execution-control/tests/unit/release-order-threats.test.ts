import { describe, expect, it, vi } from "vitest";

import {
  NonceAlreadyConsumedError,
  type ExecutableContent,
} from "@parmana/shared";

import { ExecutionControlService } from "../../src/index.js";

/**
 * Threat tests for reordering the release checks (docs/internal/designs/RELEASE-CHECK-ORDER.md).
 * These pin properties that must hold under the current order and under the proposed
 * order (authentication, lookup, verifier). They must keep passing across the reorder.
 */

const content: ExecutableContent = {
  businessTransactionId: "txn-threat-1",
  action: "NotRegistered",
  target: "stripe/account/1",
  parameters: {},
};

function release() {
  return {
    authorization: {
      payload: { authorizationId: "auth-threat-1", nonce: "nonce-threat-1" },
    } as never,
    executableContent: content,
    verifiedTransaction: {
      authorizationVerified: true,
      executableContentVerified: true,
      replayCheckPassed: true,
    },
    executionTimestamp: new Date().toISOString(),
  };
}

function serviceWith(options: {
  authenticates: boolean;
  verifyRelease: () => Promise<void>;
}) {
  const registry = {
    // Registered, so a release reaches the verifier. The unregistered case is its own test.
    resolveCapability: vi.fn(async () => ({ connectorId: "stripe" })),
  };
  const sessions = { create: vi.fn() };
  const service = new ExecutionControlService({
    verifyRelease: options.verifyRelease,
    gatewayIdentity: {} as never,
    authenticator: {
      authenticateGateway: () => options.authenticates,
    } as never,
    registry: registry as never,
    sessions: sessions as never,
    audit: { record: vi.fn() } as never,
    sessionIssuanceAuthentication: {},
  });
  return { service, registry, sessions };
}

describe("release order threats", () => {
  it("an unauthenticated caller never reaches the connector lookup, so it learns nothing about registrations", async () => {
    const { service, registry } = serviceWith({
      authenticates: false,
      verifyRelease: async () => {},
    });

    await expect(service.execute(release() as never, {})).rejects.toThrow(
      "rejected unauthenticated Gateway",
    );
    expect(registry.resolveCapability).not.toHaveBeenCalled();
  });

  it("a release the verifier refuses creates no session and calls no connector", async () => {
    const { service, registry, sessions } = serviceWith({
      authenticates: true,
      verifyRelease: async () => {
        throw new Error(
          "Execution Control refused release: authorization did not verify.",
        );
      },
    });

    await expect(service.execute(release() as never, {})).rejects.toThrow(
      "did not verify",
    );
    expect(sessions.create).not.toHaveBeenCalled();
  });

  it("a refusal for an unregistered action does not spend the authorization, so a corrected registration releases it", async () => {
    const executed: string[] = [];
    const connector = {
      connectorId: "stripe",
      execute: async (request: { executableContent: ExecutableContent }) => {
        executed.push(request.executableContent.businessTransactionId);

        return {
          ...request.executableContent,
          success: true,
          executedAt: new Date(),
          metadata: {},
        };
      },
    };
    const registry = {
      resolveCapability: vi
        .fn()
        .mockRejectedValueOnce(
          new Error("No connector registered for action: NotRegistered."),
        )
        .mockResolvedValue(connector),
    };
    // A stateful verifier, as the real one is: it consumes the nonce, and refuses it once consumed.
    const consumed = new Set<string>();
    const service = new ExecutionControlService({
      verifyRelease: async (release) => {
        const nonce = release.authorization.payload.nonce;

        if (consumed.has(nonce)) {
          throw new NonceAlreadyConsumedError(
            release.executableContent.businessTransactionId,
          );
        }

        consumed.add(nonce);
      },
      gatewayIdentity: {} as never,
      authenticator: { authenticateGateway: () => true } as never,
      registry: registry as never,
      sessions: { create: () => ({ sessionId: "s-1" }) } as never,
      audit: { record: async () => {} } as never,
      sessionIssuanceAuthentication: {},
    });

    await expect(service.execute(release() as never, {})).rejects.toThrow(
      "No connector registered",
    );

    // The same authorization, now that the action is registered.
    const result = await service.execute(release() as never, {});
    expect(result.success).toBe(true);
    expect(executed).toEqual([content.businessTransactionId]);
  });
});
