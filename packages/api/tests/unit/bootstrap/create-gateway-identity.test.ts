import { afterEach, describe, expect, it } from "vitest";

import { createGatewayIdentity } from "../../../src/bootstrap/createGatewayIdentity.js";

const ORIGINAL = process.env.PARMANA_GATEWAY_ID;

describe("createGatewayIdentity", () => {
  afterEach(() => {
    if (ORIGINAL === undefined) {
      delete process.env.PARMANA_GATEWAY_ID;
    } else {
      process.env.PARMANA_GATEWAY_ID = ORIGINAL;
    }
  });

  it("defaults to parmana-gateway when PARMANA_GATEWAY_ID is unset", () => {
    delete process.env.PARMANA_GATEWAY_ID;

    const identity = createGatewayIdentity();

    expect(identity.gatewayId).toBe("parmana-gateway");
    expect(identity.publicIdentity).toBe("parmana-gateway");
  });

  it("honors PARMANA_GATEWAY_ID when configured", () => {
    process.env.PARMANA_GATEWAY_ID = "tenant-a-gateway";

    const identity = createGatewayIdentity();

    expect(identity.gatewayId).toBe("tenant-a-gateway");
    expect(identity.publicIdentity).toBe("tenant-a-gateway");
  });

  it("rejects a gatewayId outside the safe character set", () => {
    process.env.PARMANA_GATEWAY_ID = "not valid! id";

    expect(() => createGatewayIdentity()).toThrow(/Invalid PARMANA_GATEWAY_ID/);
  });
});
