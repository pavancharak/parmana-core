# Tutorial 76 — Caller Principal Scoping

## Objective

Exercise `isPrincipalAllowed()` directly: the check that stops an authenticated caller from asserting a different identity's `authority.principalId` on a transaction it submits.

## What You'll Learn

- The default (no `allowedPrincipalIds` grant configured) is fail-closed: a caller may only assert **itself** — `principalId === callerId`
- An explicit, operator-configured grant is the only way to widen that — and the grant is a specific allow-list, not "anything goes once any grant exists"
- A caller with a grant still can't assert an identity outside that grant's own list

## Running the Tutorial

```bash
npx tsx examples/tutorials/76-caller-principal-scoping/run.ts
```

## Why This Matters

Without this check, `authority.principalId` is entirely caller-declared and never cross-checked against the identity actually proven by authentication — any caller holding any valid API key could claim to be any human or role in the resulting _signed_ trust record, which would otherwise look like strong evidence of who authorized what. This tutorial exercises the exact function every transaction submission is checked against, covering both the fail-closed default and the explicit-grant escape hatch.

## Next Tutorial

Continue with **Tutorial 77 – Caller Ownership Scoping**.
