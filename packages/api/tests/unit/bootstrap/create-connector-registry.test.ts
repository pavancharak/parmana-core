import { afterEach, describe, expect, it } from "vitest";

import {
  InMemoryGatewaySessionStore,
  MemoryExecutionAuditSink,
} from "@parmana/execution-control";

import { MemoryExternalConnectorRepository } from "@parmana/storage";

import { createConnectorRegistry } from "../../../src/bootstrap/createConnectorRegistry.js";
import { createConnectorAuthenticator } from "../../../src/bootstrap/createConnectorAuthenticator.js";

const ENV_KEYS = ["NODE_ENV", "HUBSPOT_PRIVATE_APP_TOKEN"] as const;

function buildRegistry() {
  const authenticator = createConnectorAuthenticator();
  const sessions = new InMemoryGatewaySessionStore(Object.freeze({}));
  const audit = new MemoryExecutionAuditSink();
  return createConnectorRegistry(
    authenticator,
    sessions,
    audit,
    Object.freeze({ token: "test" }),
    new MemoryExternalConnectorRepository(),
  );
}

describe("createConnectorRegistry — hubspot capability availability", () => {
  const original = Object.fromEntries(
    ENV_KEYS.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (original[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = original[key];
      }
    }
  });

  it("registers the hubspot connector and resolves both capabilities when NODE_ENV=test", async () => {
    process.env.NODE_ENV = "test";

    const registry = buildRegistry();

    expect(
      (await registry.resolveCapability("hubspot:deal-update")).connectorId,
    ).toBe("hubspot");
    expect(
      (await registry.resolveCapability("hubspot:deal-fetch")).connectorId,
    ).toBe("hubspot");
  });

  it("(fail-closed) does not register hubspot, and resolveCapability throws, when credentials are unconfigured outside test mode", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.HUBSPOT_PRIVATE_APP_TOKEN;

    const registry = buildRegistry();

    await expect(
      (async () => registry.resolveCapability("hubspot:deal-update"))(),
    ).rejects.toThrow(
      /No connector is registered for capability 'hubspot:deal-update'/,
    );
  });

  it("payments:execute has no connector to resolve to in any environment — vendor-payment was removed, not merely gated", async () => {
    for (const nodeEnv of ["test", "production", "development"] as const) {
      process.env.NODE_ENV = nodeEnv;

      const registry = buildRegistry();

      await expect(
        (async () => registry.resolveCapability("payments:execute"))(),
      ).rejects.toThrow(
        /No connector is registered for capability 'payments:execute'/,
      );
    }
  });

  it("registers hubspot when credentials are fully configured outside test mode", async () => {
    process.env.NODE_ENV = "production";
    process.env.HUBSPOT_PRIVATE_APP_TOKEN = "hubspot-test-token";

    const registry = buildRegistry();

    expect(
      (await registry.resolveCapability("hubspot:deal-update")).connectorId,
    ).toBe("hubspot");
  });
});
