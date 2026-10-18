import { describe, expect, it, vi } from "vitest";

import { CachedSigningReadiness } from "../../src/SigningReadiness.js";
import { SigningUnavailableError } from "../../src/errors/SigningUnavailableError.js";

describe("CachedSigningReadiness", () => {
  it("runs the probe once and trusts a success for the ttl", async () => {
    let clock = 1_000;
    const probe = vi.fn().mockResolvedValue(undefined);
    const readiness = new CachedSigningReadiness(probe, 60_000, () => clock);

    await readiness.assertReady();
    await readiness.assertReady();
    clock += 59_999;
    await readiness.assertReady();

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("probes again after the ttl expires", async () => {
    let clock = 1_000;
    const probe = vi.fn().mockResolvedValue(undefined);
    const readiness = new CachedSigningReadiness(probe, 60_000, () => clock);

    await readiness.assertReady();
    clock += 60_000;
    await readiness.assertReady();

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("throws SigningUnavailableError (503) when the probe fails, carrying the cause", async () => {
    const readiness = new CachedSigningReadiness(async () => {
      throw new Error("KMS AccessDeniedException");
    });

    const error = await readiness.assertReady().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SigningUnavailableError);
    expect((error as SigningUnavailableError).status).toBe(503);
    expect((error as SigningUnavailableError).code).toBe("SIGNING_UNAVAILABLE");
    expect((error as SigningUnavailableError).message).toContain(
      "KMS AccessDeniedException",
    );
    expect((error as SigningUnavailableError).message).toContain(
      "Nothing was executed",
    );
  });

  it("never caches a failure, so recovery is seen on the next request", async () => {
    const probe = vi
      .fn()
      .mockRejectedValueOnce(new Error("outage"))
      .mockResolvedValue(undefined);
    const readiness = new CachedSigningReadiness(probe);

    await expect(readiness.assertReady()).rejects.toBeInstanceOf(
      SigningUnavailableError,
    );
    await expect(readiness.assertReady()).resolves.toBeUndefined();

    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("shares one in flight probe between concurrent callers", async () => {
    let release!: () => void;
    const probe = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const readiness = new CachedSigningReadiness(probe);

    const a = readiness.assertReady();
    const b = readiness.assertReady();
    const c = readiness.assertReady();

    release();
    await Promise.all([a, b, c]);

    expect(probe).toHaveBeenCalledTimes(1);
  });
});
