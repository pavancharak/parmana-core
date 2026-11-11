# 3.27 The Server Distrusts eMudhra's emSign Roots at Startup (Scoped, 2026-10-23)

Source: CLAIMS.md (commit d1d63c6), lines 2067-2084.

## Exact claim text

## 3.27 The Server Distrusts eMudhra's emSign Roots at Startup (Scoped, 2026-10-23)

**Claim.** Every server process removes eMudhra's four emSign root certificates (Root CA G1, ECC Root CA G3, Root CA C1, ECC Root CA C3), matched by SHA-256 fingerprint, from its default CA list before any outbound TLS connection. A certificate issued from the compromised eMudhra intermediate keys (G-124) is therefore refused by `fetch`, `https`, the Postgres driver and the AWS SDK, whatever Node version runs the server. A Node version that cannot set the default CA list stops the server from starting.

**Evidence.**

- `packages/api/src/bootstrap/distrustCompromisedRoots.ts`, called first in `api/index.ts` (Vercel) and `packages/api/src/server.ts` (Docker and self hosted).
- `packages/api/tests/unit/distrustCompromisedRoots.test.ts`: only emSign roots are named, exactly those are removed and every other root kept, and the result is idempotent. Forcing the filter to keep everything fails two of its three tests.
- Checked on Node 24.21.0 against a local HTTPS server signed by a throwaway root: with the root in the default list, `fetch` and `https` both connected; with it removed, both refused with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, each in a fresh process.
- Production, 2026-10-23: `{"event":"runtime","node":"v24.21.0","openssl":"3.5.7","distrustedRootsRemoved":4}`, followed by normal startup.
- The published image `server-v1.0.1` (3.18) includes it.

**Limits.**

- It removes trust in four roots, not in the eight intermediates alone: a legitimate server whose certificate chains to an emSign root cannot be reached. None of the systems the server calls uses one.
- It covers the server's own outbound connections. The SDKs and connector endpoints run in their users' processes and rely on those runtimes; Python SDK users should update certifi to 2026.10.19 or later.
- It does not check certificate revocation in general; it answers this one compromise.


## Cited evidence paths

- `api/index.ts`: EXISTS
- `packages/api/src/bootstrap/distrustCompromisedRoots.ts`: EXISTS
- `packages/api/src/server.ts`: EXISTS
- `packages/api/tests/unit/distrustCompromisedRoots.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/distrustCompromisedRoots.test.ts` | passed | 4 | 4 | 0 |
