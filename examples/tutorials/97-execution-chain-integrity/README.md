# Tutorial 97 — Execution Chain Integrity

## Objective

Exercise `ExecutionChainCrypto` and `FileKeyExpiryStore` (`@parmana/crypto`) directly: the signed hash chain linking every Execution belonging to one business transaction, and the sidecar mechanism that lets a compromised or rotated key be marked expired/revoked without waiting for every signature it ever produced to be individually re-checked.

## What You'll Learn

- `ExecutionChainCrypto.chain()` computes a `chainHash` and `chainSignature` over one Execution's canonical content plus its predecessor's `chainHash` — a plain SHA-256 hash alone gives no protection against an actor with database `UPDATE` rights, since they could just recompute a fresh valid hash over tampered content; signing closes that, because forging a replacement link also requires Parmana's private key
- `ExecutionChainCrypto.verifyChain()` walks a list of Executions in append order and catches two distinct failure modes: a single entry's own content not matching its signed hash, and a `previousChainHash` that doesn't actually reference the prior entry — this tutorial demonstrates the first by tampering with an already-chained Execution's `status` after the fact
- `FileKeyExpiryStore` reads one small `key-expiry.json` sidecar file beside the PEM key files a deployment already has (`<keyDirectory>/key-expiry.json`); a keyId absent from the file — the default for every key today — means "no expiry, always valid," so adopting key expiry is opt-in per key, not a breaking change for existing deployments
- `EnvelopeVerifier` consults `KeyExpiryStore` (when supplied) before trusting a signature, and fails closed on a missing key, an unreadable key, or an expired/revoked one — this is the mechanism that would let a real key-compromise incident revoke a key immediately, rather than only by rotating it and hoping every verifier picks up the new key in time (see `docs/CLAIMS.md`'s "Key Compromise Notice" for the incident this generalizes from)

## Running the Tutorial

```bash
npx tsx examples/tutorials/97-execution-chain-integrity/run.ts
```

This tutorial uses an isolated temp key directory for the `KeyExpiry` portion (copies of the repository's own `keys/default.*.pem`, plus a synthetic `key-expiry.json`) rather than writing into `keys/` itself, so it never mutates real key material.

## Why This Matters

Both mechanisms exist because a signature alone answers "did Parmana sign this," not "is this signature still trustworthy right now" or "is this the record that was actually appended, in the order it was appended." `ExecutionChainCrypto` is exercised in every real execution today — see `packages/runtime/src/services/execution-service.ts` and `packages/runtime/src/services/verification-service.ts` — this tutorial isolates it from the full runtime pipeline so the chaining and tamper-detection behavior can be seen on its own. `FileKeyExpiryStore` is consulted from `EnvelopeVerifier` (`packages/envelope-verifier/src/EnvelopeVerifier.ts`) and wired through `createExecutionGateway.ts`/`ExecutionGateway.ts` in the API's production bootstrap.

## Next Tutorial

Continue with **Tutorial 98 – Signal-Freshness Enforcement (G-31)**.
