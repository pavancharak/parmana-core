# Tutorial 71 — HubSpot Signal-State Verification

## Objective

Show that `HubSpotSignalStateVerifier` catches a caller who declares `currentDealStage` as if a deal were still early in the pipeline, when the real deal on HubSpot is already in a terminal stage.

## What You'll Learn

- `HubSpotSignalStateVerifier` fetches the real deal (`hubspot:deal-fetch`) and compares it against every verified signal key before policy evaluation ever runs — a G-24 residual closure pattern the now-removed Razorpay connector's own `RazorpaySignalStateVerifier` demonstrated identically
- A single false signal (`currentDealStage`) can cascade: `dealStageTransitionAllowed` is derived from it too, so both come back mismatched in the same rejection
- The rejection names every mismatched signal, not just the first one found

## Running the Tutorial

```bash
npx tsx examples/tutorials/71-hubspot-signal-state-verification/run.ts
```

## Why This Matters

Mirrors the "caller-declared signals misrepresent the real HubSpot deal state" case in `packages/api/tests/integration/hubspot-deal-update.integration.test.ts`: even though the caller's declared signals alone would satisfy every policy rule, the independently fetched real deal state overrides them, and the deal is never touched.

## Next Tutorial

Continue with **Tutorial 72 – HubSpot Approval Artifact**.
