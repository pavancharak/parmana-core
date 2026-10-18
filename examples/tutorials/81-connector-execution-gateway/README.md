# Tutorial 81 — Connector Execution Gateway

## Objective

Exercise `GatewayConnectorRegistry` directly, via the real production wiring (`createConnectorRegistry`): the layer that resolves a capability string (`hubspot:deal-update`, `test:fixture-execute`) to the connector actually registered to handle it — and fails closed, per capability, when that connector's credentials aren't configured.

## What You'll Learn

- `resolveCapability()` (asynchronous since ADR-0013) scans every registered connector's declared capabilities and returns the first match; for a capability none of them serves, it looks for an active external connector registration — under `NODE_ENV=test`, both HubSpot's capabilities and the mock test-fixture connector's resolve
- Outside test mode with no credentials configured, each connector fails to register **independently** — a missing HubSpot credential doesn't take down `test:fixture-execute`, and vice versa; each capability's `resolveCapability()` call rejects with its own "No connector registered" error
- This is the structural layer Tutorials 57–59 demonstrate generically with one hand-built connector, and Tutorial 69 exercises concretely for HubSpot — here it's shown directly, against the real production registry

## Running the Tutorial

```bash
npx tsx examples/tutorials/81-connector-execution-gateway/run.ts
```

## Why This Matters

A single misconfigured connector must never be able to take an entire process down, or silently make an unrelated capability available when it shouldn't be. This tutorial mirrors `packages/api/tests/unit/bootstrap/create-connector-registry.test.ts`, proving each capability's availability is decided independently, purely from that connector's own credential configuration.

## Next Tutorial

Continue with **Tutorial 82 – Composite Signal-State Verification**.
