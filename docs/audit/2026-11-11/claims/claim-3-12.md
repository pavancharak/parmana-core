# 3.12 Retired: separately published verification package

Source: CLAIMS.md (commit d1d63c6), lines 1630-1633.

## Exact claim text

## 3.12 Retired: separately published verification package

A separately published package once shipped signing, verification and canonical-hashing primitives that this repository's `@parmana/crypto` package also builds on. It is no longer in use. This repository does not depend on it, and its records are verified with `@parmana/verifier` (Node) or `parmana-verifier` (Python), or with the in-repository offline verifier in `packages/crypto`.

## Cited evidence paths

- `packages/crypto`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
