# Tutorial 89 — Readiness Probe

## Objective

Exercise `GET /ready` — an operational readiness probe distinct from `GET /health` — across memory-backed and (genuinely unreachable) Supabase-backed storage configurations.

## What You'll Learn

- Under `NODE_ENV=test`, or with `PARMANA_STORAGE=memory`, `/ready` reports `READY` without ever attempting a database connection — there's nothing external to check, so it doesn't pretend to check it
- With Supabase-backed storage that's genuinely unreachable, `/ready` reports `NOT_READY` with HTTP 503 and a specific `reason` string — not a generic error, and not a false `READY`
- This is a _readiness_ check (is this process's actual configured dependency reachable right now), not a _liveness_ check (`/health`, which only proves the process is running)

## Running the Tutorial

```bash
npx tsx examples/tutorials/89-readiness-probe/run.ts
```

## Why This Matters

An orchestrator (Kubernetes, Fly.io, etc.) uses readiness probes to decide whether to route traffic to an instance. A probe that always reports `READY` regardless of real backend health defeats the entire purpose — traffic gets routed to an instance that can't actually serve it. This tutorial mirrors `packages/api/tests/unit/routes/ready.test.ts`'s three real scenarios against a real listening server.

## Next Tutorial

Continue with **Tutorial 90 – OpenAPI Self-Description**.
