import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Pins the KmsSigner behaviour that mutation testing showed was unpinned:
 * alias validation, the refusal message, the client options (region and
 * credentials), the KeyId sent to KMS, and a DescribeKey answer with no
 * metadata. Never makes a real AWS call.
 */

const sendMock = vi.fn();
const clientOptions: unknown[] = [];
const fakeCredentials = { accessKeyId: "AKIA-FAKE", secretAccessKey: "x" };
const awsCredentialsProviderMock = vi.fn(() => fakeCredentials);

vi.mock("@aws-sdk/client-kms", () => {
  class SignCommand {
    constructor(public readonly input: unknown) {}
  }
  class GetPublicKeyCommand {
    constructor(public readonly input: unknown) {}
  }
  class DescribeKeyCommand {
    constructor(public readonly input: unknown) {}
  }
  class KMSClient {
    send = sendMock;
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  }
  class NotFoundException extends Error {}

  return {
    KMSClient,
    SignCommand,
    GetPublicKeyCommand,
    DescribeKeyCommand,
    NotFoundException,
  };
});

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: awsCredentialsProviderMock,
}));

const ORIGINAL_AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;

async function freshKmsSigner() {
  vi.resetModules();
  const module = await import("../../src/providers/signer/KmsSigner.js");
  return module.KmsSigner;
}

describe("KmsSigner survivors (mutation testing)", () => {
  beforeEach(() => {
    sendMock.mockReset();
    clientOptions.length = 0;
    awsCredentialsProviderMock.mockClear();
    delete process.env.AWS_ROLE_ARN;
  });

  afterEach(() => {
    if (ORIGINAL_AWS_ROLE_ARN === undefined) delete process.env.AWS_ROLE_ARN;
    else process.env.AWS_ROLE_ARN = ORIGINAL_AWS_ROLE_ARN;
  });

  it("refuses an alias/ name with an empty name part", async () => {
    const KmsSigner = await freshKmsSigner();
    const signer = await KmsSigner.create("us-east-1");

    await expect(signer.hasKey("alias/")).resolves.toBe(false);
    sendMock.mockClear();
    await expect(signer.getPublicKey("alias/")).rejects.toThrow(
      /expected a logical key id/,
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("passes an alias whose name has a slash through unchanged", async () => {
    const KmsSigner = await freshKmsSigner();
    const signer = await KmsSigner.create("us-east-1");

    sendMock.mockResolvedValueOnce({ PublicKey: new Uint8Array(44) });

    await signer.getPublicKey("alias/tenant/acme").catch(() => undefined);

    const command = sendMock.mock.calls[0]?.[0] as {
      input: { KeyId?: string };
    };
    expect(command.input).toEqual({ KeyId: "alias/tenant/acme" });
  });

  it("explains in the refusal which keyIds are accepted and which are not", async () => {
    const KmsSigner = await freshKmsSigner();
    const signer = await KmsSigner.create("us-east-1");

    const error = await signer
      .getPublicKey("arn:aws:kms:us-east-1:111:key/abc")
      .catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain("expected a logical key id");
    expect(error.message).toContain("default");
    expect(error.message).toContain("A key ARN is not accepted");
    expect(error.message).toContain('"alias/aws/"');
  });

  it("creates the KMS client with the region and no credentials when AWS_ROLE_ARN is unset", async () => {
    const KmsSigner = await freshKmsSigner();
    await KmsSigner.create("eu-west-1");

    expect(clientOptions).toHaveLength(1);
    expect(clientOptions[0]).toEqual({ region: "eu-west-1" });
    expect(clientOptions[0]).not.toHaveProperty("credentials");
    expect(awsCredentialsProviderMock).not.toHaveBeenCalled();
  });

  it("hands the role ARN to the OIDC credentials provider and passes the credentials to the client", async () => {
    process.env.AWS_ROLE_ARN = "arn:aws:iam::111111111111:role/parmana";
    const KmsSigner = await freshKmsSigner();
    await KmsSigner.create("eu-west-1");

    expect(awsCredentialsProviderMock).toHaveBeenCalledWith({
      roleArn: "arn:aws:iam::111111111111:role/parmana",
    });
    expect(clientOptions[0]).toEqual({
      region: "eu-west-1",
      credentials: fakeCredentials,
    });
  });

  it("asks KMS for the key named by the resolved alias, not an empty request", async () => {
    const KmsSigner = await freshKmsSigner();
    const signer = await KmsSigner.create("us-east-1");

    sendMock.mockResolvedValueOnce({
      PublicKey: new Uint8Array(44),
    });

    await signer.getPublicKey("tenant.acme").catch(() => undefined);

    const command = sendMock.mock.calls[0]?.[0] as {
      input: { KeyId?: string };
    };
    expect(command.input).toEqual({ KeyId: "alias/tenant/acme" });
  });

  it("does not fail with a TypeError when DescribeKey answers with no metadata", async () => {
    const KmsSigner = await freshKmsSigner();
    const signer = await KmsSigner.create("us-east-1");

    sendMock.mockResolvedValueOnce({});

    const error = await signer.getMetadata("default").catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TypeError);
  });
});
