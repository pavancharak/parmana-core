import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * vi.resetModules() + a fresh dynamic import isn't strictly required
 * here (SignerBootstrap.create() is deliberately NOT memoized -- see
 * its own doc comment for why a static cache broke per-test
 * PARMANA_KEY_DIR isolation elsewhere in this codebase), but keeps
 * this file's structure consistent with key-bootstrap.test.ts's
 * pattern. @aws-sdk/client-kms's KmsSigner.create() is mocked so the
 * aws-kms branch never makes a real network call; kms-signer.test.ts
 * already covers KmsSigner's own behavior in isolation.
 */
const kmsSignerCreateMock = vi.fn();

vi.mock("../../src/providers/signer/KmsSigner.js", () => ({
  KmsSigner: { create: kmsSignerCreateMock },
}));

async function freshSignerBootstrap() {
  vi.resetModules();
  const module = await import("../../src/SignerBootstrap.js");
  return module.SignerBootstrap;
}

const ORIGINAL_KEY_PROVIDER = process.env.KEY_PROVIDER;
const ORIGINAL_KEY_DIR = process.env.PARMANA_KEY_DIR;

describe("SignerBootstrap", () => {
  beforeEach(() => {
    process.env.PARMANA_KEY_DIR ??= "./keys";
    kmsSignerCreateMock.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_KEY_PROVIDER === undefined) delete process.env.KEY_PROVIDER;
    else process.env.KEY_PROVIDER = ORIGINAL_KEY_PROVIDER;

    if (ORIGINAL_KEY_DIR === undefined) delete process.env.PARMANA_KEY_DIR;
    else process.env.PARMANA_KEY_DIR = ORIGINAL_KEY_DIR;
  });

  it("constructs a LocalFileSigner when KEY_PROVIDER is unset (defaults to local)", async () => {
    delete process.env.KEY_PROVIDER;

    const SignerBootstrap = await freshSignerBootstrap();
    const signer = await SignerBootstrap.create();

    expect(signer.constructor.name).toBe("LocalFileSigner");
    expect(kmsSignerCreateMock).not.toHaveBeenCalled();
  });

  it("constructs a LocalFileSigner when KEY_PROVIDER=local", async () => {
    process.env.KEY_PROVIDER = "local";

    const SignerBootstrap = await freshSignerBootstrap();
    const signer = await SignerBootstrap.create();

    expect(signer.constructor.name).toBe("LocalFileSigner");
  });

  it("constructs a KmsSigner when KEY_PROVIDER=aws-kms", async () => {
    process.env.KEY_PROVIDER = "aws-kms";
    const fakeKmsSigner = { marker: "fake-kms-signer" };
    kmsSignerCreateMock.mockResolvedValue(fakeKmsSigner);

    const SignerBootstrap = await freshSignerBootstrap();
    const signer = await SignerBootstrap.create();

    expect(signer).toBe(fakeKmsSigner);
    expect(kmsSignerCreateMock).toHaveBeenCalledTimes(1);
  });

  it("constructs a fresh signer on every call, rather than caching (so a per-test PARMANA_KEY_DIR change always takes effect)", async () => {
    process.env.KEY_PROVIDER = "aws-kms";
    kmsSignerCreateMock.mockResolvedValue({ marker: "fake" });

    const SignerBootstrap = await freshSignerBootstrap();

    await SignerBootstrap.create();
    await SignerBootstrap.create();

    expect(kmsSignerCreateMock).toHaveBeenCalledTimes(2);
  });

  it("a LocalFileSigner picks up a changed PARMANA_KEY_DIR on the very next call, with no leftover state from a prior call", async () => {
    process.env.KEY_PROVIDER = "local";
    // PARMANA_KEY_DIR is left as whatever the global vitest.setup.ts
    // already configured (a real temp directory with a generated
    // "default" keypair) -- same assumption file-key-provider.test.ts
    // documents.

    const SignerBootstrap = await freshSignerBootstrap();

    const first = await SignerBootstrap.create();
    expect(await first.hasKey("default")).toBe(true);

    process.env.PARMANA_KEY_DIR = "./this-directory-does-not-exist";

    const second = await SignerBootstrap.create();
    await expect(second.hasKey("default")).rejects.toThrow(
      /Key directory does not exist/,
    );
  });

  it.each(["azure-key-vault", "gcp-kms", "hsm"])(
    "fails loudly instead of silently falling back to LocalFileSigner when KEY_PROVIDER=%s",
    async (provider) => {
      process.env.KEY_PROVIDER = provider;

      const SignerBootstrap = await freshSignerBootstrap();

      await expect(SignerBootstrap.create()).rejects.toThrow(/not implemented/);
      await expect(SignerBootstrap.create()).rejects.toThrow(
        new RegExp(provider),
      );
    },
  );
});
