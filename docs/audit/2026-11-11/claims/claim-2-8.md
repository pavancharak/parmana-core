# 2.8 Signed, Single-Use, Time-Bounded Execution Authorization

Source: CLAIMS.md (commit d1d63c6), lines 225-246.

## Exact claim text

## 2.8 Signed, Single-Use, Time-Bounded Execution Authorization

Every approved execution request carries a cryptographically signed Execution Authorization scoped to one decision, bound to a single-use nonce, and valid only within a bounded time window (Ed25519 by default; ML-DSA-65 / FIPS 204 configurable via SIGNATURE_PROVIDER).

**Scope note (2026-10-27):** single use prevents a second external effect. A replay of an authorization whose execution completed returns the recorded result, and the connector is not called again. A replay while the first attempt is in flight, or after it stopped without recording completion, is refused as unknown (`OUTCOME_UNKNOWN`). Recording covers the gateway path. Known gaps, such as a failure before the connector runs on the `executionControl` path, are listed in `docs/internal/VERIFICATION-GAPS.md` G-125. Part 1 is implemented; provider idempotency keys and reconciliation are not yet built.

Evidence

- AuthorizationSigner

- AuthorizationVerifier

- EnvelopeVerifier

- MemoryNonceStore

- packages/crypto/tests/unit/authorization-envelope.test.ts

- packages/envelope-verifier/tests/unit/envelope-verifier.test.ts

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
