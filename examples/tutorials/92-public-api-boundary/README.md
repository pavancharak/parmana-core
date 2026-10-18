# Tutorial 92 — Public API Boundary

## Objective

Prove `@parmana/execution-gateway`'s internal implementation classes — `GatewayConnectorRegistry`, individual connector adapters, low-level helpers — are never reachable through the package's public entry point, checked directly against the real published API object.

## What You'll Learn

- None of nine known internal symbols (`GatewayConnectorRegistry`, `GatewayHubSpotAdapter`, `CredentialVaultAdapter`, `redactSensitiveKeys`, and others) appear on the imported `@parmana/execution-gateway` module object
- `ExecutionGateway` — the sole intended public execution entry point — and the `createGatewayConnectorRegistry`/`createGatewayHubSpotConnector` factories, which return stable interface types rather than concrete classes, are the only things checked here as actually exported
- This is checked against the real, compiled package export surface — not by reading `src/index.ts` and trusting nothing changed since

## Running the Tutorial

```bash
npx tsx examples/tutorials/92-public-api-boundary/run.ts
```

## Why This Matters

If `GatewayConnectorRegistry` (or any other internal class) were importable directly, a downstream package could construct and use it without ever going through `ExecutionGateway`'s own enforcement — a structural bypass at the package-export level, related in spirit to the runtime-level connector-bypass Tutorial 45 demonstrates. This tutorial mirrors `packages/execution-gateway/tests/unit/public-api-boundary.test.ts`, an architecture guard specifically designed to fail loudly the moment any internal symbol gets re-exported.

## Next Tutorial

Continue with **Tutorial 93 – Trust Record Ordering**.
