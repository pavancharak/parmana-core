# Tutorial 116 — SupabasePolicyRepository (the EROFS fix)

## Objective

Reproduce, hermetically, the real production incident from the night of 2026-09-16 and
its fix: `PolicyChangeApprovalService.approve()` writes the live `policy.json` content via
`PolicyRepository.save()`. `FilePolicyRepository` does that by writing to the local
filesystem — which works for local development and tests, but Vercel's serverless
Functions run on a **read-only** filesystem, so the very first real production approval
attempt failed with `EROFS`. See `docs/CLAIMS.md` §2.26's "Legacy-policy backfill" entry
for the full account, including a second, related bug this same incident surfaced (the
fix in Tutorial 116's own predecessor work — see "Related Tutorials" below).

## What You'll Learn

- **Scenario 1** reproduces the real failure directly: `FilePolicyRepository.save()`
  against a genuinely read-only directory. On platforms where the current user's
  permissions can't be forced read-only via `chmod` (notably Windows, and root on POSIX),
  this scenario reports itself as skipped rather than failing the tutorial — it reflects
  the OS's own permission model, not something this codebase controls. The real `EROFS`
  only reproduces on Vercel's actual read-only filesystem.
- **Scenario 2** exercises the real fix: `SupabasePolicyRepository`
  (`packages/policy/src/SupabasePolicyRepository.ts`), backed by a minimal fake `pg.Pool`
  standing in for a real database connection — the same "fake the one method actually
  called" discipline Tutorial 115 already established for `PostgresRateLimitStore`. No
  network access needed.
- `SupabasePolicyRepository` implements the exact same `PolicyRepository` interface
  `FilePolicyRepository` does (`load`/`save`/`listAll`), so
  `PolicyChangeApprovalService.approve()` needed zero changes to its own logic — only
  `packages/api/src/application.ts`'s repository selection changed, and even that is
  lazy (constructed on first actual use, not at module import time — see "Related
  Tutorials" for why that specific detail mattered).
- `load()` on a policy that was never `save()`d throws `PolicyNotFoundError`, matching
  `FilePolicyRepository`'s own contract exactly.

## Running the Tutorial

```bash
npx tsx examples/tutorials/116-supabase-policy-repository/run.ts
```

Entirely hermetic on the `SupabasePolicyRepository` half (Scenario 2); Scenario 1 uses a
real temp directory and real filesystem permissions, cleaned up automatically, with no
external state left behind either way.

## Why This Matters

All ten (later fourteen) of this system's real production policies had sat
`PENDING_APPROVAL` for a month, untouched, before this session's maker-checker work
finally approved them — meaning the live-policy write path inside
`PolicyChangeApprovalService.approve()` had genuinely never executed against a real,
deployed instance before. The first time it did, it failed immediately. This wasn't a
missed test case for existing code; it was code that had simply never yet run for real,
caught the moment it finally did. The fix generalizes beyond this one incident: any
future deployment target with a read-only or ephemeral filesystem gets the same
Supabase-backed write path automatically, with no per-target special-casing.

## Related Tutorials

[Tutorial 115 - Per-Limiter Rate Limit Stores](../115-per-limiter-rate-limit-stores/README.md) —
same hermetic-fake-Postgres-client discipline, a different real bug from the same
migration window.
