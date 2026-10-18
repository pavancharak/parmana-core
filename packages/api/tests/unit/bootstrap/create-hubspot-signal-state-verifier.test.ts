import type { Signer } from "@parmana/crypto";
import { describe, expect, it, vi } from "vitest";

import { lazySignerBootstrap } from "../../../src/bootstrap/createHubSpotSignalStateVerifier.js";

/**
 * createHubSpotSignalStateVerifier resolves its Signer through
 * SignerBootstrap (KEY_PROVIDER), not the local key file, so the
 * verifier's own fetch is signed with the key the gateway verifies
 * against. The Signer is resolved on first use; a failure is not cached.
 */

const signer = {} as Signer;

describe("lazySignerBootstrap", () => {
  it("does not resolve until first use, then reuses the Signer", async () => {
    const create = vi.fn(async () => signer);
    const resolve = lazySignerBootstrap(create);

    expect(create).not.toHaveBeenCalled();

    await expect(resolve()).resolves.toBe(signer);
    await expect(resolve()).resolves.toBe(signer);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("tries again after a failed resolution instead of caching the failure", async () => {
    const create = vi
      .fn<() => Promise<Signer>>()
      .mockRejectedValueOnce(new Error("KMS unreachable"))
      .mockResolvedValueOnce(signer);
    const resolve = lazySignerBootstrap(create);

    await expect(resolve()).rejects.toThrow("KMS unreachable");
    await expect(resolve()).resolves.toBe(signer);
    expect(create).toHaveBeenCalledTimes(2);
  });
});
