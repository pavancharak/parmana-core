import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Never makes a real AWS network call: mocks
 * @aws-sdk/client-secrets-manager's SecretsManagerClient.send()
 * entirely, keyed off which Command subclass it was given. Same
 * technique as packages/crypto's kms-signer.test.ts.
 */
const sendMock = vi.fn();

vi.mock("@aws-sdk/client-secrets-manager", () => {
  class GetSecretValueCommand {
    constructor(public readonly input: unknown) {}
  }
  class SecretsManagerClient {
    send = sendMock;
  }

  return { SecretsManagerClient, GetSecretValueCommand };
});

const ORIGINAL_AWS_REGION = process.env.AWS_REGION;
const ORIGINAL_AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;

async function freshAwsSecretsManagerProvider() {
  vi.resetModules();
  const module =
    await import("../../../../src/bootstrap/secrets/AwsSecretsManagerProvider.js");
  return module.AwsSecretsManagerProvider;
}

describe("AwsSecretsManagerProvider", () => {
  beforeEach(() => {
    process.env.AWS_REGION = "us-east-1";
    delete process.env.AWS_ROLE_ARN;
    sendMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_AWS_REGION === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = ORIGINAL_AWS_REGION;

    if (ORIGINAL_AWS_ROLE_ARN === undefined) delete process.env.AWS_ROLE_ARN;
    else process.env.AWS_ROLE_ARN = ORIGINAL_AWS_ROLE_ARN;
  });

  it("throws if AWS_REGION is unset", async () => {
    delete process.env.AWS_REGION;
    const AwsSecretsManagerProvider = await freshAwsSecretsManagerProvider();

    await expect(AwsSecretsManagerProvider.create()).rejects.toThrow(
      /AWS_REGION/,
    );
  });

  it("getSecret() fetches SecretString and returns it", async () => {
    const AwsSecretsManagerProvider = await freshAwsSecretsManagerProvider();

    sendMock.mockResolvedValue({ SecretString: "the-real-token" });

    const provider = await AwsSecretsManagerProvider.create();
    const secret = await provider.getSecret("parmana/hubspot-token");

    expect(secret).toBe("the-real-token");

    const call = sendMock.mock.calls[0]![0] as { input: { SecretId: string } };
    expect(call.input.SecretId).toBe("parmana/hubspot-token");
  });

  it("caches the fetched value: a second getSecret() for the same reference does not call send() again", async () => {
    const AwsSecretsManagerProvider = await freshAwsSecretsManagerProvider();

    sendMock.mockResolvedValue({ SecretString: "cached-token" });

    const provider = await AwsSecretsManagerProvider.create();

    await provider.getSecret("parmana/hubspot-token");
    await provider.getSecret("parmana/hubspot-token");

    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the secret has no SecretString (binary secrets unsupported)", async () => {
    const AwsSecretsManagerProvider = await freshAwsSecretsManagerProvider();

    sendMock.mockResolvedValue({ SecretBinary: new Uint8Array([1, 2, 3]) });

    const provider = await AwsSecretsManagerProvider.create();

    await expect(provider.getSecret("parmana/binary-secret")).rejects.toThrow(
      /no SecretString value/,
    );
  });
});
