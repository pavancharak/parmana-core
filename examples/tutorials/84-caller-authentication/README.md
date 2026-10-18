# Tutorial 84 — Caller Authentication

## Objective

Exercise the real Express caller-authentication middleware through a real listening HTTP server: valid/missing/invalid credentials, per-caller scoping, key rotation and revocation, and the route inventory of what does and doesn't require a credential.

## What You'll Learn

- `GET /health` is the one route exempt from authentication — everything else, including `GET /policies`, requires a credential
- `StaticKeyAuthenticator` compares only SHA-256 hashes in constant time, never the raw key — and the audit trail (`InMemoryCallerAuditSink`) proves it: neither raw key ever appears anywhere in recorded events, even after multiple authenticated and rejected attempts
- Key rotation needs no downtime or code change: two entries sharing one `callerId` let the old and new key both work simultaneously, and removing the old entry alone revokes it — the app object itself never has to restart mid-scenario, only the config passed to a fresh `createApp()` call changes
- A missing credential and an invalid one are both rejected with 401, each recorded with a distinct, specific `reason`
- Principal and capability scoping are checked _after_ authentication succeeds, and in a fixed order: a caller allowed to assert the transaction's `authority.principalId` but not invoke its `intent.action` is rejected with 403 and audited as `caller.capability_denied`; a caller allowed to invoke the capability but not assert the principal is rejected with 403 and audited as `caller.principal_denied` — the principal check runs first, so it never even reaches the capability check

## Running the Tutorial

```bash
npx tsx examples/tutorials/84-caller-authentication/run.ts
```

## Why This Matters

Caller authentication is the layer in front of nearly every route, entirely separate from policy evaluation and gateway attestation, both of which run later and only for an already-authenticated caller. This tutorial mirrors `packages/api/tests/integration/caller-auth.integration.test.ts` end to end, through the real Express app and a real HTTP server rather than calling internal functions directly — this is genuinely middleware-layer behavior, so it's proven the same way the real server is actually exercised.

## Next Tutorial

Continue with **Tutorial 86 – Gateway Attestation**.
