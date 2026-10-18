# Tutorial 99 — Key/Algorithm Binding Guard

## Objective

Show that signing or verifying with key material of the wrong type — an Ed25519 key handed to the ML-DSA-65 (Dilithium3) provider, or vice versa — fails closed with a clear error naming both the expected and actual key type, rather than silently dispatching on the key's own type (`docs/CLAIMS.md` §2.13).

## What You'll Learn

- `node:crypto`'s `sign()`/`verify()` dispatch on the key's own `asymmetricKeyType`, not on which `SignatureProvider` happens to be configured — without a guard, a dilithium3-configured process holding Ed25519 PEMs on disk would silently sign with Ed25519 while labeling the envelope "dilithium3"
- `assertKeyType` (`packages/crypto/src/providers/signature/assertKeyType.ts`) is the guard: both `Ed25519SignatureProvider` and `Dilithium3SignatureProvider` call it before touching `node:crypto`'s `sign()`/`verify()`, on both the signing and verifying side
- The thrown error is a `CryptoError` naming both types (`expected a "ml-dsa-65" key but received "ed25519"`), not a generic or misleading message
- A correctly matched key is completely unaffected — this is a guard, not new overhead on the working path

## Running the Tutorial

```bash
npx tsx examples/tutorials/99-key-algorithm-binding-guard/run.ts
```

Scenario 3 (Ed25519 provider given an ML-DSA-65 key) is skipped automatically on a Node version without ML-DSA-65 support, printing the reason — the same `isMlDsa65Supported()` gate `packages/crypto/tests/unit/signature-provider.test.ts` itself uses. Scenarios 1 and 2 (the reverse direction) never depend on ML-DSA-65 support at all, since generating an Ed25519 key needs nothing conditional.

## Why This Matters

This guard exists specifically for a key-rotation or algorithm-migration window: a deployment moving from Ed25519 to hybrid/post-quantum signing (see Tutorials 13, 51, 52) could otherwise mix up which key file goes with which provider without any error until an independent verifier — using the correct key/algorithm pairing — rejects a signature that was never actually produced the way it claimed to be. Failing closed at sign time, naming both types, catches the misconfiguration immediately instead of shipping a mislabeled artifact.

## Next Tutorial

Continue with **Tutorial 100 — Authorization Is Caller-Type-Agnostic**.
