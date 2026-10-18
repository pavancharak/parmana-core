# Tutorial 98 — Signal-Freshness Enforcement (G-31)

## Objective

Show that a signed Execution Authorization only proves conditions were true _when it was issued_ — and that `ExecutionGateway`'s `signalsStillCurrent` check lets a receiving system independently confirm those conditions still hold _when it actually executes_, even when signature, expiry, and content hash all still check out.

## What You'll Learn

- `RuntimeEngine.execute()` now signs a `signalsHash` into every `ExecutionAuthorizationPayload` — a canonical hash of the runtime signals (`PolicySignals`) the decision was evaluated against, the direct sibling of the existing `policyContentHash` (Tutorial 34's `ExecutionGateway`, `docs/CLAIMS.md` §2.27)
- `ExecutionGateway` optionally accepts a `SignalStateVerifier` (the same port `@parmana/policy` already defines for pre-authorization checks — see Tutorial 71/82) and independently re-verifies the authorization's declared signals against real-world state _at the execution boundary_, before the connector is ever invoked
- Two receiving systems can hold the exact same authorization, the exact same declared signals, and the exact same `signalsHash` — and still reach different outcomes, because what differs is what each one's own live check finds
- A rejection here (`signalsStillCurrent: false`, `signalDivergence`) is a distinct failure mode from tampering (Tutorial 29) or expiry (Tutorial 27): nothing about the request was forged or altered, the facts it was authorized under simply changed

## Running the Tutorial

```bash
npx tsx examples/tutorials/98-signal-freshness-enforcement/run.ts
```

## Why This Matters

A `SignedExecutionAuthorization` is a portable artifact by design: `packages/shared/src/domain/execution-authorization.ts` documents it as something "enterprise systems should execute" once they've independently verified it, up to `authorizationTtlSeconds`/`maxTtlSeconds` after Parmana signed it — not something that must be consumed the instant it's issued. Before this check existed, an authorization whose declared vendor status, risk exposure, or other conditions had since drifted could still execute, as long as its signature and content hash were untouched. This tutorial's "Receiving System B" is any downstream execution system — a payment processor, an `HttpExecutionSystem`-based deployment — that checks a little later than "Receiving System A" and finds the world has moved on. See `docs/VERIFICATION-GAPS.md` G-31 and `docs/CLAIMS.md` §2.29 for the full narrative and every file touched.

## Next Tutorial

Continue with **Tutorial 99 – Key/Algorithm Binding Guard**.
