import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  ExecutableContentHasher,
} from "@parmana/crypto";

import { MemoryNonceStore } from "@parmana/envelope-verifier";

import { isMlDsa65Supported, ML_DSA_65_SKIP_REASON } from "@parmana/crypto";

import type { ExecutionRequest } from "@parmana/execution-system";

import {
  NonceAlreadyConsumedError,
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import type { Connector, ConnectorRequest } from "../../src/index.js";
import { ExecutionGateway } from "../../src/index.js";

/**
 * Duplicate of execution-gateway.test.ts's cases, run under
 * SIGNATURE_PROVIDER=dilithium3 instead of the default ed25519,
 * to prove the Gateway is algorithm-agnostic (R6) — same
 * pattern as packages/envelope-verifier/test/envelope-verifier.dilithium3.test.ts
 * (see that file's comment for why this is a full duplicate
 * rather than a parametrized describe.each: CryptoBootstrap
 * caches its provider per module registry, and Vitest isolates
 * each test file into its own registry by default).
 */
process.env.PRIMARY_SIGNATURE_PROVIDER = "dilithium3";

const crypto = CryptoBootstrap.create();
const contentHasher = new ExecutableContentHasher(crypto);

function generateKeyPair() {
  return generateKeyPairSync("ml-dsa-65");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

class RecordingConnector implements Connector {
  public lastRequest?: ConnectorRequest;

  async execute(request: ConnectorRequest): Promise<ExecutionResult> {
    this.lastRequest = request;

    return {
      businessTransactionId: request.transaction.businessTransactionId,
      action: request.transaction.action,
      target: request.transaction.target,
      parameters: request.transaction.parameters,
      success: true,
      executedAt: new Date(),
      metadata: {},
    };
  }
}

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  executableContent: ExecutableContent = SAMPLE_EXECUTABLE_CONTENT,
  ttlSeconds = 60,
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: executableContent.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent,
    },
    privateKey,
    "key-1",
    ttlSeconds,
  );
}

function buildRequest(
  content: ExecutableContent,
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  };
}

describe.skipIf(!isMlDsa65Supported())(
  `ExecutionGateway (dilithium3)${isMlDsa65Supported() ? "" : ` [SKIPPED: ${ML_DSA_65_SKIP_REASON}]`}`,
  () => {
    it("releases a valid request to the connector", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      expect(authorization.algorithm).toBe("dilithium3");

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(SAMPLE_EXECUTABLE_CONTENT, authorization);
      const executionResult = await gateway.execute(request);

      expect(executionResult.success).toBe(true);
      expect(connector.lastRequest).toBeDefined();
      expect(connector.lastRequest?.verification.valid).toBe(true);

      const forwardedContent = connector.lastRequest!.transaction;
      const recomputedHash = await contentHasher.hash(forwardedContent);

      expect(recomputedHash).toBe(
        authorization.payload.businessTransactionHash,
      );

      expect(Object.isFrozen(forwardedContent)).toBe(true);
      expect(Object.isFrozen(forwardedContent.parameters)).toBe(true);
    });

    it("rejects a modified amount — hash mismatch names both hashes", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const modifiedAmount: ExecutableContent = {
        ...SAMPLE_EXECUTABLE_CONTENT,
        parameters: { amount: 999 },
      };

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(modifiedAmount, authorization);

      await expect(gateway.execute(request)).rejects.toThrow(
        /businessTransactionHash mismatch/,
      );
      expect(connector.lastRequest).toBeUndefined();

      const { result } = await gateway.verify(request);

      expect(result.valid).toBe(false);
      expect(result.checks.businessTransactionHashMatches).toBe(false);
      expect(result.hashMismatch).toBeDefined();
      expect(result.hashMismatch?.expected).not.toBe(
        result.hashMismatch?.actual,
      );
    });

    it("rejects a modified recipient (target)", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const modifiedTarget: ExecutableContent = {
        ...SAMPLE_EXECUTABLE_CONTENT,
        target: "account/99999",
      };

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(modifiedTarget, authorization);

      await expect(gateway.execute(request)).rejects.toThrow(
        /businessTransactionHash mismatch/,
      );
      expect(connector.lastRequest).toBeUndefined();
    });

    it("rejects the same businessTransactionId carrying entirely different content", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const differentContent: ExecutableContent = {
        businessTransactionId: SAMPLE_EXECUTABLE_CONTENT.businessTransactionId,
        action: "DeployApplication",
        target: "service/payment-api",
        parameters: { version: "2.0.0" },
      };

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(differentContent, authorization);

      await expect(gateway.execute(request)).rejects.toThrow(
        /businessTransactionHash mismatch/,
      );
      expect(connector.lastRequest).toBeUndefined();
    });

    it("rejects a replayed request without releasing it twice, as a distinguishable NonceAlreadyConsumedError (409)", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const connector = new RecordingConnector();
      const nonceStore = new MemoryNonceStore();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore,
        connector,
      });

      const request = buildRequest(SAMPLE_EXECUTABLE_CONTENT, authorization);

      const first = await gateway.execute(request);
      expect(first.success).toBe(true);

      let caught: unknown;

      try {
        await gateway.execute(request);
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(NonceAlreadyConsumedError);
      expect((caught as NonceAlreadyConsumedError).status).toBe(409);
      expect((caught as NonceAlreadyConsumedError).code).toBe(
        "NONCE_ALREADY_CONSUMED",
      );
    });

    it("rejects an expired authorization", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(
        privateKey,
        SAMPLE_EXECUTABLE_CONTENT,
        60,
      );

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(SAMPLE_EXECUTABLE_CONTENT, authorization);

      const farFuture = new Date(
        Date.parse(authorization.payload.authorizedAt) + 120_000,
      );

      const { result } = await gateway.verify(request, farFuture);

      expect(result.valid).toBe(false);
      expect(result.checks.notExpired).toBe(false);
      expect(result.checks.nonceUnseen).toBe(false);
    });

    it("rejects a tampered signature", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const tampered: SignedExecutionAuthorization = {
        ...authorization,
        payload: {
          ...authorization.payload,
          decisionId: "decision-2",
          decisionOutcome: "APPROVED",
        },
      };

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(SAMPLE_EXECUTABLE_CONTENT, tampered);

      await expect(gateway.execute(request)).rejects.toThrow(
        /signatureVerified/,
      );
      expect(connector.lastRequest).toBeUndefined();
    });

    it("rejects an unknown payload version", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const tampered = {
        ...authorization,
        payload: {
          ...authorization.payload,
          version: 2,
        },
      } as unknown as SignedExecutionAuthorization;

      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore: new MemoryNonceStore(),
        connector,
      });

      const request = buildRequest(SAMPLE_EXECUTABLE_CONTENT, tampered);

      await expect(gateway.execute(request)).rejects.toThrow(
        /versionSupported/,
      );
      expect(connector.lastRequest).toBeUndefined();

      const { result } = await gateway.verify(request);
      expect(result.checks.versionSupported).toBe(false);
      expect(result.checks.signatureVerified).toBe(false);
    });

    it("a rejected verification never consumes the nonce", async () => {
      const { privateKey, publicKey } = generateKeyPair();
      const authorization = await signAuthorization(privateKey);

      const modifiedAmount: ExecutableContent = {
        ...SAMPLE_EXECUTABLE_CONTENT,
        parameters: { amount: 999 },
      };

      const nonceStore = new MemoryNonceStore();
      const connector = new RecordingConnector();
      const gateway = new ExecutionGateway({
        // Legacy fixture: predates fail-closed policy binding.
        allowUnverifiedPolicy: true,
        publicKey,
        nonceStore,
        connector,
      });

      const tamperedRequest = buildRequest(modifiedAmount, authorization);

      await expect(gateway.execute(tamperedRequest)).rejects.toThrow();

      const originalRequest = buildRequest(
        SAMPLE_EXECUTABLE_CONTENT,
        authorization,
      );

      const result = await gateway.execute(originalRequest);
      expect(result.success).toBe(true);
      expect(connector.lastRequest?.verification.valid).toBe(true);
    });
  },
);
