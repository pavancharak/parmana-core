import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

  it("builds a working authenticator when at least one key is configured", async () => {
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

    await expect(result.authenticator.authenticate(rawKey)).resolves.toEqual({
      callerId: "caller-1",
    });
    expect(result.auditSink).toBeDefined();
  });

  describe("PARMANA_AUTH_DISABLED needs local mode (fail closed)", () => {
    const original = process.env.NODE_ENV;
    const originalLocal = process.env.PARMANA_LOCAL_MODE;
    beforeEach(() => {
      // Refusals run with local mode off, so only NODE_ENV could relax them.
      delete process.env.PARMANA_LOCAL_MODE;
    });
    afterEach(() => {
      if (original === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = original;
      }
      if (originalLocal === undefined) {
        delete process.env.PARMANA_LOCAL_MODE;
      } else {
        process.env.PARMANA_LOCAL_MODE = originalLocal;
      }
    });

    it.each([["production"], ["staging"], ["Production"]])(
      "refuses NODE_ENV=%s",
      (nodeEnv) => {
        process.env.NODE_ENV = nodeEnv;
        expect(() =>
          createCallerAuthenticator({
            auth: { keys: [], disabled: true },
          } as never),
        ).toThrow(/refused unless local mode is on/);
      },
    );

    it("refuses when NODE_ENV is unset", () => {
      delete process.env.NODE_ENV;
      expect(() =>
        createCallerAuthenticator({
          auth: { keys: [], disabled: true },
        } as never),
      ).toThrow(/refused unless local mode is on/);
    });

    it.each([["development"], ["test"]])(
      "allows NODE_ENV=%s with local mode on",
      (nodeEnv) => {
        process.env.NODE_ENV = nodeEnv;
        process.env.PARMANA_LOCAL_MODE = "true";
        const result = createCallerAuthenticator({
          auth: { keys: [], disabled: true },
        } as never);
        expect(result.disabled).toBe(true);
      },
    );
  });
});

describe("probe OIDC acceptance (PROBE-OIDC-AUTH phase 2)", () => {
  const REPO_ID = "1424855835";
  const rawKey = "a-real-configured-key";

  function configWith(probeOidc?: {
    enabled: boolean;
    repositoryId: string | undefined;
  }) {
    return {
      ...baseConfig(),
      auth: {
        keys: [{ callerId: "caller-1", keyHash: hashApiKey(rawKey) }],
        disabled: false,
        ...(probeOidc === undefined ? {} : { probeOidc }),
      },
    };
  }

  /** A JWT-shaped credential that is refused before any network call (alg none). */
  function unsignedJwtShape(): string {
    const b64 = (value: unknown) =>
      Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
    return `${b64({ alg: "none" })}.${b64({ iss: "x" })}.sig`;
  }

  it("leaves a JWT-shaped credential unauthenticated when the flag is off", async () => {
    const result = createCallerAuthenticator(
      configWith({ enabled: false, repositoryId: REPO_ID }),
    );
    if (result.disabled) throw new Error("unreachable");

    await expect(
      result.authenticator.authenticate(unsignedJwtShape()),
    ).resolves.toBeUndefined();
  });

  it("keeps static keys working when the flag is on", async () => {
    const result = createCallerAuthenticator(
      configWith({ enabled: true, repositoryId: REPO_ID }),
    );
    if (result.disabled) throw new Error("unreachable");

    await expect(result.authenticator.authenticate(rawKey)).resolves.toEqual({
      callerId: "caller-1",
    });
  });

  it("routes a JWT-shaped credential to OIDC when the flag is on, and refuses it", async () => {
    const result = createCallerAuthenticator(
      configWith({ enabled: true, repositoryId: REPO_ID }),
    );
    if (result.disabled) throw new Error("unreachable");

    await expect(
      result.authenticator.authenticate(unsignedJwtShape()),
    ).resolves.toBeUndefined();
  });

  it("refuses to start when the flag is on and the repository id is missing", () => {
    expect(() =>
      createCallerAuthenticator(
        configWith({ enabled: true, repositoryId: undefined }),
      ),
    ).toThrow(/PARMANA_PROBE_REPOSITORY_ID/);
  });

  it("refuses to start when the repository id is not numeric", () => {
    expect(() =>
      createCallerAuthenticator(
        configWith({ enabled: true, repositoryId: "pavancharak/parmana-core" }),
      ),
    ).toThrow(/PARMANA_PROBE_REPOSITORY_ID/);
  });

  it("ignores a missing repository id while the flag is off", () => {
    expect(() =>
      createCallerAuthenticator(
        configWith({ enabled: false, repositoryId: undefined }),
      ),
    ).not.toThrow();
  });
});

describe("PARMANA_LOCAL_MODE under the wrong NODE_ENV refuses to start", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLocal = process.env.PARMANA_LOCAL_MODE;

  afterEach(() => {
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    if (originalLocal === undefined) delete process.env.PARMANA_LOCAL_MODE;
    else process.env.PARMANA_LOCAL_MODE = originalLocal;
  });

  it("refuses startup when the flag is set and NODE_ENV=production, even with keys configured", () => {
    process.env.NODE_ENV = "production";
    process.env.PARMANA_LOCAL_MODE = "true";

    expect(() =>
      createCallerAuthenticator({
        auth: {
          keys: [{ keyHash: hashApiKey("k"), callerId: "c" }],
          disabled: false,
        },
      } as never),
    ).toThrow(/PARMANA_LOCAL_MODE=true is refused unless NODE_ENV is exactly/);
  });
});
