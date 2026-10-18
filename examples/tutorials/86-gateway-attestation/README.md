# Tutorial 86 — Gateway Attestation

## Objective

Exercise `SignedTokenConnectorAuthenticator`'s full API surface directly — the parts Tutorial 59's end-to-end SecureConnector flow doesn't isolate on their own: payload tampering, the missing-attestation default, the signature-only vs. request-bound distinction, and the trusted-connector-identity check.

## What You'll Learn

- Rewriting any field of a signed attestation payload — even the very field a check is comparing against — breaks its signature; there's no way to "fix up" a tampered attestation to pass
- `authenticateGatewayForRequest(gateway, undefined, authorizationId)` — no attestation presented at all — is rejected, matching today's production default
- `authenticateGateway()` checks the signature alone; `authenticateGatewayForRequest()` additionally checks the attestation was minted for _this specific_ `authorizationId` — a genuine, validly-signed attestation still fails the second check if presented against the wrong request
- `authenticateConnector()` is a separate allow-list check: only connector identities registered at authenticator construction time pass, regardless of anything about the gateway's own attestation

## Running the Tutorial

```bash
npx tsx examples/tutorials/86-gateway-attestation/run.ts
```

## Why This Matters

Tutorial 59 proves the attestation mechanism works inside a full connector-execution flow; this tutorial isolates the authenticator's own guarantees so a regression in any one of them — tamper-detection, the fail-closed missing-attestation default, request binding, or connector trust — would be caught here specifically, independent of everything else that flow also exercises.

## Next Tutorial

Continue with **Tutorial 87 – Key Provider Path Traversal**.
