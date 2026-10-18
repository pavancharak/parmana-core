import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MockGitHubServer } from "@parmana/connector-github";

import { GitHubAppCredentialProvider } from "../../src/connector-execution/index.js";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const INSTALLATION_TOKEN = "test-mock-installation-token-a1b2c3d4e5f6";

let server: MockGitHubServer;

beforeEach(async () => {
  server = new MockGitHubServer({ installationToken: INSTALLATION_TOKEN });
  await server.listen();
});

afterEach(async () => {
  await server.close();
});

function provider(): GitHubAppCredentialProvider {
  return new GitHubAppCredentialProvider({
    appId: "4646139",
    installationId: "154863462",
    privateKey,
    baseUrl: server.baseUrl,
  });
}

describe("GitHubAppCredentialProvider", () => {
  it("mints an installation token via a real JWT-authenticated exchange against the mock server", async () => {
    const handle = await provider().resolve("github");

    expect(handle.providerId).toBe("github-app");
    expect(handle.credentialId).toBe("installation:154863462");
    expect(
      (handle.value as { installationToken: string }).installationToken,
    ).toBe(INSTALLATION_TOKEN);
  });

  it("brands the returned handle (rejectable by SdkConnectorExecutor's raw-credential guard otherwise)", async () => {
    const handle = await provider().resolve("github");
    // brandCredentialHandle marks with a module-private symbol -- the
    // observable proxy for "is this branded" is that the object survived
    // brandCredentialHandle's own Object.freeze without extra own keys
    // beyond providerId/credentialId/value.
    expect(Object.keys(handle).sort()).toEqual([
      "credentialId",
      "providerId",
      "value",
    ]);
    expect(Object.isFrozen(handle)).toBe(true);
  });

  it("mints a fresh token on every resolve() call -- never caches or reuses a prior exchange", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const instance = provider();

    await instance.resolve("github");
    await instance.resolve("github");

    const accessTokenCalls = fetchSpy.mock.calls.filter((call) =>
      String(call[0]).includes("/access_tokens"),
    );
    expect(accessTokenCalls).toHaveLength(2);

    fetchSpy.mockRestore();
  });

  it("never leaks the private key into a thrown error when the mock server rejects the exchange", async () => {
    // A server that issues a different token than what this provider will
    // ever present makes every exchange fail closed with 401 from the
    // provider's own mock-auth check on the *other* endpoints, but
    // access_tokens itself only checks "non-empty Bearer" -- so instead
    // simulate a hard failure by pointing at a path with nothing listening.
    await server.close();

    let caught: unknown;
    try {
      await provider().resolve("github");
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const privateKeyPem = privateKey
      .export({ type: "pkcs1", format: "pem" })
      .toString();
    expect((caught as Error).message).not.toContain(
      privateKeyPem.split("\n")[1],
    );
  });

  it("never places the private key or the minted token in the resolved handle's identifiers", async () => {
    const handle = await provider().resolve("github");
    const privateKeyPem = privateKey
      .export({ type: "pkcs1", format: "pem" })
      .toString();

    expect(handle.credentialId).not.toContain(INSTALLATION_TOKEN);
    expect(handle.credentialId).not.toContain(privateKeyPem.split("\n")[1]);
  });

  it("rejects a malformed access-token response (missing token field) without throwing a raw parse error", async () => {
    const malformedServer = new MockGitHubServer({ installationToken: "" });
    await malformedServer.listen();

    try {
      await expect(
        new GitHubAppCredentialProvider({
          appId: "4646139",
          installationId: "154863462",
          privateKey,
          baseUrl: malformedServer.baseUrl,
        }).resolve("github"),
      ).rejects.toThrow(/malformed access-token response/);
    } finally {
      await malformedServer.close();
    }
  });

  it("refuses an exchange GitHub answers with an error status, naming only the status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response('{"message":"Bad credentials"}', { status: 401 }),
    );
    await expect(provider().resolve("github")).rejects.toThrow(
      'GitHubAppCredentialProvider failed to mint an installation token for connector "github": HTTP 401.',
    );
  });

  it.each([[{}], [{ token: 123 }], [{ token: "" }]])(
    "refuses an answer whose token is not a non empty string: %j",
    async (body) => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(JSON.stringify(body), { status: 201 }),
      );
      await expect(provider().resolve("github")).rejects.toThrow(
        'GitHubAppCredentialProvider received a malformed access-token response for connector "github": missing "token".',
      );
    },
  );
});
