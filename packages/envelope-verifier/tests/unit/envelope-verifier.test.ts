import { generateKeyPairSync } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import {
  AuthorizationSigner,
  CryptoBootstrap,
  type KeyExpiryEntry,
  type KeyExpiryStore,
  type KeyProvider,
  type KeyMetadata,
} from "@parmana/crypto";

import type {
  ExecutableContent,
  SignedExecutionAuthorization,
} from "@parmana/shared";

import { EnvelopeVerifier } from "../../src/EnvelopeVerifier.js";
import { MemoryNonceStore } from "../../src/MemoryNonceStore.js";
import { requireParmanaAuthorization } from "../../src/express.js";

const crypto = CryptoBootstrap.create();

function generateKeyPair() {
  return generateKeyPairSync("ed25519");
}

const SAMPLE_EXECUTABLE_CONTENT: ExecutableContent = {
  businessTransactionId: "txn-1",
  action: "TransferFunds",
  target: "account/12345",
  parameters: { amount: 100 },
};

async function signAuthorization(
  privateKey: ReturnType<typeof generateKeyPair>["privateKey"],
  ttlSeconds = 60,
  keyId = "key-1",
): Promise<SignedExecutionAuthorization> {
  const signer = new AuthorizationSigner(crypto);

  return signer.sign(
    {
      decisionId: "decision-1",
      businessTransactionId: "txn-1",
      policyName: "policy-a",
      policyVersion: "1.0.0",
      executableContent: SAMPLE_EXECUTABLE_CONTENT,
    },
    privateKey,
    keyId,
    ttlSeconds,
  );
}

/**
 * In-memory KeyProvider test double, keyed by keyId.
 */
class MapKeyProvider implements KeyProvider {
  constructor(
    private readonly publicKeys: Map<
      string,
      ReturnType<typeof generateKeyPair>["publicKey"]
    >,
  ) {}

  async getMetadata(keyId: string): Promise<KeyMetadata> {
    return { keyId, algorithm: "ed25519" };
  }

  async getPrivateKey(): Promise<never> {
    throw new Error("not implemented for this test double");
  }

  async getPublicKey(
    keyId: string,
  ): Promise<ReturnType<typeof generateKeyPair>["publicKey"]> {
    const key = this.publicKeys.get(keyId);

    if (key === undefined) {
      throw new Error(`Key not found: ${keyId}`);
    }

    return key;
  }

  async hasKey(keyId: string): Promise<boolean> {
    return this.publicKeys.has(keyId);
  }
}

/**
 * In-memory KeyExpiryStore test double, keyed by keyId.
 */
class MapKeyExpiryStore implements KeyExpiryStore {
  constructor(private readonly entries: Map<string, KeyExpiryEntry>) {}

  async get(keyId: string): Promise<KeyExpiryEntry | undefined> {
    return this.entries.get(keyId);
  }
}

describe("EnvelopeVerifier", () => {
  it("accepts a valid first-use envelope", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.notExpired).toBe(true);
    expect(result.checks.ttlWithinPolicy).toBe(true);
    expect(result.checks.nonceUnseen).toBe(true);
  });

  it("rejects a second use of the same nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const first = await verifier.verify(signed);
    expect(first.valid).toBe(true);

    const second = await verifier.verify(signed);

    expect(second.valid).toBe(false);
    expect(second.checks.nonceUnseen).toBe(false);
    expect(second.checks.signatureVerified).toBe(true);
    expect(second.checks.notExpired).toBe(true);
    expect(second.checks.ttlWithinPolicy).toBe(true);
  });

  it("under two concurrent verify() calls with one nonce, exactly one succeeds (deterministic, not flaky)", async () => {
    // MemoryNonceStore.checkAndRecord() is async but has no await between
    // its check and its set — Node's run-to-completion semantics mean two
    // calls issued via Promise.all cannot interleave inside that
    // synchronous prefix, so this is deterministic, not probabilistic.
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const [first, second] = await Promise.all([
      verifier.verify(signed),
      verifier.verify(signed),
    ]);

    const valid = [first, second].filter((r) => r.valid);
    const invalid = [first, second].filter((r) => !r.valid);

    expect(valid).toHaveLength(1);
    expect(invalid).toHaveLength(1);
    expect(invalid[0]?.checks.nonceUnseen).toBe(false);
  });

  it("verifyChecks() never consumes the nonce, even on failure", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "decision-2",
      },
    };

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    // A failing call to verifyChecks() alone (not verify())
    // must not touch the nonce store at all.
    const checksResult = await verifier.verifyChecks(tampered);

    expect(checksResult.passed).toBe(false);
    expect(checksResult.checks.signatureVerified).toBe(false);

    // The original, untampered envelope must still be
    // accepted afterward — proving the failed verifyChecks()
    // call left the nonce store untouched.
    const originalResult = await verifier.verify(signed);

    expect(originalResult.valid).toBe(true);
    expect(originalResult.checks.nonceUnseen).toBe(true);
  });

  it("a forged envelope does not burn the nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "decision-2",
      },
    };

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const forgedResult = await verifier.verify(tampered);

    expect(forgedResult.valid).toBe(false);
    expect(forgedResult.checks.signatureVerified).toBe(false);
    expect(forgedResult.checks.nonceUnseen).toBe(false);

    const originalResult = await verifier.verify(signed);

    expect(originalResult.valid).toBe(true);
    expect(originalResult.checks.nonceUnseen).toBe(true);
  });

  it("an expired envelope does not burn the nonce", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60);

    const nonceStore = new MemoryNonceStore();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore,
    });

    const farFuture = new Date(
      Date.parse(signed.payload.authorizedAt) + 120_000,
    );

    const expiredResult = await verifier.verify(signed, farFuture);

    expect(expiredResult.valid).toBe(false);
    expect(expiredResult.checks.signatureVerified).toBe(true);
    expect(expiredResult.checks.notExpired).toBe(false);
    expect(expiredResult.checks.nonceUnseen).toBe(false);

    const withinValidity = new Date(
      Date.parse(signed.payload.authorizedAt) + 1_000,
    );

    const originalResult = await verifier.verify(signed, withinValidity);

    expect(originalResult.valid).toBe(true);
    expect(originalResult.checks.nonceUnseen).toBe(true);
  });

  it("treats the exact expiresAt instant as expired (boundary is exclusive, not inclusive)", async () => {
    // Previously untested: existing expiry tests only used "clearly
    // expired" (+120s past a 60s TTL) and "clearly valid" (+1s) instants,
    // never the exact boundary. AuthorizationVerifier's comparison is
    // `now.getTime() < expiry` (strict <), so at now === expiresAt
    // exactly, the envelope must already read as expired.
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const exactExpiry = new Date(Date.parse(signed.payload.expiresAt));

    const result = await verifier.verify(signed, exactExpiry);

    expect(result.valid).toBe(false);
    expect(result.checks.notExpired).toBe(false);
    expect(result.checks.signatureVerified).toBe(true);

    // One millisecond before the boundary must still be valid, confirming
    // this isn't a wider off-by-one, just the exact instant.
    const oneMsBeforeExpiry = new Date(exactExpiry.getTime() - 1);

    const stillValidResult = await verifier.verify(signed, oneMsBeforeExpiry);

    expect(stillValidResult.checks.notExpired).toBe(true);
  });

  it("rejects an envelope whose TTL exceeds maxTtlSeconds", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 3600);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      maxTtlSeconds: 300,
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(false);
    expect(result.checks.ttlWithinPolicy).toBe(false);
    expect(result.checks.signatureVerified).toBe(true);
    expect(result.checks.nonceUnseen).toBe(false);
  });

  it("MemoryNonceStore purges expired entries past the size threshold", async () => {
    const nonceStore = new MemoryNonceStore();

    const past = new Date(Date.now() - 1_000).toISOString();
    const future = new Date(Date.now() + 3_600_000).toISOString();

    // 10,000 already-expired entries.
    for (let i = 0; i < 10_000; i++) {
      await nonceStore.checkAndRecord(`expired-${i}`, past);
    }

    expect(nonceStore.size).toBe(10_000);

    // One more live entry pushes the store past the 10,000
    // threshold, which should trigger a purge on THIS call.
    await nonceStore.checkAndRecord("live-nonce", future);

    // All 10,000 expired entries should have been purged;
    // only the live one remains.
    expect(nonceStore.size).toBe(1);

    // The live nonce is still recorded and still rejects reuse.
    expect(await nonceStore.checkAndRecord("live-nonce", future)).toBe(false);
  });

  it("accepts a TTL exactly at maxTtlSeconds and rejects one second more", async () => {
    // Found by mutation testing: `<=` could be turned into `<` without a
    // test failing. The boundary is inclusive.
    const { privateKey, publicKey } = generateKeyPair();
    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
      maxTtlSeconds: 300,
    });

    const atLimit = await verifier.verifyChecks(
      await signAuthorization(privateKey, 300),
    );
    expect(atLimit.checks.ttlWithinPolicy).toBe(true);
    expect(atLimit.passed).toBe(true);

    const overLimit = await verifier.verifyChecks(
      await signAuthorization(privateKey, 301),
    );
    expect(overLimit.checks.ttlWithinPolicy).toBe(false);
    expect(overLimit.passed).toBe(false);
  });

  it("MemoryNonceStore purges an entry expiring at exactly now, and keeps one expiring a millisecond later", async () => {
    // Found by mutation testing: the purge boundary (`expiry <= now`) was
    // untested.
    const now = Date.UTC(2026, 9, 5, 12, 0, 0);
    vi.useFakeTimers({ now });
    try {
      const nonceStore = new MemoryNonceStore();
      const exactlyNow = new Date(now).toISOString();
      for (let i = 0; i < 9_999; i++) {
        await nonceStore.checkAndRecord(`at-now-${i}`, exactlyNow);
      }
      await nonceStore.checkAndRecord(
        "one-ms-later",
        new Date(now + 1).toISOString(),
      );
      expect(nonceStore.size).toBe(10_000);

      // Crossing the threshold purges: every entry expiring at exactly
      // now goes, the one expiring a millisecond later stays.
      await nonceStore.checkAndRecord(
        "live-nonce",
        new Date(now + 3_600_000).toISOString(),
      );
      expect(nonceStore.size).toBe(2);
      expect(
        await nonceStore.checkAndRecord(
          "one-ms-later",
          new Date(now + 1).toISOString(),
        ),
      ).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("EnvelopeVerifier keyId-aware verification (Gap 2A)", () => {
  it("resolves the public key via keyProvider using the authorization's own keyId", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "rotated-key");

    const keyProvider = new MapKeyProvider(
      new Map([["rotated-key", publicKey]]),
    );

    const verifier = new EnvelopeVerifier({
      // Deliberately a different (unrelated) key: proves resolution
      // actually goes through keyProvider, not this fallback.
      publicKey: generateKeyPair().publicKey,
      keyProvider,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(true);
    expect(result.checks.keyValid).toBe(true);
    expect(result.checks.signatureVerified).toBe(true);
  });

  it("fails closed when keyProvider has no key for the authorization's keyId", async () => {
    const { privateKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "unknown-key");

    const keyProvider = new MapKeyProvider(new Map());

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(false);
    expect(result.checks.keyValid).toBe(false);
    expect(result.checks.signatureVerified).toBe(false);
    expect(result.checks.nonceUnseen).toBe(false);
  });

  it("fails closed when the resolved key is expired per keyExpiryStore", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "expiring-key");

    const keyProvider = new MapKeyProvider(
      new Map([["expiring-key", publicKey]]),
    );

    const keyExpiryStore = new MapKeyExpiryStore(
      new Map([["expiring-key", { expiresAt: new Date(Date.now() - 1_000) }]]),
    );

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider,
      keyExpiryStore,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(false);
    expect(result.checks.keyValid).toBe(false);
  });

  it("fails closed when the resolved key is revoked per keyExpiryStore", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "revoked-key");

    const keyProvider = new MapKeyProvider(
      new Map([["revoked-key", publicKey]]),
    );

    const keyExpiryStore = new MapKeyExpiryStore(
      new Map([["revoked-key", { revoked: true }]]),
    );

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider,
      keyExpiryStore,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(false);
    expect(result.checks.keyValid).toBe(false);
  });

  it("rejects a key expiring at exactly now and accepts one expiring a millisecond later", async () => {
    // Found by mutation testing: neither a key with a future expiry nor
    // the exact expiry instant was tested. A key is expired from its
    // expiresAt instant on, the same convention as authorizations.
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "dated-key");
    const now = new Date(Date.parse(signed.payload.authorizedAt) + 1_000);
    const keyProvider = new MapKeyProvider(new Map([["dated-key", publicKey]]));

    const verifierWithKeyExpiry = (expiresAt: Date) =>
      new EnvelopeVerifier({
        publicKey: generateKeyPair().publicKey,
        keyProvider,
        keyExpiryStore: new MapKeyExpiryStore(
          new Map([["dated-key", { expiresAt }]]),
        ),
        nonceStore: new MemoryNonceStore(),
      });

    const atExpiry = await verifierWithKeyExpiry(now).verifyChecks(signed, now);
    expect(atExpiry.checks.keyValid).toBe(false);
    expect(atExpiry.passed).toBe(false);

    const beforeExpiry = await verifierWithKeyExpiry(
      new Date(now.getTime() + 1),
    ).verifyChecks(signed, now);
    expect(beforeExpiry.checks.keyValid).toBe(true);
    expect(beforeExpiry.passed).toBe(true);
  });

  it("a keyId with no keyExpiryStore entry is treated as always valid", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey, 60, "unlisted-key");

    const keyProvider = new MapKeyProvider(
      new Map([["unlisted-key", publicKey]]),
    );

    const keyExpiryStore = new MapKeyExpiryStore(new Map());

    const verifier = new EnvelopeVerifier({
      publicKey: generateKeyPair().publicKey,
      keyProvider,
      keyExpiryStore,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(true);
    expect(result.checks.keyValid).toBe(true);
  });

  it("omitting keyProvider preserves today's exact static-publicKey behavior, with keyValid absent", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const result = await verifier.verify(signed);

    expect(result.valid).toBe(true);
    expect(result.checks.keyValid).toBeUndefined();
  });
});

describe("requireParmanaAuthorization", () => {
  function createMockResponse() {
    const res = {
      statusCode: undefined as number | undefined,
      body: undefined as unknown,
      status(code: number) {
        res.statusCode = code;
        return res;
      },
      json(body: unknown) {
        res.body = body;
        return res;
      },
    };

    return res;
  }

  it("returns 401 when the authorization is missing", async () => {
    const { publicKey } = generateKeyPair();

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = { body: {} } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body).toEqual({ error: "authorization required" });
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 401 when the request has no body at all", async () => {
    // Found by mutation testing: only an empty body was tested, not a
    // missing one (no body parser, or a request without a body).
    const { publicKey } = generateKeyPair();
    const middleware = requireParmanaAuthorization(
      new EnvelopeVerifier({ publicKey, nonceStore: new MemoryNonceStore() }),
    );
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      {} as Parameters<typeof middleware>[0],
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 with checks when the authorization is invalid", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const tampered: SignedExecutionAuthorization = {
      ...signed,
      payload: {
        ...signed.payload,
        decisionId: "tampered",
      },
    };

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = {
      body: { authorization: tampered },
    } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(res.statusCode).toBe(403);
    expect(res.body).toMatchObject({
      error: "authorization invalid",
      checks: { signatureVerified: false },
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches the result and calls next() when valid", async () => {
    const { privateKey, publicKey } = generateKeyPair();
    const signed = await signAuthorization(privateKey);

    const verifier = new EnvelopeVerifier({
      publicKey,
      nonceStore: new MemoryNonceStore(),
    });

    const middleware = requireParmanaAuthorization(verifier);

    const req = {
      body: { authorization: signed },
    } as Parameters<typeof middleware>[0];
    const res = createMockResponse();
    const next = vi.fn();

    await middleware(
      req,
      res as unknown as Parameters<typeof middleware>[1],
      next,
    );

    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBeUndefined();
    expect(req.parmanaAuthorization?.valid).toBe(true);
  });
});
