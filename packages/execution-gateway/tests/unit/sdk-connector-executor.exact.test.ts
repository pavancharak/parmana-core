import { describe, expect, it } from "vitest";

import {
  brandCredentialHandle,
  connectorCapabilities,
  type Connector,
  type ConnectorExecutionContext,
  type ConnectorMetadata,
} from "@parmana/connector-sdk";
import { CryptoBootstrap } from "@parmana/crypto";
import type { ExecutableContent } from "@parmana/shared";

import { SdkConnectorExecutor } from "../../src/connector-execution/SdkConnectorExecutor.js";

/**
 * The executor's own refusals, each alone. Mutation testing found that
 * the version pin, the refusal of an unavailable connector, of an
 * undeclared capability and of a raw credential could each be removed
 * without a test in this package failing.
 */

const CONTENT: ExecutableContent = {
  businessTransactionId: "bt-1",
  action: "crm:read",
  target: "contact/1",
  parameters: {},
};

const handle = () => ({
  value: brandCredentialHandle({
    providerId: "p",
    credentialId: "c",
    value: undefined,
  }),
});

function executorWith(
  options: {
    version?: ConnectorMetadata["version"];
    expected?: ConnectorMetadata["version"];
    health?: ConnectorMetadata["health"];
    timeoutMs?: number;
  } = {},
) {
  const calls: ConnectorExecutionContext[] = [];
  const connector: Connector = {
    connectorId: "crm",
    capabilities: connectorCapabilities(["crm:read"]),
    async execute(_request, context) {
      calls.push(context);
      return { success: true };
    },
  };
  const executor = new SdkConnectorExecutor({
    connector,
    metadata: {
      connectorId: "crm",
      displayName: "CRM",
      version: options.version ?? { major: 1, minor: 2, patch: 3 },
      health: options.health ?? {
        status: "healthy",
        checkedAt: new Date().toISOString(),
      },
    },
    credentialProviderId: "p",
    crypto: CryptoBootstrap.create(),
    ...(options.expected !== undefined
      ? { expectedVersion: options.expected }
      : {}),
    ...(options.timeoutMs !== undefined
      ? { timeoutMs: options.timeoutMs }
      : {}),
  });
  return { executor, calls };
}

describe("SdkConnectorExecutor refusals", () => {
  it("runs a connector of the expected version", async () => {
    const { executor, calls } = executorWith({
      expected: { major: 1, minor: 2, patch: 3 },
    });
    await expect(executor.execute(CONTENT, handle())).resolves.toMatchObject({
      success: true,
    });
    expect(calls).toHaveLength(1);
  });

  it("refuses a connector of another version, naming both", async () => {
    const { executor, calls } = executorWith({
      expected: { major: 1, minor: 2, patch: 4 },
    });
    await expect(executor.execute(CONTENT, handle())).rejects.toThrow(
      'Connector version mismatch for "crm": expected 1.2.4, found 1.2.3.',
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses an unavailable connector, with or without a reason", async () => {
    const checkedAt = new Date().toISOString();
    const withReason = executorWith({
      health: { status: "unavailable", checkedAt, reason: "maintenance" },
    });
    await expect(
      withReason.executor.execute(CONTENT, handle()),
    ).rejects.toThrow('Connector "crm" is unavailable (maintenance).');

    const without = executorWith({
      health: { status: "unavailable", checkedAt },
    });
    await expect(without.executor.execute(CONTENT, handle())).rejects.toThrow(
      'Connector "crm" is unavailable (no reason reported).',
    );
    expect(withReason.calls).toHaveLength(0);
  });

  it("runs a degraded connector", async () => {
    const { executor } = executorWith({
      health: { status: "degraded", checkedAt: new Date().toISOString() },
    });
    await expect(executor.execute(CONTENT, handle())).resolves.toMatchObject({
      success: true,
    });
  });

  it("refuses a capability the connector does not declare", async () => {
    const { executor, calls } = executorWith();
    await expect(
      executor.execute({ ...CONTENT, action: "crm:delete" }, handle()),
    ).rejects.toThrow(
      'Connector "crm" does not declare capability "crm:delete".',
    );
    expect(calls).toHaveLength(0);
  });

  it("refuses a raw credential", async () => {
    const { executor, calls } = executorWith();
    await expect(
      executor.execute(CONTENT, {
        value: { providerId: "p", credentialId: "c", value: "sk_live" },
      } as never),
    ).rejects.toThrow(/rejected a raw credential/);
    expect(calls).toHaveLength(0);
  });

  it("gives the connector the configured timeout, or 30 s", async () => {
    const configured = executorWith({ timeoutMs: 5000 });
    await configured.executor.execute(CONTENT, handle());
    expect(configured.calls[0]?.timeoutMs).toBe(5000);

    const fallback = executorWith();
    await fallback.executor.execute(CONTENT, handle());
    expect(fallback.calls[0]?.timeoutMs).toBe(30_000);
    expect(fallback.calls[0]).not.toHaveProperty("release");
  });
});
