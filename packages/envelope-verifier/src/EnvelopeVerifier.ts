import type { KeyObject } from "node:crypto";

import {
  AuthorizationVerifier,
  CryptoBootstrap,
  type KeyExpiryStore,
  type KeyProvider,
} from "@parmana/crypto";

import type { SignedExecutionAuthorization } from "@parmana/shared";

import type { NonceStore } from "./NonceStore.js";

const DEFAULT_MAX_TTL_SECONDS = 300;

/**
 * Result of the side-effect-free envelope checks:
 * payload version, signature, expiry, and TTL
 * policy. Consuming the nonce is a separate,
 * side-effecting step — see
 * EnvelopeVerifier.consumeNonce.
 */
export interface EnvelopeChecksResult {
  readonly passed: boolean;

  readonly checks: {
    /**
     * Present only when a keyProvider was supplied -- absent (not
     * false) when it wasn't, meaning key resolution isn't part of
     * this verifier's checks at all (the static publicKey is used
     * unconditionally instead). See EnvelopeVerifierOptions.keyProvider.
     */
    readonly keyValid?: boolean;
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly ttlWithinPolicy: boolean;
  };
}

/**
 * Result of verifying an execution authorization
 * envelope.
 *
 * The four side-effect-free checks (version,
 * signature, expiry, TTL policy) always run. The
 * nonce check has a side effect (it consumes the
 * nonce) and runs only when the other four have
 * passed — see EnvelopeVerifier.verify for why.
 */
export interface EnvelopeVerificationResult {
  readonly valid: boolean;

  readonly checks: {
    readonly keyValid?: boolean;
    readonly versionSupported: boolean;
    readonly signatureVerified: boolean;
    readonly notExpired: boolean;
    readonly ttlWithinPolicy: boolean;
    readonly nonceUnseen: boolean;
  };
}

export interface EnvelopeVerifierOptions {
  /**
   * Parmana's public key, supplied by the caller.
   * This package never reads key material from
   * disk or the network. Used unconditionally when
   * keyProvider (below) is not supplied; used as a
   * fallback when it is but resolution fails.
   */
  readonly publicKey: KeyObject;

  /**
   * Optional keyId-aware key lookup. When supplied, each
   * authorization's own `keyId` is resolved through this provider
   * instead of the single static publicKey above -- enabling
   * verification against a rotated or additional key without a
   * restart, since a new keyId only needs a new key file the
   * provider can read (see FileKeyProvider, which already supports
   * this). Omitted entirely, this class behaves exactly as it did
   * before this field existed.
   */
  readonly keyProvider?: KeyProvider;

  /**
   * Optional key-expiry/revocation check, consulted only when
   * keyProvider is also supplied. A keyId with no entry (or when
   * this is omitted entirely) is treated as always valid.
   */
  readonly keyExpiryStore?: KeyExpiryStore;

  readonly nonceStore: NonceStore;

  /**
   * Reject envelopes whose (expiresAt - authorizedAt)
   * exceeds this, so a compromised signer cannot mint
   * long-lived envelopes. Defaults to 300 seconds.
   */
  readonly maxTtlSeconds?: number;
}

/**
 * Envelope Verifier.
 *
 * Verifies that an incoming execution request was
 * authorized by Parmana: valid signature, not
 * expired, issued with a TTL within policy, and not
 * previously accepted by this nonce store.
 *
 * This does not evaluate policy. It proves only that
 * Parmana authorized the request; see the package
 * README for the exact claims a passing verification
 * establishes.
 */
export class EnvelopeVerifier {
  private readonly publicKey: KeyObject;

  private readonly keyProvider: KeyProvider | undefined;

  private readonly keyExpiryStore: KeyExpiryStore | undefined;

  private readonly nonceStore: NonceStore;

  private readonly maxTtlSeconds: number;

  private readonly authorizationVerifier: AuthorizationVerifier;

  constructor(options: EnvelopeVerifierOptions) {
    this.publicKey = options.publicKey;
    this.keyProvider = options.keyProvider;
    this.keyExpiryStore = options.keyExpiryStore;
    this.nonceStore = options.nonceStore;
    this.maxTtlSeconds = options.maxTtlSeconds ?? DEFAULT_MAX_TTL_SECONDS;

    this.authorizationVerifier = new AuthorizationVerifier(
      CryptoBootstrap.create(),
    );
  }

  /**
   * Resolves the public key to verify one authorization against.
   * When keyProvider is supplied, resolves authorization.keyId
   * through it (checking keyExpiryStore, if also supplied, for
   * expiry/revocation) -- a missing key, an unreadable key, or an
   * expired/revoked one all fail closed by returning undefined
   * rather than throwing or falling back to the static publicKey.
   * When keyProvider is not supplied, always returns the static
   * publicKey -- today's exact behavior.
   */
  private async resolveKey(
    authorization: SignedExecutionAuthorization,
    now: Date,
  ): Promise<KeyObject | undefined> {
    if (this.keyProvider === undefined) {
      return this.publicKey;
    }

    if (this.keyExpiryStore !== undefined) {
      const entry = await this.keyExpiryStore.get(authorization.keyId);

      if (
        entry?.revoked === true ||
        (entry?.expiresAt !== undefined && entry.expiresAt <= now)
      ) {
        return undefined;
      }
    }

    try {
      return await this.keyProvider.getPublicKey(authorization.keyId);
    } catch {
      return undefined;
    }
  }

  /**
   * Runs every side-effect-free check: payload
   * version, signature, expiry, and TTL policy.
   * Never touches the nonce store, so callers can
   * run this safely before deciding whether the
   * nonce should be consumed at all — for example,
   * a caller that has an additional check of its own
   * (such as a content-hash comparison) to run before
   * the nonce is burned.
   */
  async verifyChecks(
    authorization: SignedExecutionAuthorization,
    now: Date = new Date(),
  ): Promise<EnvelopeChecksResult> {
    const resolvedKey = await this.resolveKey(authorization, now);

    //
    // keyValid is only meaningful (and only reported) when a
    // keyProvider was supplied at all -- see resolveKey(). Without
    // one, resolvedKey is always this.publicKey and keyValid stays
    // absent from the result, matching today's behavior exactly.
    //
    const keyValid =
      this.keyProvider === undefined ? undefined : resolvedKey !== undefined;

    const { checks } =
      resolvedKey !== undefined
        ? await this.authorizationVerifier.verify(
            authorization,
            resolvedKey,
            now,
          )
        : {
            checks: {
              versionSupported: false,
              signatureVerified: false,
              notExpired: false,
            },
          };

    const { versionSupported, signatureVerified, notExpired } = checks;

    const ttlSeconds =
      (Date.parse(authorization.payload.expiresAt) -
        Date.parse(authorization.payload.authorizedAt)) /
      1000;

    const ttlWithinPolicy =
      Number.isFinite(ttlSeconds) && ttlSeconds <= this.maxTtlSeconds;

    return {
      passed:
        keyValid !== false &&
        versionSupported &&
        signatureVerified &&
        notExpired &&
        ttlWithinPolicy,

      checks: {
        ...(keyValid === undefined ? {} : { keyValid }),
        versionSupported,
        signatureVerified,
        notExpired,
        ttlWithinPolicy,
      },
    };
  }

  /**
   * Consumes the envelope's nonce against this
   * verifier's NonceStore. This is the only check
   * with a side effect, so it is a separate method
   * from verifyChecks: callers MUST only call this
   * after every side-effect-free check has passed —
   * otherwise a forged or expired envelope could burn
   * the nonce and cause the legitimate request to be
   * rejected (see verify() below for the safe
   * composition).
   */
  async consumeNonce(
    authorization: SignedExecutionAuthorization,
  ): Promise<boolean> {
    return this.nonceStore.checkAndRecord(
      authorization.payload.nonce,
      authorization.payload.expiresAt,
    );
  }

  /**
   * Verifies signature, expiry, and TTL policy, then
   * — only if all three passed — consumes the nonce.
   * This is the safe composition of verifyChecks() and
   * consumeNonce(): a forged or expired envelope must
   * not burn a nonce, otherwise an attacker who
   * observes a nonce in transit could poison it with a
   * forged envelope and cause the legitimate request to
   * be rejected.
   */
  async verify(
    authorization: SignedExecutionAuthorization,
    now: Date = new Date(),
  ): Promise<EnvelopeVerificationResult> {
    const { passed, checks } = await this.verifyChecks(authorization, now);

    const nonceUnseen = passed ? await this.consumeNonce(authorization) : false;

    return {
      valid: passed && nonceUnseen,

      checks: {
        ...checks,
        nonceUnseen,
      },
    };
  }
}
