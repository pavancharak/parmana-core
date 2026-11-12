import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  AuthorizationVerificationFailedError,
  type ExecutableContent,
} from "@parmana/shared";

import {
  ExecutionGateway,
  MemoryExecutionOutcomeStore,
} from "../../src/index.js";

/**
 * A forged authorization is the caller's error. The gateway must say it is a
 * verification failure (403 at the API), and name the failed check.
 */

const crypto = CryptoBootstrap.create();

const content: ExecutableContent = {
  businessTransactionId: "txn-status-1",
  action: "erp:create-invoice",
  target: "customer-1",
  parameters: {},
};

describe("forged authorization is a verification failure, not a server fault", () => {
  it("refuses with AuthorizationVerificationFailedError naming the failed check", async () => {
    const trusted = generateKeyPairSync("ed25519");
    const forger = generateKeyPairSync("ed25519");
    const authorization = await new AuthorizationSigner(crypto).sign(
      {
        decisionId: "decision-status-1",
        decisionOutcome: "APPROVED",
        businessTransactionId: content.businessTransactionId,
        policyName: "policy-a",
        policyVersion: "1.0.0",
        executableContent: content,
      },
      forger.privateKey,
      "key-1",
      60,
    );
    const service = { execute: vi.fn() };
    const gateway = new ExecutionGateway({
      // Legacy fixture: predates fail-closed policy binding. The status under test does not depend on it.
      allowUnverifiedPolicy: true,
      publicKey: trusted.publicKey,
      nonceStore: new MemoryNonceStore(),
      executionOutcomeStore: new MemoryExecutionOutcomeStore(),
      executionControl: { service: service as never, route: () => "none" },
    });

    const attempt = gateway.execute({
      businessTransactionId: content.businessTransactionId,
      action: content.action,
      target: content.target,
      parameters: content.parameters,
      authorization,
    } as ExecutionRequest);

    await expect(attempt).rejects.toBeInstanceOf(
      AuthorizationVerificationFailedError,
    );
    await expect(attempt).rejects.toThrow("failed checks");
    expect(service.execute).not.toHaveBeenCalled();
  });
});
