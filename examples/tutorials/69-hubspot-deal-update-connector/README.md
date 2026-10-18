# Tutorial 69 — HubSpot Deal Update Connector

## Objective

Execute a real HubSpot deal update through the same production composition (`createExecutionSystem` + `createApplication`) `server.ts` itself calls, pointed at a hermetic `MockHubSpotServer` instead of HubSpot's live API.

## What You'll Learn

- The full path from a `BusinessTransaction` with `intent.action = "hubspot:deal-update"` through policy evaluation to an actual `PATCH` call against the connector
- That an allowed dealstage transition results in a real (mocked) side effect: the deal's `dealstage` property actually changes on the HubSpot server
- How `NODE_ENV=test` auto-resolves the HubSpot credential to a built-in placeholder token — `.env` sets `TEST_HUBSPOT_PRIVATE_APP_TOKEN` to an empty string rather than leaving it unset, so it must be explicitly overridden or the fallback placeholder never triggers (the now-removed Razorpay connector had the identical `.env` empty-string gotcha for its own test token)

## Running the Tutorial

```bash
npx tsx examples/tutorials/69-hubspot-deal-update-connector/run.ts
```

## Why This Matters

This mirrors `packages/api/tests/integration/hubspot-deal-update.integration.test.ts`'s approved case: a deal moving along an allowed forward pipeline path is approved and actually executed, with the mock server's own state — not just the returned decision — as proof.

## Next Tutorial

Continue with **Tutorial 70 – HubSpot Policy Denial**.
