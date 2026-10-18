# Tutorial 91 — Graceful Shutdown

## Objective

Exercise `createGracefulShutdown()` directly: the SIGTERM/SIGINT handler that stops accepting new connections, lets in-flight requests finish, and force-exits after a hard timeout if the server never actually closes.

## What You'll Learn

- A clean `server.close()` exits `0`; a `close()` that reports an error exits `1` — the process's own exit code reflects whether shutdown was actually clean
- A second signal arriving while already shutting down is a no-op — `close()` is never called twice, so an impatient orchestrator sending SIGTERM then SIGINT can't trigger a double-close race
- A server that never calls its `close()` callback (a permanently hung request) force-exits after the configured timeout — guarding against shutdown blocking forever
- The force-exit timer is genuinely cleared on a clean close, not just "superseded" — waiting past the timeout afterward proves `exit()` was never called a second time

## Running the Tutorial

```bash
npx tsx examples/tutorials/91-graceful-shutdown/run.ts
```

## Why This Matters

This is the standard "drain, don't drop" shape a PaaS orchestrator (Fly.io, Kubernetes) expects before it force-kills a container. Getting it wrong in either direction is costly: exiting too eagerly drops in-flight requests, while never force-exiting on a hung close leaves the process relying entirely on the platform's own (usually longer) kill timeout. This tutorial mirrors `packages/api/tests/unit/bootstrap/create-graceful-shutdown.test.ts`'s scenarios using real (short) timers instead of a test framework's fake ones.

## Next Tutorial

Continue with **Tutorial 92 – Public API Boundary**.
