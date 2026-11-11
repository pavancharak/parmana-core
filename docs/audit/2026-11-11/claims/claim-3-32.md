# 3.32 The Runtime Decides Without Executing, With Unchanged Behaviour (Scoped, 2026-11-05)

Source: CLAIMS.md (commit d1d63c6), lines 2154-2167.

## Exact claim text

## 3.32 The Runtime Decides Without Executing, With Unchanged Behaviour (Scoped, 2026-11-05)

**Claim.** `RuntimeEngine.decide()` runs every decision step of `execute()` (policy load, governance and binding checks, authority, business validation, policy evaluation, the refusal record and the enforcement gate) and returns the decision without authorizing it or sending anything to a connector. `execute()` calls `decide()` and then does what it did before. The split moved code without changing its order.

**Evidence.**

- `packages/runtime/src/RuntimeEngine.ts`: `decide()` and `execute()`.
- Run on 2026-11-05: the runtime package's 217 tests in 33 files pass, including the tests that cover `execute()` end to end.

**Limits.**

- No test calls `decide()` directly yet. Its behaviour is covered only through `execute()`.
- The inbound check does not call `decide()` yet, so the policy is still not evaluated for inbound requests (G-142).


## Cited evidence paths

- `packages/runtime/src/RuntimeEngine.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
