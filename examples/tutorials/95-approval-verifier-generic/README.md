# Tutorial 95 — Generic Approval Verifier

## Objective

Exercise `ApprovalVerifier` itself, generically and connector-agnostic — the deterministic verification algorithm Tutorial 72 only exercises wired through the HubSpot-specific pipeline — with its full per-check breakdown and durable, cross-process replay protection.

## What You'll Learn

- `result.checks` breaks verification into nine independent booleans (`versionSupported`, `issuerKnown`, `signatureVerified`, `notExpired`, `notRevoked`, `capabilityMatches`, `resourceMatches`, `scopeSatisfied`, `nonceUnseen`) — a revoked issuer's artifact can have a genuinely valid `signatureVerified: true` alongside `notRevoked: false`, proving revocation is a distinct, independent check, not merely folded into signature verification
- A forged signature (a different key claiming a registered identity) and a tampered payload (a genuine signature, modified after signing) both fail the same `signatureVerified` check, for different underlying reasons
- Scope supports more than a simple upper bound — a `"between"` range comparator is verified too
- Replay protection is a property of the shared, durable nonce store, not of any single verifier instance: two independent `ApprovalVerifier` instances backed by the same store (simulating two separate processes/requests) still correctly reject a second presentation
- A rejection on an unrelated ground (wrong `resourceId`) never consumes the nonce — a corrected retry with the same artifact still succeeds

## Running the Tutorial

```bash
npx tsx examples/tutorials/95-approval-verifier-generic/run.ts
```

## Why This Matters

Tutorial 72 proves the Approval Artifact mechanism works for HubSpot specifically. This tutorial proves the underlying, connector-agnostic component itself holds every one of its documented guarantees — a regression that broke `ApprovalVerifier` for a non-HubSpot shape (a different capability, a different scope field) could pass Tutorial 72 while failing here.

## Final Tutorial

This is the last of the 33 tutorials (63–95) added on top of the original 01–62, closing every real, currently-tested capability gap found across two coverage surveys. Run `npm run examples` to execute the complete suite.
