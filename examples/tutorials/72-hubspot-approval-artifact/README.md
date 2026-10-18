# Tutorial 72 — HubSpot Approval Artifact

## Objective

Show that an over-threshold HubSpot amount change requires more than a caller's bare `preAuthorizedForAmountChange: true` claim — it requires a real, independently-issued, signed Approval Artifact from a trusted issuer, scoped to the right deal and a large enough amount.

> **Since 2026-09-30** every HubSpot update needs one signed approval for the deal, whatever the
> amount (`hubspot-deal-update` 1.1.0, `dealUpdateApproved`), checked by `ApprovalSignalVerifier`
> like every other action. `HubSpotSignalStateVerifier` still has the pre authorization check this
> tutorial exercises directly, and uses it only for a policy that declares no `approvalSignals`,
> which no current policy is. No AI agent action is authorized without a signed human approval
> (`docs/site/concepts/human-approval.mdx`).

## What You'll Learn

- A well-formed, validly-signed artifact from an issuer nobody trusts is worth exactly as much as no artifact at all
- An artifact scoped to a smaller amount than what's actually being requested (`amountDeltaAbs`) doesn't cover the request — scope is checked, not just the signature
- The production API starts with **zero** trusted issuers configured by default (fail-closed) — this tutorial constructs `HubSpotSignalStateVerifier` directly with its own locally trusted issuer key to demonstrate the mechanism, the same way its own unit test suite does

## Running the Tutorial

```bash
npx tsx examples/tutorials/72-hubspot-approval-artifact/run.ts
```

## Why This Matters

This is TD-23's Phase 3C closure: without artifact verification, any caller could simply declare `preAuthorizedForAmountChange: true` and bypass the threshold check entirely. This tutorial exercises four real scenarios against the actual `HubSpotSignalStateVerifier` + `ApprovalVerifier` pipeline — trusted-and-valid, missing, untrusted-issuer, and scope-exceeded — and only the first one clears.

## Next Tutorial

Continue with **Tutorial 73 – Refusal Records**.
