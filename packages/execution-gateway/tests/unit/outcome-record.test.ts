import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import { AuthorizationSigner, CryptoBootstrap } from "@parmana/crypto";
import { markReleaseRefusal } from "@parmana/execution-control";
import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  ConnectorNotRegisteredError,
  OutcomeUnknownError,
  ReleaseNotDispatchedError,
  type ExecutableContent,
  type ExecutionResult,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import {
  ExecutionGateway,
  MemoryExecutionOutcomeStore,
} from "../../src/index.js";

/**
 * The outcome-record defect (enforcement-path guide, section 11). A release
 * refused before the connector ran must not leave its row in flight, so a
 * retry is not reported as "outcome unknown".
 */

const crypto = CryptoBootstrap.create();

const CONTENT: ExecutableContent = {
  businessTransactionId: "txn-outcome-1",
  action: "erp:create-invoice",
  target: "customer-42",
  parameters: { amount: 1200 },
};

const SUCCESS: ExecutionResult = {
  businessTransactionId: CONTENT.businessTransactionId,
  action: CONTENT.action,
  target: CONTENT.target,
  parameters: CONTENT.parameters,
  success: true,
  executedAt: new Date(),
  metadata: {},
};

async function sign(
  privateKey: ReturnType<typeof generateKeyPairSync>["privateKey"],
): Promise<SignedExecutionAuthorization> {
  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: "decision-outcome-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: CONTENT.businessTransactionId,
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: CONTENT,
    },
    privateKey,
    "key-1",
    60,
  );
}

function request(
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: CONTENT.businessTransactionId,
    action: CONTENT.action,
    target: CONTENT.target,
    parameters: CONTENT.parameters,
    authorization,
  };
}

/** A service that throws, or succeeds, on each call, and counts the calls. */
function scriptedService(...steps: Array<() => Promise<ExecutionResult>>) {
  let calls = 0;

  return {
    get calls() {
      return calls;
    },
    service: {
      async execute() {
        const step = steps[Math.min(calls, steps.length - 1)]!;

        calls += 1;

        return step();
      },
    },
  };
}

function gatewayFor(
  publicKey: ReturnType<typeof generateKeyPairSync>["publicKey"],
  service: { execute: (...args: never[]) => Promise<ExecutionResult> },
  store = new MemoryExecutionOutcomeStore(),
) {
  return new ExecutionGateway({
    // Legacy fixture: predates fail-closed policy binding. The outcome
    // behaviour under test does not depend on policy binding.
    allowUnverifiedPolicy: true,
    publicKey,
    nonceStore: new MemoryNonceStore(),
    executionOutcomeStore: store,
    executionControl: {
      service: service as never,
      route: () => "connector-a",
    },
  });
}

describe("outcome record for a release refused before dispatch", () => {
  it("a refusal after the nonce was consumed is recorded as failed, and a retry is refused with the reason", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const refusal = new ConnectorNotRegisteredError(CONTENT.action);
    const scripted = scriptedService(async () => {
      markReleaseRefusal(refusal, true);
      throw refusal;
    });
    const gateway = gatewayFor(publicKey, scripted.service);

    // The first call throws the same error it always did.
    const first = gateway.execute(request(authorization));
    await expect(first).rejects.toBe(refusal);

    // A retry is refused with the recorded reason, and the service is not called again.
    const retry = gateway.execute(request(authorization));
    await expect(retry).rejects.toBeInstanceOf(ReleaseNotDispatchedError);
    await expect(retry).rejects.toThrow(refusal.message);
    expect(scripted.calls).toBe(1);
  });

  it("a verifier refusal before the nonce was consumed leaves no row, so a corrected retry is released", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const store = new MemoryExecutionOutcomeStore();
    const refusal = new Error(
      "Execution Control refused release: authorization did not verify.",
    );
    const scripted = scriptedService(
      async () => {
        markReleaseRefusal(refusal, false);
        throw refusal;
      },
      async () => SUCCESS,
    );
    const gateway = gatewayFor(publicKey, scripted.service, store);

    await expect(gateway.execute(request(authorization))).rejects.toBe(refusal);
    expect(await store.get(authorization.payload.nonce)).toBeUndefined();

    // The row was removed, so the retry runs the release again and succeeds.
    await expect(gateway.execute(request(authorization))).resolves.toEqual(
      SUCCESS,
    );
    expect(scripted.calls).toBe(2);
  });

  it("an error from the connector itself is not recorded as a refusal, so the row stays in flight and a retry is unknown", async () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const authorization = await sign(privateKey);
    const store = new MemoryExecutionOutcomeStore();
    const scripted = scriptedService(async () => {
      throw new Error("connector timed out after the request was sent");
    });
    const gateway = gatewayFor(publicKey, scripted.service, store);

    await expect(gateway.execute(request(authorization))).rejects.toThrow(
      "connector timed out",
    );
    expect(await store.get(authorization.payload.nonce)).toEqual({
      status: "in_flight",
    });

    await expect(
      gateway.execute(request(authorization)),
    ).rejects.toBeInstanceOf(OutcomeUnknownError);
    expect(scripted.calls).toBe(1);
  });
});
