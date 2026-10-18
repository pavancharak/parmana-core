# Tutorial 79 — Storage Backend Selection

## Objective

Exercise `StorageFactory.createFromEnvironment()` directly: the decision function that picks between an in-memory and a real Supabase-backed storage provider from environment variables alone — and never constructs a live Supabase client under `NODE_ENV=test`, no matter what else is configured.

## What You'll Learn

- `NODE_ENV=test` always wins: even `PARMANA_STORAGE=supabase` with a syntactically valid `DATABASE_URL` present still resolves to `MemoryStorageProvider` — this is the G-15 test-safety fix, preventing a test run from ever touching a live database by accident
- Outside test, `PARMANA_STORAGE=supabase` with no `DATABASE_URL` fails immediately with a named, actionable error — not a generic `supabaseUrl is required` crash from deep inside a client library
- `PARMANA_STORAGE=memory` is a legitimate, explicit production choice too, not just a test fallback

## Running the Tutorial

```bash
npx tsx examples/tutorials/79-storage-backend-selection/run.ts
```

## Why This Matters

A factory function that silently falls back to a working-but-wrong backend, or crashes with an unhelpful error from a third-party library, makes misconfiguration hard to diagnose. This tutorial exercises the real decision matrix — mirroring `packages/storage/tests/unit/storage-factory.test.ts` — across every combination that actually matters.

## Next Tutorial

Continue with **Tutorial 80 – Fail-Closed Config Validation**.
