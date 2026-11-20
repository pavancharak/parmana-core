# `@parmana/envelope-verifier`: API reference

[Portal home](../README.md) · [Publishing decision](publishing-envelope-verifier-and-execution-system.md) · [Package README](https://github.com/pavancharak/parmana-core/blob/main/packages/envelope-verifier/README.md)

This page describes the package's public API, as it is exported from `packages/envelope-verifier/src` at version 4.1.1. The package's own README states exactly what a passing verification proves. This page does not repeat those claims; read the README first.

**Requirements:** Node.js 24 or later. Two entry points: `@parmana/envelope-verifier` (the core) and `@parmana/envelope-verifier/express` (an Express middleware, which imports Express types).

## What it verifies

A verifier checks that an execution request was authorized by Parmana. It checks, in order:

1. The payload version is supported.
2. The signature is valid, against the Parmana public key (or the key for the envelope's `keyId`).
3. The envelope has not expired, within a clock allowance of 60 seconds.
4. The envelope's time-to-live is within policy (`maxTtlSeconds`, 300 seconds by default).
5. The nonce has not been used before, which is recorded against a `NonceStore`.

It does not evaluate policy. A passing result means Parmana authorized the request. It does not mean the action was correct.

## `EnvelopeVerifier`

```ts
import { EnvelopeVerifier, MemoryNonceStore } from "@parmana/envelope-verifier";

const verifier = new EnvelopeVerifier({
  publicKey, // a KeyObject: Parmana's public key, supplied by the caller
  nonceStore: new MemoryNonceStore(), // see the production warning below
});

const result = await verifier.verify(authorization);
if (!result.valid) {
  // reject; result.checks says which check failed
}
```

### Options (`EnvelopeVerifierOptions`)

| Option           | Required | Meaning                                                                                                                                                                                     |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `publicKey`      | Yes      | Parmana's public key, as a Node `KeyObject`. The package never reads key material from disk or the network. Used directly when no `keyProvider` is given, and as a fallback when one fails. |
| `nonceStore`     | Yes      | A `NonceStore` that records each nonce. Use a shared, durable store in production.                                                                                                          |
| `keyProvider`    | No       | Resolves the key for each envelope's `keyId`, so a rotated key needs no restart. Without it, `keyValid` is absent from the results.                                                         |
| `keyExpiryStore` | No       | Key expiry and revocation, checked only when `keyProvider` is also given. A key with no entry is treated as valid.                                                                          |
| `maxTtlSeconds`  | No       | The longest allowed `expiresAt - authorizedAt`, in seconds. Default 300.                                                                                                                    |

### Methods

| Method                              | Returns                      | Side effect                                                       |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------- |
| `verify(authorization, now?)`       | `EnvelopeVerificationResult` | Records the nonce, but only if every other check passed.          |
| `verifyChecks(authorization, now?)` | `EnvelopeChecksResult`       | None. Use it to run your own checks before the nonce is recorded. |
| `consumeNonce(authorization)`       | `boolean`                    | Records the nonce. Returns `false` if it was already used.        |

`now` defaults to the current time. Pass it to make a verification reproducible in a test.

**Use `verify()` unless you have a reason not to.** It runs the side-effect-free checks first and records the nonce only if they pass. If you call `consumeNonce()` yourself, call it only after every other check has passed. Otherwise a forged or expired envelope can record a nonce and cause the legitimate request to be rejected.

### Results

`EnvelopeVerificationResult` has `valid` and `checks`. `valid` is true only when every check passed and the nonce was unseen. `checks` has `versionSupported`, `signatureVerified`, `notExpired`, `ttlWithinPolicy` and `nonceUnseen`, and `keyValid` when a `keyProvider` is configured.

`EnvelopeChecksResult` (from `verifyChecks`) has `passed` and the same checks, without `nonceUnseen`.

## `NonceStore` and `MemoryNonceStore`

```ts
interface NonceStore {
  checkAndRecord(nonce: string, expiresAt: string): Promise<boolean>;
}
```

`checkAndRecord` must be atomic: it records the nonce if it is unseen and returns `true`, or returns `false` if the nonce was already seen. A second request with the same nonce must be refused.

**Production warning: `MemoryNonceStore` is for tests and single-process use.** It keeps nonces in memory, so a restart forgets them, and another process cannot see them. In a deployment with more than one process, or with restarts, an attacker can replay an envelope that another process has not seen. Implement `NonceStore` against shared, durable storage for production. The package README covers the operational requirements.

## Express middleware

The `./express` entry point exports `requireParmanaAuthorization(verifier)`. It reads `authorization` from the JSON request body and:

- returns `401` with `{ "error": "authorization required" }` when the body has no `authorization`;
- returns `403` with `{ "error": "authorization invalid", "checks": ... }` when verification fails;
- otherwise sets `req.parmanaAuthorization` to the result and calls `next()`.

It depends on Express types, so import it only if you use Express.

## What is not in this package

- No policy evaluation.
- No key storage. The caller supplies the public key or a `keyProvider`.
- No durable nonce store. The caller supplies one.

## Before the first public publish

This page was written from the source on 2026-11-20. The package has not been published, and the surface above is what 4.1.1 exports. Re-check it against the source before each release.
