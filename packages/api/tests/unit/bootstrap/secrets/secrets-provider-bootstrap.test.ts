import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * vi.resetModules() + a fresh dynamic import isn't strictly required
 * (SecretsProviderBootstrap.create() is deliberately NOT memoized --
 * see its own doc comment), but keeps this file's structure consistent
 * with packages/crypto's signer-bootstrap.test.ts.
 * AwsSecretsManagerProvider.create() is mocked so the
 * aws-secrets-manager branch never makes a real network call;
 * aws-secrets-manager-provider.test.ts already covers its own
 * behavior in isolation.
 */
const awsProviderCreateMock = vi.fn();

vi.mock(
  "../../../../src/bootstrap/secrets/AwsSecretsManagerProvider.js",
  () => ({
    AwsSecretsManagerProvider: { create: awsProviderCreateMock },
  }),
);

async function freshSecretsProviderBootstrap() {
  vi.resetModules();
  const module =
    await import("../../../../src/bootstrap/secrets/SecretsProviderBootstrap.js");
  return module.SecretsProviderBootstrap;
}

const ORIGINAL_SECRETS_PROVIDER = process.env.PARMANA_SECRETS_PROVIDER;

describe("SecretsProviderBootstrap", () => {
  beforeEach(() => {
    awsProviderCreateMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_SECRETS_PROVIDER === undefined) {
      delete process.env.PARMANA_SECRETS_PROVIDER;
    } else {
      process.env.PARMANA_SECRETS_PROVIDER = ORIGINAL_SECRETS_PROVIDER;
    }
  });

  it("constructs an EnvSecretsProvider when PARMANA_SECRETS_PROVIDER is unset (defaults to env)", async () => {
    delete process.env.PARMANA_SECRETS_PROVIDER;

    const SecretsProviderBootstrap = await freshSecretsProviderBootstrap();
    const provider = await SecretsProviderBootstrap.create();

    expect(provider.constructor.name).toBe("EnvSecretsProvider");
    expect(awsProviderCreateMock).not.toHaveBeenCalled();
  });

  it("constructs an AwsSecretsManagerProvider when PARMANA_SECRETS_PROVIDER=aws-secrets-manager", async () => {
    process.env.PARMANA_SECRETS_PROVIDER = "aws-secrets-manager";
    const fakeProvider = { marker: "fake-aws-secrets-manager-provider" };
    awsProviderCreateMock.mockResolvedValue(fakeProvider);

    const SecretsProviderBootstrap = await freshSecretsProviderBootstrap();
    const provider = await SecretsProviderBootstrap.create();

    expect(provider).toBe(fakeProvider);
    expect(awsProviderCreateMock).toHaveBeenCalledTimes(1);
  });

  it("constructs a fresh provider on every call, rather than caching (so a per-test env change always takes effect)", async () => {
    process.env.PARMANA_SECRETS_PROVIDER = "aws-secrets-manager";
    awsProviderCreateMock.mockResolvedValue({ marker: "fake" });

    const SecretsProviderBootstrap = await freshSecretsProviderBootstrap();

    await SecretsProviderBootstrap.create();
    await SecretsProviderBootstrap.create();

    expect(awsProviderCreateMock).toHaveBeenCalledTimes(2);
  });

  it("rejects an unrecognized PARMANA_SECRETS_PROVIDER value at config-parse time", async () => {
    process.env.PARMANA_SECRETS_PROVIDER = "not-a-real-provider";

    const SecretsProviderBootstrap = await freshSecretsProviderBootstrap();

    await expect(SecretsProviderBootstrap.create()).rejects.toThrow(
      /Invalid PARMANA_SECRETS_PROVIDER/,
    );
  });
});
