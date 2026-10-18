import { SigningUnavailableError } from "./errors/SigningUnavailableError.js";

/**
 * Proves, before an action is released, that the evidence signing path can
 * currently produce a signed Execution Trust Record (G-52).
 *
 * assertReady() resolves when signing is healthy and throws
 * SigningUnavailableError when it is not. It exists so that a persistent
 * signing problem (a key that is missing, disabled or denied, a size limit,
 * a signing and verification key mismatch) is found BEFORE the connector
 * is called, not after. It cannot remove a transient failure that happens
 * between the check and the real signing, that residual window is recorded
 * in docs/VERIFICATION-GAPS.md G-52.
 */
export interface SigningReadiness {
  assertReady(): Promise<void>;
}

/**
 * Runs a probe at most once per `ttlMs`, so a real KMS signing round trip is
 * not added to every request.
 *
 * - A success is cached for `ttlMs`.
 * - A failure is never cached. The next request probes again, so recovery
 *   is seen immediately.
 * - Concurrent callers share one in-flight probe.
 */
export class CachedSigningReadiness implements SigningReadiness {
  private healthyUntil = 0;

  private inFlight: Promise<void> | undefined;

  constructor(
    private readonly probe: () => Promise<void>,
    private readonly ttlMs: number = 60_000,
    private readonly now: () => number = () => Date.now(),
  ) {}

  async assertReady(): Promise<void> {
    if (this.now() < this.healthyUntil) {
      return;
    }

    if (this.inFlight === undefined) {
      this.inFlight = this.probe()
        .then(() => {
          this.healthyUntil = this.now() + this.ttlMs;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }

    try {
      await this.inFlight;
    } catch (error) {
      throw new SigningUnavailableError(error);
    }
  }
}
