import { afterEach, describe, expect, it } from "vitest";

import { createConnectorAuthenticator } from "../../../src/bootstrap/createConnectorAuthenticator.js";

const fixtureIdentity = {
  connectorId: "test-fixture",
  publicIdentity: "spiffe://parmana/connectors/test-fixture",
  authenticationMetadata: {},
};

describe("createConnectorAuthenticator: fixture identity (Gap B)", () => {
  const keys = ["NODE_ENV", "PARMANA_LOCAL_MODE"] as const;
  const original = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  });

  it("does not trust the test-fixture identity under NODE_ENV=test without local mode", () => {
    process.env.NODE_ENV = "test";
    delete process.env.PARMANA_LOCAL_MODE;

    expect(
      createConnectorAuthenticator().authenticateConnector(fixtureIdentity),
    ).toBe(false);
  });

  it("trusts the test-fixture identity only in local mode", () => {
    process.env.NODE_ENV = "test";
    process.env.PARMANA_LOCAL_MODE = "true";

    expect(
      createConnectorAuthenticator().authenticateConnector(fixtureIdentity),
    ).toBe(true);
  });
});
