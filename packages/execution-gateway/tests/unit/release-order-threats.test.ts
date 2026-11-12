import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  ConnectorNotRegisteredError,
  type ExecutableContent,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import {
  ExecutionGateway,
  MemoryExecutionOutcomeStore,
} from "../../src/index.js";

/**
 * Threat test for the release order (docs/internal/designs/RELEASE-CHECK-ORDER.md).
 * A forged request for an unregistered action must be refused by the gateway's own
 * verification, before it reaches the execution-control service, and must not use its nonce.
 */

const crypto = CryptoBootstrap.create();

const content: ExecutableContent = {
  businessTransactionId: "txn-forged-1",
  action: "NotRegistered",
  target: "customer-1",
  parameters: {},
};

async function sign(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-forged-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: content,
    },
    privateKey,
    "key-1",
    60,
  );
}

describe("release order threats: gateway", () => {
  it("a forged request for an unregistered action is refused before the execution-control service, and its nonce stays unused", async () => {
    const trusted = generateKeyPairSync("ed25519");
    const forger = generateKeyPairSync("ed25519");
    const authorization = await sign(forger.privateKey);
    const nonceStore = new MemoryNonceStore();
    const service = { execute: vi.fn() };

    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding. The behaviour under test does not depend on it.
      allowUnverifiedPolicy: true,
      publicKey: trusted.publicKey,
      nonceStore,
      executionOutcomeStore: new MemoryExecutionOutcomeStore(),
      executionControl: { service: service as never, route: () => "none" },
    });

    const request = {
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
      authorization,
    } as ExecutionRequest;

    const failure = gateway.execute(request);
    await expect(failure).rejects.toThrow();
    await expect(failure).rejects.not.toBeInstanceOf(
      ConnectorNotRegisteredError,
    );
    expect(service.execute).not.toHaveBeenCalled();

    // The forged request did not consume the nonce.
    expect(
      await nonceStore.checkAndRecord(
        authorization.payload.nonce,
        authorization.payload.expiresAt,
      ),
    ).toBe(true);
  });
});
