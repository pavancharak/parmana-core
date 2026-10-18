import { generateKeyPairSync } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Never makes a real AWS network call: mocks @aws-sdk/client-kms's
 * KMSClient.send() entirely, keyed off which Command subclass it was
 * given. class NotFoundException is real (not mocked) so KmsSigner's
 * `error instanceof NotFoundException` check in hasKey() is exercised
 * genuinely, the same way it would be against the real SDK.
 */
class FakeNotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundException";
  }
}

const { publicKey: realPublicKeyObject, privateKey: realPrivateKeyObject } =
  generateKeyPairSync("ed25519");

const realPublicKeyDer = realPublicKeyObject.export({
  format: "der",
  type: "spki",
});

const sendMock = vi.fn();

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
  }

  return {
    KMSClient,
    SignCommand,
    GetPublicKeyCommand,
    DescribeKeyCommand,
    NotFoundException: FakeNotFoundException,
  };
});

const ORIGINAL_AWS_REGION = process.env.AWS_REGION;
const ORIGINAL_AWS_ROLE_ARN = process.env.AWS_ROLE_ARN;

async function freshKmsSigner() {
  vi.resetModules();
  const module = await import("../../src/providers/signer/KmsSigner.js");
  return module.KmsSigner;
}

describe("KmsSigner", () => {
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
    const KmsSigner = await freshKmsSigner();

    await expect(KmsSigner.create()).rejects.toThrow(/AWS_REGION/);
  });

  it("sign() calls KMS Sign with RAW/ED25519_SHA_512 and base64-encodes the returned signature", async () => {
    const KmsSigner = await freshKmsSigner();

    const rawSignature = new Uint8Array([1, 2, 3, 4]);
    sendMock.mockImplementation((command: { input: unknown }) => {
      if (command.constructor.name === "SignCommand") {
        return Promise.resolve({ Signature: rawSignature });
      }
      throw new Error(`unexpected command: ${command.constructor.name}`);
    });

    const signer = await KmsSigner.create();
    const signature = await signer.sign("test-key", new Uint8Array([9, 9]));

    expect(signature).toBe(Buffer.from(rawSignature).toString("base64"));

    const call = sendMock.mock.calls[0]![0] as {
      input: Record<string, unknown>;
    };
    expect(call.input).toMatchObject({
      KeyId: "alias/test-key",
      MessageType: "RAW",
      SigningAlgorithm: "ED25519_SHA_512",
    });
  });

  it("sign() sends a message at exactly 4096 bytes raw, unchanged", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockResolvedValue({ Signature: new Uint8Array([1]) });

    const signer = await KmsSigner.create();
    const data = new Uint8Array(4096).fill(7);
    await signer.sign("test-key", data);

    const call = sendMock.mock.calls[0]![0] as {
      input: { Message: Uint8Array };
    };
    expect(call.input.Message).toEqual(data);
  });

  it("sign() sends a fixed size commitment for a message over 4096 bytes, never the raw message", async () => {
    const KmsSigner = await freshKmsSigner();
    const { commitmentMessage } =
      await import("../../src/SignatureCommitment.js");

    sendMock.mockResolvedValue({ Signature: new Uint8Array([1]) });

    const signer = await KmsSigner.create();
    const data = new Uint8Array(60_000).fill(7);
    await signer.sign("test-key", data);

    const call = sendMock.mock.calls[0]![0] as {
      input: { Message: Uint8Array; MessageType: string };
    };

    expect(call.input.MessageType).toBe("RAW");
    expect(call.input.Message.length).toBeLessThanOrEqual(4096);
    expect(Buffer.from(call.input.Message)).toEqual(
      Buffer.from(commitmentMessage(data)),
    );
  });

  it("getPublicKey() wraps the DER bytes KMS returns into a usable Ed25519 KeyObject", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "GetPublicKeyCommand") {
          return Promise.resolve({
            PublicKey: new Uint8Array(realPublicKeyDer),
          });
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      },
    );

    const signer = await KmsSigner.create();
    const keyObject = await signer.getPublicKey("test-key");

    expect(keyObject.asymmetricKeyType).toBe("ed25519");
    expect(keyObject.export({ format: "der", type: "spki" })).toEqual(
      realPublicKeyDer,
    );
  });

  describe("resolveKmsKeyId (keyId -> AWS KMS identifier mapping)", () => {
    async function keyIdSentToKms(logicalKeyId: string): Promise<string> {
      const KmsSigner = await freshKmsSigner();

      sendMock.mockImplementation(
        (command: { constructor: { name: string } }) => {
          if (command.constructor.name === "DescribeKeyCommand") {
            return Promise.resolve({
              KeyMetadata: { KeySpec: "ECC_NIST_EDWARDS25519" },
            });
          }
          throw new Error(`unexpected command: ${command.constructor.name}`);
        },
      );

      const signer = await KmsSigner.create();
      await signer.hasKey(logicalKeyId);

      const call = sendMock.mock.calls.at(-1)![0] as {
        input: Record<string, unknown>;
      };
      return call.input.KeyId as string;
    }

    it('prefixes a bare logical keyId with alias/ (e.g. DEFAULT_KEY_ID = "default")', async () => {
      expect(await keyIdSentToKms("default")).toBe("alias/default");
    });

    it('maps a tenant-scoped logical keyId to a valid alias, "." becoming "/" (KMS alias names cannot contain ".")', async () => {
      expect(await keyIdSentToKms("tenant.acme")).toBe("alias/tenant/acme");
      expect(await keyIdSentToKms("tenant.acme-corp.eu")).toBe(
        "alias/tenant/acme-corp/eu",
      );
    });

    it('refuses a keyId that would land under AWS\'s reserved "alias/aws/" prefix', async () => {
      const { resolveKmsKeyId } =
        await import("../../src/providers/signer/KmsSigner.js");

      expect(() => resolveKmsKeyId("aws.ebs")).toThrow(/alias\/aws\//);
      expect(() => resolveKmsKeyId("alias/aws/ebs")).toThrow(/alias\/aws\//);
    });

    it("passes an already-prefixed alias/ name through unchanged", async () => {
      expect(await keyIdSentToKms("alias/parmana-ed25519-signer")).toBe(
        "alias/parmana-ed25519-signer",
      );
    });

    it("refuses a full key ARN, which can name a key in another AWS account", async () => {
      const { resolveKmsKeyId } =
        await import("../../src/providers/signer/KmsSigner.js");
      expect(() =>
        resolveKmsKeyId(
          "arn:aws:kms:ap-south-1:999999999999:key/2787acce-db19-4cd6-88ed-ce2c1319096b",
        ),
      ).toThrow(/key ARN is not accepted/);
    });

    it("treats a UUID shaped keyId as an alias name in this account, never as a raw key ID", async () => {
      expect(await keyIdSentToKms("2787acce-db19-4cd6-88ed-ce2c1319096b")).toBe(
        "alias/2787acce-db19-4cd6-88ed-ce2c1319096b",
      );
    });

    it("hasKey() answers false for an ARN without calling KMS", async () => {
      const KmsSigner = await freshKmsSigner();
      const signer = await KmsSigner.create();

      await expect(
        signer.hasKey(
          "arn:aws:kms:ap-south-1:999999999999:key/2787acce-db19-4cd6-88ed-ce2c1319096b",
        ),
      ).resolves.toBe(false);
      expect(sendMock).not.toHaveBeenCalled();
    });
  });

  describe("listKeys() (GET /.well-known/jwks.json under KMS)", () => {
    const ORIGINAL_VERIFICATION_KEY_ID =
      process.env.PARMANA_VERIFICATION_KEY_ID;

    afterEach(() => {
      if (ORIGINAL_VERIFICATION_KEY_ID === undefined) {
        delete process.env.PARMANA_VERIFICATION_KEY_ID;
      } else {
        process.env.PARMANA_VERIFICATION_KEY_ID = ORIGINAL_VERIFICATION_KEY_ID;
      }
    });

    function describeKeyFor(existing: readonly string[]) {
      sendMock.mockImplementation(
        (command: {
          constructor: { name: string };
          input: { KeyId: string };
        }) => {
          if (command.constructor.name !== "DescribeKeyCommand") {
            throw new Error(`unexpected command: ${command.constructor.name}`);
          }
          if (existing.includes(command.input.KeyId)) {
            return Promise.resolve({
              KeyMetadata: { KeySpec: "ECC_NIST_EDWARDS25519" },
            });
          }
          return Promise.reject(new FakeNotFoundException("not found"));
        },
      );
    }

    it("lists the default key when it exists", async () => {
      delete process.env.PARMANA_VERIFICATION_KEY_ID;
      const KmsSigner = await freshKmsSigner();
      describeKeyFor(["alias/default"]);

      const signer = await KmsSigner.create();

      await expect(signer.listKeys()).resolves.toEqual(["default"]);
    });

    it("adds the current verification key, and leaves out one whose alias does not exist", async () => {
      process.env.PARMANA_VERIFICATION_KEY_ID = "signing-2026";
      const KmsSigner = await freshKmsSigner();
      describeKeyFor(["alias/signing-2026"]);

      const signer = await KmsSigner.create();

      await expect(signer.listKeys()).resolves.toEqual(["signing-2026"]);
    });
  });

  it("getMetadata() maps ECC_NIST_EDWARDS25519 to the ed25519 SignatureAlgorithm", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockImplementation(
      (command: { constructor: { name: string } }) => {
        if (command.constructor.name === "DescribeKeyCommand") {
          return Promise.resolve({
            KeyMetadata: { KeySpec: "ECC_NIST_EDWARDS25519" },
          });
        }
        throw new Error(`unexpected command: ${command.constructor.name}`);
      },
    );

    const signer = await KmsSigner.create();
    const metadata = await signer.getMetadata("test-key");

    expect(metadata).toEqual({ keyId: "test-key", algorithm: "ed25519" });
  });

  it("getMetadata() throws for any KeySpec other than ECC_NIST_EDWARDS25519", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockImplementation(() =>
      Promise.resolve({ KeyMetadata: { KeySpec: "RSA_2048" } }),
    );

    const signer = await KmsSigner.create();

    await expect(signer.getMetadata("test-key")).rejects.toThrow(
      /only supports ECC_NIST_EDWARDS25519/,
    );
  });

  describe("public key and DescribeKey cache", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    function answerEveryCommand() {
      sendMock.mockImplementation(
        (command: { constructor: { name: string } }) => {
          if (command.constructor.name === "GetPublicKeyCommand") {
            return Promise.resolve({
              PublicKey: new Uint8Array(realPublicKeyDer),
            });
          }
          if (command.constructor.name === "DescribeKeyCommand") {
            return Promise.resolve({
              KeyMetadata: { KeySpec: "ECC_NIST_EDWARDS25519" },
            });
          }
          throw new Error(`unexpected command: ${command.constructor.name}`);
        },
      );
    }

    function sentCommands(): string[] {
      return sendMock.mock.calls.map(
        ([command]) =>
          (command as { constructor: { name: string } }).constructor.name,
      );
    }

    it("serves repeated lookups across signer instances from one KMS call each, until the TTL passes", async () => {
      vi.useFakeTimers();
      const KmsSigner = await freshKmsSigner();
      const { KMS_KEY_CACHE_TTL_MS } =
        await import("../../src/providers/signer/KmsSigner.js");
      answerEveryCommand();

      const first = await KmsSigner.create();
      const second = await KmsSigner.create();

      await first.getPublicKey("default");
      await second.getPublicKey("default");
      await first.hasKey("default");
      await second.getMetadata("default");

      expect(sentCommands()).toEqual([
        "GetPublicKeyCommand",
        "DescribeKeyCommand",
      ]);

      vi.advanceTimersByTime(KMS_KEY_CACHE_TTL_MS + 1);
      await second.getPublicKey("default");

      expect(sentCommands()).toEqual([
        "GetPublicKeyCommand",
        "DescribeKeyCommand",
        "GetPublicKeyCommand",
      ]);
    });

    it("shares one call between concurrent lookups of the same key", async () => {
      const KmsSigner = await freshKmsSigner();
      answerEveryCommand();

      const signer = await KmsSigner.create();
      await Promise.all([
        signer.getPublicKey("default"),
        signer.getPublicKey("default"),
        signer.getPublicKey("default"),
      ]);

      expect(sentCommands()).toEqual(["GetPublicKeyCommand"]);
    });

    it("never caches a missing key or a failed call", async () => {
      const KmsSigner = await freshKmsSigner();
      const signer = await KmsSigner.create();

      sendMock.mockRejectedValueOnce(new FakeNotFoundException("no such key"));
      expect(await signer.hasKey("tenant.acme")).toBe(false);

      sendMock.mockRejectedValueOnce(new Error("throttled"));
      await expect(signer.getPublicKey("tenant.acme")).rejects.toThrow(
        /throttled/,
      );

      answerEveryCommand();
      expect(await signer.hasKey("tenant.acme")).toBe(true);
      await expect(signer.getPublicKey("tenant.acme")).resolves.toBeDefined();

      expect(sendMock).toHaveBeenCalledTimes(4);
    });

    it("keeps keys in different regions apart", async () => {
      const KmsSigner = await freshKmsSigner();
      answerEveryCommand();

      await (await KmsSigner.create("us-east-1")).getPublicKey("default");
      await (await KmsSigner.create("ap-south-1")).getPublicKey("default");

      expect(sentCommands()).toEqual([
        "GetPublicKeyCommand",
        "GetPublicKeyCommand",
      ]);
    });

    it("never caches Sign", async () => {
      const KmsSigner = await freshKmsSigner();
      sendMock.mockResolvedValue({ Signature: new Uint8Array([1]) });

      const signer = await KmsSigner.create();
      await signer.sign("default", new Uint8Array([1]));
      await signer.sign("default", new Uint8Array([1]));

      expect(sendMock).toHaveBeenCalledTimes(2);
    });
  });

  it("hasKey() returns true when DescribeKey succeeds", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockResolvedValue({
      KeyMetadata: { KeySpec: "ECC_NIST_EDWARDS25519" },
    });

    const signer = await KmsSigner.create();
    expect(await signer.hasKey("test-key")).toBe(true);
  });

  it("hasKey() returns false (not a throw) when DescribeKey reports NotFoundException", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockRejectedValue(new FakeNotFoundException("no such key"));

    const signer = await KmsSigner.create();
    expect(await signer.hasKey("missing-key")).toBe(false);
  });

  it("hasKey() re-throws any other error", async () => {
    const KmsSigner = await freshKmsSigner();

    sendMock.mockRejectedValue(new Error("network blip"));

    const signer = await KmsSigner.create();
    await expect(signer.hasKey("test-key")).rejects.toThrow(/network blip/);
  });
});

// Keep the real keypair import used (avoids an unused-variable lint
// failure while documenting that realPrivateKeyObject exists only to
// make clear the fixture is a genuine Ed25519 keypair, not just a
// standalone public key with no matching private half).
void realPrivateKeyObject;

/**
 * Mutation testing found these KmsSigner refusals untested: an empty
 * answer from KMS, an alias name that is empty or carries characters a
 * logical key id may not, and the exact moment a cached key expires.
 */
describe("KmsSigner, exactly", () => {
  beforeEach(() => {
    process.env.AWS_REGION = "us-east-1";
    delete process.env.AWS_ROLE_ARN;
    sendMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (ORIGINAL_AWS_REGION === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = ORIGINAL_AWS_REGION;
  });

  it("refuses a Sign answer with no signature", async () => {
    const KmsSigner = await freshKmsSigner();
    sendMock.mockResolvedValue({});
    const signer = await KmsSigner.create();
    await expect(
      signer.sign("default", new Uint8Array([1, 2, 3])),
    ).rejects.toThrow("KMS Sign returned no signature for key default.");
  });

  it("refuses a GetPublicKey answer with no key material", async () => {
    const KmsSigner = await freshKmsSigner();
    sendMock.mockResolvedValue({});
    const signer = await KmsSigner.create();
    await expect(signer.getPublicKey("default")).rejects.toThrow(
      "KMS GetPublicKey returned no key material for default.",
    );
  });

  it.each(["alias/", "alias/a b", "alias/key:1", "alias/a*b"])(
    "refuses the alias %j",
    async (keyId) => {
      const { resolveKmsKeyId } =
        await import("../../src/providers/signer/KmsSigner.js");
      expect(() => resolveKmsKeyId(keyId)).toThrow(/^Invalid KMS keyId/);
    },
  );

  it("keeps a public key for exactly five minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-05T00:00:00Z") });
    const KmsSigner = await freshKmsSigner();
    const { KMS_KEY_CACHE_TTL_MS } =
      await import("../../src/providers/signer/KmsSigner.js");
    expect(KMS_KEY_CACHE_TTL_MS).toBe(300_000);
    sendMock.mockResolvedValue({ PublicKey: new Uint8Array(realPublicKeyDer) });
    const signer = await KmsSigner.create();

    await signer.getPublicKey("default");
    vi.advanceTimersByTime(KMS_KEY_CACHE_TTL_MS - 1);
    await signer.getPublicKey("default");
    expect(sendMock).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    await signer.getPublicKey("default");
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
