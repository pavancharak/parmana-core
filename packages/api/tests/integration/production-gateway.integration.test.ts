import { readFileSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  TrustRecordHasher,
} from "@parmana/crypto";
import type { ExecutionRequest } from "@parmana/execution-system";
import {
  ConnectorNotRegisteredError,
  type ExecutableContent,
  type SignedExecutionAuthorization,
} from "@parmana/shared";

import { createApplication, policyRepository } from "../../src/application.js";
import { createExecutionGateway } from "../../src/bootstrap/createExecutionGateway.js";
import { DEFAULT_VERIFIER_KEY_ID } from "../../src/bootstrap/verifierKeyId.js";

/**
 * End to end through the production gateway factory (createExecutionGateway),
 * not a hand-built gateway. Real production signer keys, real policy file,
 * real policy-hash binding, and the production execution-control service.
 *
 * The one thing it cannot do is release to a connector: the production
 * registry resolves connectors only from registrations, and no test-mode
 * registration is available through the factory. Releases therefore end at
 * the connector lookup, which is the refusal these tests assert.
 */

const POLICY_NAME = "access-control";
const POLICY_VERSION = "1.0.0";
const CAPABILITY = "erp:create-invoice";

const crypto = CryptoBootstrap.create();
const hasher = new TrustRecordHasher(crypto);

function contentFor(capability: string): ExecutableContent {
  return {
    businessTransactionId: `txn-prod-${capability}-${Math.random()}`,
    action: capability,
    target: "customer-42",
    parameters: { amount: 1200, currency: "INR" },
  };
}

async function policyHash(): Promise<string> {
  const policy = await policyRepository.load(POLICY_NAME, POLICY_VERSION);

  return hasher.hash(policy);
}

/**
 * Signed with the production default key, the key RuntimeAuthorizationSigner
 * resolves for a request with no tenant (FileTenantKeyResolver).
 */
async function signWithRuntimeKey(
  content: ExecutableContent,
): Promise<SignedExecutionAuthorization> {
  return signWithFileKey(content, "default");
}

async function signWithFileKey(
  content: ExecutableContent,
  keyId: string,
): Promise<SignedExecutionAuthorization> {
  const privateKey = createPrivateKey(
    readFileSync(join(process.env.PARMANA_KEY_DIR!, `${keyId}.private.pem`)),
  );

  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: `decision-${content.businessTransactionId}`,
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: POLICY_NAME,
      policyVersion: POLICY_VERSION,
      policyContentHash: await policyHash(),
      signalsHash: await hasher.hash({}),
      executableContent: content,
    },
    privateKey,
    keyId,
    60,
  );
}

/** Signed with the verifier key, the key G-111 scopes to read capabilities. */
async function signWithVerifierKey(
  content: ExecutableContent,
): Promise<SignedExecutionAuthorization> {
  const keyDir = process.env.PARMANA_KEY_DIR!;
  const privateKey = createPrivateKey(
    readFileSync(join(keyDir, `${DEFAULT_VERIFIER_KEY_ID}.private.pem`)),
  );

  return new AuthorizationSigner(crypto).sign(
    {
      decisionId: `decision-${content.businessTransactionId}`,
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: POLICY_NAME,
      policyVersion: POLICY_VERSION,
      policyContentHash: await policyHash(),
      signalsHash: await hasher.hash({}),
      executableContent: content,
    },
    privateKey,
    DEFAULT_VERIFIER_KEY_ID,
    60,
  );
}

function requestFor(
  content: ExecutableContent,
  authorization: SignedExecutionAuthorization,
): ExecutionRequest {
  return {
    businessTransactionId: content.businessTransactionId,
    action: content.action,
    target: content.target,
    parameters: content.parameters,
    authorization,
  } as ExecutionRequest;
}

describe("production gateway, end to end", () => {
  beforeAll(() => {
    // Production binds the signal verifier here (application.ts, G-31). The
    // gateway refuses every release until it is bound, so bind it first.
    createApplication();
  });

  it("verifies a runtime-signed authorization against the real policy hash", async () => {
    const gateway = await createExecutionGateway();
    const content = contentFor(CAPABILITY);
    const authorization = await signWithRuntimeKey(content);

    const { result } = await (
      gateway as never as {
        verify(r: ExecutionRequest): Promise<{
          result: { valid: boolean; checks: Record<string, unknown> };
        }>;
      }
    ).verify(requestFor(content, authorization));

    expect(result.checks.policyStillCurrent).toBe(true);
    expect(result.checks.policyGovernanceVerified).toBe(true);
    expect(result.checks.signalsStillCurrent).toBe(true);
    expect(result.checks.decisionApproved).toBe(true);
    expect(result.checks.verificationKeyScope).toBe(true);
    expect(result.valid).toBe(true);
  });

  it("refuses a release to an unregistered capability at the connector lookup, and does not spend the authorization", async () => {
    const gateway = await createExecutionGateway();
    const content = contentFor(CAPABILITY);
    const authorization = await signWithRuntimeKey(content);
    const request = requestFor(content, authorization);

    await expect(gateway.execute(request)).rejects.toBeInstanceOf(
      ConnectorNotRegisteredError,
    );

    // A refused release does not spend its authorization. The retry runs the
    // lookup again and is refused again for the same reason, not reported as a replay.
    await expect(gateway.execute(request)).rejects.toBeInstanceOf(
      ConnectorNotRegisteredError,
    );
  });

  it("refuses a verifier-key authorization for a capability outside its read scope (verificationOnlyKeys, G-111)", async () => {
    const gateway = await createExecutionGateway();
    const content = contentFor(CAPABILITY);
    const authorization = await signWithVerifierKey(content);

    const { result } = await (
      gateway as never as {
        verify(r: ExecutionRequest): Promise<{
          result: { valid: boolean; checks: Record<string, unknown> };
        }>;
      }
    ).verify(requestFor(content, authorization));

    expect(result.checks.verificationKeyScope).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("allows a verifier-key authorization for a read capability in its scope", async () => {
    const gateway = await createExecutionGateway();
    const content = contentFor("hubspot:deal-fetch");
    const authorization = await signWithVerifierKey(content);

    const { result } = await (
      gateway as never as {
        verify(r: ExecutionRequest): Promise<{
          result: { valid: boolean; checks: Record<string, unknown> };
        }>;
      }
    ).verify(requestFor(content, authorization));

    expect(result.checks.verificationKeyScope).toBe(true);
    expect(result.valid).toBe(true);
  });
});
