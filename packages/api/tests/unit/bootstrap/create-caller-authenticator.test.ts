import { describe, expect, it, vi } from "vitest";

import { loadConfig } from "@parmana/shared";

import { createCallerAuthenticator } from "../../../src/bootstrap/createCallerAuthenticator.js";
import { hashApiKey } from "../../../src/auth/hashApiKey.js";

function baseConfig() {
  return loadConfig();
}

describe("createCallerAuthenticator", () => {
  it("refuses to start with no keys configured and auth not disabled", () => {
    const config = {
      ...baseConfig(),
      auth: { keys: [], disabled: false },
    };

    expect(() => createCallerAuthenticator(config)).toThrow(
      "No caller authentication keys are configured",
    );
  });

  it("does not throw, and returns disabled: true, when PARMANA_AUTH_DISABLED is set", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = {
      ...baseConfig(),
      auth: { keys: [], disabled: true },
    };

    const result = createCallerAuthenticator(config);

    expect(result.disabled).toBe(true);
    warnSpy.mockRestore();
  });

  it("logs a loud warning at startup when auth is disabled", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const config = {
      ...baseConfig(),
      auth: { keys: [], disabled: true },
    };

    createCallerAuthenticator(config);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0][0]).toContain("PARMANA_AUTH_DISABLED=true");
    warnSpy.mockRestore();
  });

  it("builds a working authenticator when at least one key is configured", () => {
    const rawKey = "a-real-configured-key";

    const config = {
      ...baseConfig(),
      auth: {
        keys: [{ callerId: "caller-1", keyHash: hashApiKey(rawKey) }],
        disabled: false,
      },
    };

    const result = createCallerAuthenticator(config);

    expect(result.disabled).toBe(false);
    if (result.disabled) throw new Error("unreachable");

    expect(result.authenticator.authenticate(rawKey)).toEqual({
      callerId: "caller-1",
    });
    expect(result.auditSink).toBeDefined();
  });
});
