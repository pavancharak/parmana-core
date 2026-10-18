import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  BUILT_IN_CONNECTOR_VARIABLES,
  createSandboxOptions,
} from "../../src/bootstrap/createSandboxOptions.js";
import { parseCorsOrigins } from "../../src/middleware/cors.js";

/**
 * ADR-0014: sandbox mode and CORS are read at startup and refused when
 * unsafe, so a misconfigured process never serves a request.
 */

const ed25519Pem = generateKeyPairSync("ed25519")
  .privateKey.export({ format: "pem", type: "pkcs8" })
  .toString();

const SANDBOX = {
  PARMANA_SANDBOX: "true",
  PARMANA_SANDBOX_APPROVER_ID: "sandbox-demo-approver",
  PARMANA_SANDBOX_APPROVER_KEY_ID: "sandbox-demo-approver-key-1",
  PARMANA_SANDBOX_APPROVER_PRIVATE_KEY: ed25519Pem,
};

describe("createSandboxOptions", () => {
  it("changes nothing when no variable is set", () => {
    expect(createSandboxOptions({})).toEqual({ corsOrigins: [] });
  });

  it("reads CORS origins without sandbox mode", () => {
    expect(
      createSandboxOptions({
        PARMANA_CORS_ORIGINS:
          "https://docs.parmanasystems.com, http://localhost:3333",
      }),
    ).toEqual({
      corsOrigins: ["https://docs.parmanasystems.com", "http://localhost:3333"],
    });
  });

  it("builds the demo approver in sandbox mode", () => {
    const options = createSandboxOptions(SANDBOX);

    expect(options.sandboxApprover?.approverId).toBe("sandbox-demo-approver");
    expect(options.sandboxApprover?.keyId).toBe("sandbox-demo-approver-key-1");
    expect(options.sandboxApprover?.privateKey.asymmetricKeyType).toBe(
      "ed25519",
    );
  });

  it("accepts a PEM stored on one line with literal \\n", () => {
    const options = createSandboxOptions({
      ...SANDBOX,
      PARMANA_SANDBOX_APPROVER_PRIVATE_KEY: ed25519Pem.replace(/\n/g, "\\n"),
    });

    expect(options.sandboxApprover?.privateKey.asymmetricKeyType).toBe(
      "ed25519",
    );
  });

  it("treats PARMANA_SANDBOX=false as off", () => {
    expect(createSandboxOptions({ PARMANA_SANDBOX: "false" })).toEqual({
      corsOrigins: [],
    });
  });

  it("refuses any other PARMANA_SANDBOX value", () => {
    expect(() => createSandboxOptions({ PARMANA_SANDBOX: "yes" })).toThrow(
      /PARMANA_SANDBOX must be/,
    );
  });

  it.each(BUILT_IN_CONNECTOR_VARIABLES)(
    "refuses sandbox mode while %s is set",
    (name) => {
      expect(() => createSandboxOptions({ ...SANDBOX, [name]: "x" })).toThrow(
        new RegExp(`built in connector is configured: ${name}`),
      );
    },
  );

  it("refuses a connector variable that is defined but empty, as the connector factories register one for it", () => {
    expect(() =>
      createSandboxOptions({ ...SANDBOX, HUBSPOT_PRIVATE_APP_TOKEN: "" }),
    ).toThrow(/HUBSPOT_PRIVATE_APP_TOKEN/);
  });

  it("refuses sandbox mode with caller authentication disabled", () => {
    expect(() =>
      createSandboxOptions({ ...SANDBOX, PARMANA_AUTH_DISABLED: "true" }),
    ).toThrow(/PARMANA_AUTH_DISABLED/);
  });

  it("refuses sandbox mode without the whole demo approver", () => {
    expect(() =>
      createSandboxOptions({
        ...SANDBOX,
        PARMANA_SANDBOX_APPROVER_KEY_ID: "",
      }),
    ).toThrow(/PARMANA_SANDBOX_APPROVER_KEY_ID not set/);
  });

  it("refuses a demo approver key that is not Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 })
      .privateKey.export({ format: "pem", type: "pkcs8" })
      .toString();

    expect(() =>
      createSandboxOptions({
        ...SANDBOX,
        PARMANA_SANDBOX_APPROVER_PRIVATE_KEY: rsa,
      }),
    ).toThrow(/Ed25519/);
  });

  it("refuses demo approver variables outside sandbox mode", () => {
    const { PARMANA_SANDBOX: _off, ...withoutSwitch } = SANDBOX;

    expect(() => createSandboxOptions(withoutSwitch)).toThrow(
      /set without PARMANA_SANDBOX=true/,
    );
  });
});

describe("parseCorsOrigins", () => {
  it.each([
    "https://docs.parmanasystems.com/",
    "https://docs.parmanasystems.com/playground",
    "docs.parmanasystems.com",
    "ftp://docs.parmanasystems.com",
    "*",
  ])("refuses %s", (entry) => {
    expect(() => parseCorsOrigins(entry)).toThrow(/PARMANA_CORS_ORIGINS/);
  });

  it("returns nothing for an unset or blank value", () => {
    expect(parseCorsOrigins(undefined)).toEqual([]);
    expect(parseCorsOrigins("  ")).toEqual([]);
  });
});
