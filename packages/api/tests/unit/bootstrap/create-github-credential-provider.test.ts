import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Never makes a real Vercel Connect call: mocks @vercel/connect's
 * getToken() entirely.
 */
const getTokenMock = vi.fn();

vi.mock("@vercel/connect", () => ({
  getToken: getTokenMock,
}));

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID:
    process.env.PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID,
  GITHUB_APP_ID: process.env.GITHUB_APP_ID,
  GITHUB_INSTALLATION_ID: process.env.GITHUB_INSTALLATION_ID,
  GITHUB_APP_PRIVATE_KEY: process.env.GITHUB_APP_PRIVATE_KEY,
};

async function freshCreateGitHubCredentialProvider() {
  vi.resetModules();
  const module =
    await import("../../../src/bootstrap/createGitHubCredentialProvider.js");
  return module.createGitHubCredentialProvider;
}

describe("createGitHubCredentialProvider — Vercel Connect path (ADR-0009)", () => {
  beforeEach(() => {
    getTokenMock.mockReset();
    process.env.NODE_ENV = "production";
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("uses Vercel Connect when PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID is set, never reading GITHUB_APP_PRIVATE_KEY", async () => {
    process.env.PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID = "github/myagent";
    getTokenMock.mockResolvedValue("ghs_real_installation_token");

    const createGitHubCredentialProvider =
      await freshCreateGitHubCredentialProvider();
    const provider = createGitHubCredentialProvider();

    expect(provider).toBeDefined();

    const handle = await provider!.resolve("github");

    expect(getTokenMock).toHaveBeenCalledWith("github/myagent", {
      subject: { type: "app" },
    });
    expect(handle.value).toEqual({
      installationToken: "ghs_real_installation_token",
    });
    expect(handle.providerId).toBe("vercel-connect");
  });

  it("resolve() rejects a connectorId other than 'github'", async () => {
    process.env.PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID = "github/myagent";

    const createGitHubCredentialProvider =
      await freshCreateGitHubCredentialProvider();
    const provider = createGitHubCredentialProvider();

    await expect(provider!.resolve("hubspot")).rejects.toThrow(
      /cannot resolve credentials for connector "hubspot"/,
    );
  });

  it("falls back to the GITHUB_APP_ID/INSTALLATION_ID/PRIVATE_KEY path when the Vercel Connect env var is unset", async () => {
    delete process.env.PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID;

    // vi.resetModules() re-triggers @parmana/shared's module-level
    // dotenv.config(), which repopulates GITHUB_APP_ID/etc. from this
    // repo's real .env (it has dev-mode GitHub App credentials
    // configured) -- so these must be deleted AFTER the fresh import,
    // not before, to actually exercise "neither path configured".
    const createGitHubCredentialProvider =
      await freshCreateGitHubCredentialProvider();

    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_INSTALLATION_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;

    const provider = createGitHubCredentialProvider();

    expect(provider).toBeUndefined();
    expect(getTokenMock).not.toHaveBeenCalled();
  });
});
