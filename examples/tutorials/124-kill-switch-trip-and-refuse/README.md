# Tutorial 124 — Kill Switch: Trip and Refuse

## Objective

Show that an operator can stop every new request in a Parmana deployment with one call, that the stop is refused with a specific error, that status still answers while the switch is on, and that a reset lets requests through again.

## What You'll Learn

- A trip with `kill-switch:trip` refuses `POST /execute` with `503` and the code `KILL_SWITCH_ACTIVE`.
- The trip, reset, status and probe routes stay reachable while the switch is on, so the switch can always be cleared and checked.
- Status echoes the nonce the caller sends and reports `signed: false` until a signing key exists.
- A key without the trip capability cannot stop the system.

## Running the Tutorial

```bash
npx tsx examples/tutorials/124-kill-switch-trip-and-refuse/run.ts
```

The run starts the app on a random local port with in-memory stores, and it prints a PASS or FAIL for each check. It exits with an error if any check fails.

## Why This Matters

The operator stop takes effect at once. The switch refuses new requests before they reach the policy engine, and it fails closed: if its state cannot be read, requests are refused.

## Limits

A stop does not recall an action that was already released. A tool reached directly, without going through Parmana, is not stopped. The operator guide in the documentation lists these limits.
