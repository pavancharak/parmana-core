# Tutorial 70 — HubSpot Policy Denial

## Objective

Attempt to move a deal out of a terminal `closedlost` pipeline stage, and confirm policy rejects it — with the deal left completely untouched on HubSpot.

## What You'll Learn

- `hubspot-deal-update`'s policy has an explicit `reject-stage-transition-not-allowed` rule: `dealStageChangeRequested` true plus `dealStageTransitionAllowed` false is always a hard rejection
- The mock server's own state is the proof, exactly like Tutorial 64: after a denial, the deal's `dealstage` property is exactly what it was before
- `ExecutionGate` throws (status 403, code `POLICY_DENIED`) rather than returning a rejected trust record

## Running the Tutorial

```bash
npx tsx examples/tutorials/70-hubspot-policy-denial/run.ts
```

## Why This Matters

Mirrors the denial case in `packages/api/tests/integration/hubspot-deal-update.integration.test.ts`: a `closedlost` deal is terminal in any real sales pipeline, and no caller-declared signal should be able to talk policy into moving it forward. The (mock) HubSpot server's own untouched state after the rejection is the strongest available evidence that denial actually stopped the side effect.

## Next Tutorial

Continue with **Tutorial 71 – HubSpot Signal-State Verification**.
