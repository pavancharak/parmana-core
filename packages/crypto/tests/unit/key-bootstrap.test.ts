import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * KeyBootstrap.create() caches its result in a private static field, so
 * each test that cares about a fresh KEY_PROVIDER value needs its own
 * module instance -- vi.resetModules() plus a dynamic import gets one,
 * mirroring the pattern this file's sibling tests use for other
 * process-wide singletons (e.g. dilithium3-cross-instance.test.ts).
 */
async function freshKeyBootstrap() {
  vi.resetModules();
  const module = await import("../../src/KeyBootstrap.js");
  return module.KeyBootstrap;
}

const ORIGINAL_KEY_PROVIDER = process.env.KEY_PROVIDER;
const ORIGINAL_KEY_DIR = process.env.PARMANA_KEY_DIR;

describe("KeyBootstrap", () => {
  beforeEach(() => {
    process.env.PARMANA_KEY_DIR ??= "./keys";
  });

  afterEach(() => {
    if (ORIGINAL_KEY_PROVIDER === undefined) {
      delete process.env.KEY_PROVIDER;
    } else {
      process.env.KEY_PROVIDER = ORIGINAL_KEY_PROVIDER;
    }

    if (ORIGINAL_KEY_DIR === undefined) {
      delete process.env.PARMANA_KEY_DIR;
    } else {
      process.env.PARMANA_KEY_DIR = ORIGINAL_KEY_DIR;
    }
  });

  it("constructs a FileKeyProvider when KEY_PROVIDER is unset (defaults to local)", async () => {
    delete process.env.KEY_PROVIDER;

    const KeyBootstrap = await freshKeyBootstrap();

    expect(KeyBootstrap.create().constructor.name).toBe("FileKeyProvider");
  });

  it("constructs a FileKeyProvider when KEY_PROVIDER=local", async () => {
    process.env.KEY_PROVIDER = "local";

    const KeyBootstrap = await freshKeyBootstrap();

    expect(KeyBootstrap.create().constructor.name).toBe("FileKeyProvider");
  });

  it.each(["aws-kms", "azure-key-vault", "gcp-kms", "hsm"])(
    "fails loudly instead of silently falling back to FileKeyProvider when KEY_PROVIDER=%s",
    async (provider) => {
      process.env.KEY_PROVIDER = provider;

      const KeyBootstrap = await freshKeyBootstrap();

      expect(() => KeyBootstrap.create()).toThrow(/not implemented/);
      expect(() => KeyBootstrap.create()).toThrow(new RegExp(provider));
    },
  );

  it("rejects an unrecognized KEY_PROVIDER value at config-parse time, before KeyBootstrap is even reached", async () => {
    process.env.KEY_PROVIDER = "not-a-real-provider";

    const KeyBootstrap = await freshKeyBootstrap();

    expect(() => KeyBootstrap.create()).toThrow(/Invalid KEY_PROVIDER/);
  });
});
