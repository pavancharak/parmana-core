# 2.10 Rejection of Forged, Tampered, Expired, and Replayed Authorizations

Source: CLAIMS.md (commit d1d63c6), lines 259-268.

## Exact claim text

## 2.10 Rejection of Forged, Tampered, Expired, and Replayed Authorizations

The receiving system rejects a forged signature, a tampered payload, an expired envelope, and a replayed (previously accepted) envelope. Replay protection is scoped to whichever NonceStore instance performs the check; see 3.2 below.

Evidence

- packages/envelope-verifier/tests/unit/envelope-verifier.test.ts: "a forged envelope does not burn the nonce", "an expired envelope does not burn the nonce", "rejects a second use of the same nonce", "treats the exact expiresAt instant as expired (boundary is exclusive, not inclusive)", "under two concurrent verify() calls with one nonce, exactly one succeeds (deterministic, not flaky)"

---

## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
