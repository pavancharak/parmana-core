# 3.2 Fleet-Wide Single-Use Requires a Shared NonceStore

Source: CLAIMS.md (commit d1d63c6), lines 1566-1583.

## Exact claim text

## 3.2 Fleet-Wide Single-Use Requires a Shared NonceStore

Single-use enforcement of an authorization's nonce is scoped to whichever NonceStore instance performs the check. If multiple independent receiving systems, or multiple instances of the same system, each use their own NonceStore, the same authorization can be accepted once per instance. Fleet-wide single-use requires every instance to share one persistent NonceStore that survives a process restart, not a per-process, in-memory one.

Parmana's own production gateway does this by default. `packages/api/src/bootstrap/createNonceStore.ts` wires in `PostgresNonceStore` (`packages/storage/src/postgres/PostgresNonceStore.ts`), a durable, PostgreSQL-backed NonceStore shared across every process pointed at the same database, and fails closed at startup if it is not configured, rather than silently falling back to a per-process `MemoryNonceStore`. A receiving system that does not share a persistent NonceStore (whether by choice, misconfiguration, or because it is not Parmana's own gateway) still has its exposure window bounded by the envelope's short TTL, not unlimited. This is the general, deployment-agnostic version of the claim, and still the correct one for any `@parmana/envelope-verifier` integrator supplying their own NonceStore choice; `MemoryNonceStore` remains available and correct for tests.

Evidence

- NonceStore / MemoryNonceStore / PostgresNonceStore

- packages/api/src/bootstrap/createNonceStore.ts (production wiring; fails closed when the PostgreSQL database is not configured, never falls back to in-memory)

- packages/storage/tests/integration/postgres-nonce-store.integration.test.ts: "a nonce consumed through one store instance is still consumed by a fresh instance against the same backing" (the fleet-sharing / restart-survival proof) and "two simultaneous checkAndRecord calls for the same nonce: exactly one succeeds" (a real concurrent-INSERT race against Postgres, not a simulated one)

- packages/envelope-verifier/README.md ("Claims", "PRODUCTION WARNING: MemoryNonceStore")

---

## Cited evidence paths

- `packages/api/src/bootstrap/createNonceStore.ts`: EXISTS
- `packages/storage/src/postgres/PostgresNonceStore.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
