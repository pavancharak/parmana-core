# 2.13 Key/Algorithm Binding Guard

Source: CLAIMS.md (commit d1d63c6), lines 293-306.

## Exact claim text

## 2.13 Key/Algorithm Binding Guard

Signing or verifying with key material of the wrong type (for example, an Ed25519 key against the configured ML-DSA-65 provider, or vice versa) fails closed with a clear error naming both the expected and actual key type, rather than silently dispatching on the key's own type.

Evidence

- assertKeyType (used by Ed25519SignatureProvider and Dilithium3SignatureProvider)

- packages/crypto/tests/unit/signature-provider.test.ts

- examples/tutorials/99-key-algorithm-binding-guard/run.ts (runnable narrative: both mismatch directions, plus a correctly matched key still working)

---


## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
