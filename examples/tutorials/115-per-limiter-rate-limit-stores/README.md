# Tutorial 115 — Per-Limiter Rate Limit Stores

## Objective

Reproduce a real, pre-existing bug found and fixed the same night as the KMS migration
(unrelated to KMS itself): `createApp()` sharing one `PostgresRateLimitStore` instance
between the `/execute` and `/health`,`/ready` rate limiters, which
`express-rate-limit`'s own documented contract disallows. Mirrors
`docs/VERIFICATION-GAPS.md` G-49 and
item 5 of the 2026-09-15 KMS migration troubleshooting guide (in git history) — **including
a correction to the initial diagnosis**, kept visible rather than silently rewritten.

## What You'll Learn

- `express-rate-limit` v8 documents that a `Store` instance must not back more than one
  rate limiter. `createApp()` (`packages/api/src/app.ts`) used to construct one
  `PostgresRateLimitStore` and pass it to both `createHealthReadyRateLimiter` and
  `createExecuteRateLimiter`.
- **What this validation actually does when violated is a real, corrected lesson in its
  own right.** It was first assumed (in this project's own documentation, corrected
  after this tutorial was built) that this crashed the whole request — inferred from
  seeing the `ERR_ERL_STORE_REUSE` log line next to a real HTTP 500. Reading the
  installed library's actual source shows every validation is wrapped in a try/catch
  that only _logs_ the violation (`console.error`) and never re-throws. Scenario 1 below
  reproduces the real behavior directly: a logged warning, not a thrown exception. The
  500 that request returned was actually caused by a completely different, still-unfixed
  bug (Tutorial 114's signing/verification divergence) logged in the same request.
- The fix (two separate `Store` instances, each with a distinct `prefix`) is still
  correct and worth having, independent of the corrected causal story — it's the
  library's own documented usage contract, and a future version (or a stricter
  `validate` config) could make this fatal for real.
- `prefix` is not an invented mechanism: `express-rate-limit`'s own `Store` type
  declares an optional `prefix?: string`, used by its own double-count/reuse detection.
  Naming the field exactly `prefix` and making it **public** (not a private
  implementation detail) is what lets the library recognize two differently-prefixed
  stores as legitimately distinct.

## Running the Tutorial

```bash
npx tsx examples/tutorials/115-per-limiter-rate-limit-stores/run.ts
```

Entirely hermetic — a minimal fake `pg.Pool` stands in for a real database connection;
this tutorial exercises the real `PostgresRateLimitStore`, `createExecuteRateLimiter`,
and `createHealthReadyRateLimiter`, and the real installed `express-rate-limit`
library's actual validation behavior, with no network access needed.

## Why This Matters

Two lessons, not one. The narrow one: sharing a `Store` instance across limiters is a
real contract violation, fixed correctly with per-limiter instances and prefixes. The
broader one, arguably more valuable: **a log line appearing near a failure is not
evidence that it caused the failure.** This project's own documentation initially
conflated the two, stated the causal claim as fact, and only caught the error while
building this tutorial and checking the claim against the library's actual source. The
correction is kept visible in `docs/VERIFICATION-GAPS.md` G-49,
the 2026-09-15 KMS migration troubleshooting guide (in git history), and here — not
quietly rewritten — because the mistake itself (assuming causation from proximity in a
log) is exactly the kind of thing worth remembering for the next incident.

## Related Tutorials

[Tutorial 113 - KMS Key ID Resolution](../113-kms-key-id-resolution/README.md) ·
[Tutorial 114 - Signing and Verification Must Agree on One Key Source](../114-signing-verification-key-agreement/README.md)
