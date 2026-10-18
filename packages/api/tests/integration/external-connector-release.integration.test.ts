import { MemoryNonceStore } from "@parmana/envelope-verifier";
import type { KeyProvider } from "@parmana/crypto";
import crypto, { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  type Signer,
} from "@parmana/crypto";
import {
  GatewayAttestationSigner,
  RandomIdGenerator,
  SystemClock,
  type ExecutionRelease,
} from "@parmana/execution-control";
import type { ReleaseTransport } from "@parmana/execution-gateway";
import {
  ConnectorNotRegisteredError,
  PendingPolicyChangeStatus,
  type ExecutableContent,
  type ExternalConnectorChange,
  type ExternalConnectorRepository,
  type ResolvedAddress,
} from "@parmana/shared";
import { MemoryExternalConnectorRepository } from "@parmana/storage";

import { createExecutionControl } from "../../src/bootstrap/createExecutionControl.js";
import { createGatewayIdentity } from "../../src/bootstrap/createGatewayIdentity.js";
import { createGatewayKeyPair } from "../../src/bootstrap/createGatewayKeyPair.js";

import { verifyParmanaRelease } from "../../../../typescript/src/crypto/release.js";

/**
 * ADR-0013 step 4, through the production bootstrap
 * (createExecutionControl, createConnectorRegistry): an approved release
 * for a capability registered as an external connector reaches its
 * endpoint as a signed release, and the endpoint, checking it with the
 * TypeScript SDK's verifyParmanaRelease, accepts it. No network: DNS
 * and the transport are stubs, and the endpoint is a function.
 */

const ENDPOINT = "https://erp.example.com/parmana/release";
const keys = generateKeyPairSync("ed25519");
const authorizationKeys = generateKeyPairSync("ed25519");
const publicKeyPem = keys.publicKey
  .export({ type: "spki", format: "pem" })
  .toString();
const signatureProvider = CryptoBootstrap.create().signature;

const signer: Signer = {
  sign: (_keyId, data) => signatureProvider.sign(data, keys.privateKey),
  getPublicKey: async () => keys.publicKey,
  getMetadata: async (keyId) => ({ keyId, algorithm: "ed25519" as never }),
  hasKey: async () => true,
};

const publicLookup = async (): Promise<readonly ResolvedAddress[]> => [
  { address: "203.0.114.10", family: 4 },
];

/**
 * An endpoint built the way the docs will tell an operator to build one:
 * verify, refuse what fails, answer a repeat with the first result.
 */
function endpoint(audience = ENDPOINT) {
  const executed = new Map<string, unknown>();
  const seen: Array<{ url: string; release: Record<string, unknown> }> = [];

  const transport: ReleaseTransport = async ({ url, body }) => {
    const verification = await verifyParmanaRelease(JSON.parse(body), {
      publicKeys: { default: publicKeyPem },
      audience,
      isAlreadyExecuted: (id) => executed.has(id),
    });

    if (!verification.valid) {
      return {
        status: 401,
        body: JSON.stringify({ errors: verification.errors }),
      };
    }

    const { release } = verification;
    seen.push({ url: url.href, release: release as never });

    if (verification.alreadyExecuted) {
      return {
        status: 200,
        body: JSON.stringify(executed.get(release.businessTransactionId)),
      };
    }

    const answer = {
      businessTransactionId: release.businessTransactionId,
      capability: release.capability,
      success: true,
      result: { invoiceId: `INV-${executed.size + 1}` },
      executedAt: new Date().toISOString(),
    };
    executed.set(release.businessTransactionId, answer);

    return { status: 200, body: JSON.stringify(answer) };
  };

  return { transport, seen };
}

async function register(
  repository: ExternalConnectorRepository,
  capability: string,
  endpointUrl = ENDPOINT,
): Promise<string> {
  const change: ExternalConnectorChange = {
    changeId: crypto.randomUUID(),
    action: "register",
    capability,
    endpointUrl,
    policy: "erp-invoice",
    allowedParameters: ["amount", "currency"],
    timeoutMs: 10_000,
    reason: "Test.",
    proposedBy: "maker",
    proposedAt: new Date(),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
  };

  await repository.createChange(change);
  await repository.approveChange(change.changeId, "checker", new Date());

  return change.changeId;
}

async function revoke(
  repository: ExternalConnectorRepository,
  capability: string,
): Promise<void> {
  const change: ExternalConnectorChange = {
    changeId: crypto.randomUUID(),
    action: "revoke",
    capability,
    reason: "Test.",
    proposedBy: "maker",
    proposedAt: new Date(),
    status: PendingPolicyChangeStatus.PENDING_APPROVAL,
  };

  await repository.createChange(change);
  await repository.approveChange(change.changeId, "checker", new Date());
}

/**
 * What the Execution Gateway hands Execution Control after verifying an
 * authorization, and the attestation it mints for it, as
 * createExecutionGateway does.
 */
async function releaseFor(
  content: ExecutableContent,
): Promise<{ release: ExecutionRelease; attestation: unknown }> {
  const authorization = await new AuthorizationSigner(
    CryptoBootstrap.create(),
  ).sign(
    {
      decisionId: "decision-1",
      decisionOutcome: "APPROVED",
      businessTransactionId: content.businessTransactionId,
      policyName: "erp-invoice",
      policyVersion: "1.2.0",
      grantedCapability: content.action,
      executableContent: content,
    },
    authorizationKeys.privateKey,
    "key-1",
    60,
  );

  const attestation = new GatewayAttestationSigner(
    new SystemClock(),
    new RandomIdGenerator(),
  ).sign(
    createGatewayIdentity().gatewayId,
    authorization.payload.authorizationId,
    createGatewayKeyPair().privateKey,
  );

  return {
    release: {
      authorization,
      executableContent: content,
      verifiedTransaction: {
        authorizationVerified: true,
        executableContentVerified: true,
        replayCheckPassed: true,
      },
      executionTimestamp: new Date().toISOString(),
      approvals: [
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ],
    },
    attestation,
  };
}

function content(
  capability: string,
  parameters: Record<string, unknown> = { amount: 1200, currency: "INR" },
): ExecutableContent {
  return {
    businessTransactionId: crypto.randomUUID(),
    action: capability,
    target: "customer-42",
    parameters,
  };
}

function control(
  repository: ExternalConnectorRepository,
  transport: ReleaseTransport,
) {
  // The release verifier resolves keys the way the gateway does. These tests sign with
  // their own key, so the control is given that key, the one the gateway would use.
  const releaseKeys = {
    getPublicKey: async (keyId: string) => {
      if (keyId !== "key-1") throw new Error(`Public key not found: ${keyId}`);
      return authorizationKeys.publicKey;
    },
  } as unknown as KeyProvider;

  return createExecutionControl(
    {
      connectors: repository,
      adapter: { lookup: publicLookup, transport, signer },
    },
    releaseKeys,
    new MemoryNonceStore(),
  );
}

describe("External connector release through the production bootstrap", () => {
  it("releases an approved request for a registered capability to its endpoint, which verifies it with the SDK", async () => {
    const repository = new MemoryExternalConnectorRepository();
    await register(repository, "erp:create-invoice");
    const { transport, seen } = endpoint();
    const request = content("erp:create-invoice");
    const { release, attestation } = await releaseFor(request);

    const result = await control(repository, transport).execute(
      release,
      attestation,
    );

    expect(result.success).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(ENDPOINT);
    expect(seen[0]!.release).toMatchObject({
      connectorId: "ext-erp:create-invoice",
      audience: ENDPOINT,
      businessTransactionId: request.businessTransactionId,
      authorizationId: release.authorization.payload.authorizationId,
      capability: "erp:create-invoice",
      target: "customer-42",
      parameters: { amount: 1200, currency: "INR" },
      policy: { name: "erp-invoice", version: "1.2.0" },
      approvedBy: [
        {
          approverId: "manager-x",
          keyId: "manager-x-key-1",
          approvalId: "ap-1",
        },
      ],
    });
  });

  it("refuses a capability with no registration, as before", async () => {
    const repository = new MemoryExternalConnectorRepository();
    const { transport, seen } = endpoint();
    const { release, attestation } = await releaseFor(
      content("erp:create-invoice"),
    );

    await expect(
      control(repository, transport).execute(release, attestation),
    ).rejects.toBeInstanceOf(ConnectorNotRegisteredError);
    expect(seen).toHaveLength(0);
  });

  it("stops releasing to a registration once it is revoked, and follows a new registration to its new endpoint", async () => {
    const repository = new MemoryExternalConnectorRepository();
    await register(repository, "erp:create-invoice");
    const first = endpoint();
    const executionControl = control(repository, first.transport);

    const one = await releaseFor(content("erp:create-invoice"));
    await executionControl.execute(one.release, one.attestation);
    expect(first.seen).toHaveLength(1);

    await revoke(repository, "erp:create-invoice");

    const two = await releaseFor(content("erp:create-invoice"));
    await expect(
      executionControl.execute(two.release, two.attestation),
    ).rejects.toBeInstanceOf(ConnectorNotRegisteredError);
    expect(first.seen).toHaveLength(1);

    // A new registration, a new endpoint. The first endpoint refuses a
    // release made for another audience, so only the second one acts.
    const moved = "https://erp2.example.com/parmana/release";
    await register(repository, "erp:create-invoice", moved);
    const second = endpoint(moved);
    const movedControl = control(repository, second.transport);

    const three = await releaseFor(content("erp:create-invoice"));
    const result = await movedControl.execute(three.release, three.attestation);

    expect(result.success).toBe(true);
    expect(second.seen[0]!.release.audience).toBe(moved);
  });

  it("refuses a parameter the registration does not allow, before anything is sent", async () => {
    const repository = new MemoryExternalConnectorRepository();
    await register(repository, "erp:create-invoice");
    const { transport, seen } = endpoint();
    const { release, attestation } = await releaseFor(
      content("erp:create-invoice", { amount: 1200, bankAccount: "x" }),
    );

    await expect(
      control(repository, transport).execute(release, attestation),
    ).rejects.toThrow(/bankAccount/);
    expect(seen).toHaveLength(0);
  });

  it("fails closed when the registrations cannot be read, not as an unregistered capability", async () => {
    const failing: ExternalConnectorRepository = {
      findActive: async () => {
        throw new Error("storage unreachable");
      },
      listRegistrations: async () => [],
      createChange: async (c) => c,
      findChange: async () => null,
      listChanges: async () => [],
      approveChange: async () => {
        throw new Error("unused");
      },
      rejectChange: async () => {
        throw new Error("unused");
      },
    };
    const { transport } = endpoint();
    const { release, attestation } = await releaseFor(
      content("erp:create-invoice"),
    );

    const failure = control(failing, transport).execute(release, attestation);

    await expect(failure).rejects.toThrow(/storage unreachable/);
    await expect(failure).rejects.not.toBeInstanceOf(
      ConnectorNotRegisteredError,
    );
  });

  it("never serves a built in capability from a registration", async () => {
    const repository = new MemoryExternalConnectorRepository();
    const { transport, seen } = endpoint();
    const { release, attestation } = await releaseFor(
      content("test:fixture-execute", {}),
    );

    // test:fixture-execute is the built in test connector: it answers,
    // and the registry never asks for a registration.
    const result = await control(repository, transport).execute(
      release,
      attestation,
    );

    expect(result.success).toBe(true);
    expect(seen).toHaveLength(0);
  });
});
