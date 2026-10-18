# Tutorial 82 — Composite Signal-State Verification

## Objective

Show how `CompositeSignalStateVerifier` composes multiple capability-scoped verifiers — the real `HubSpotSignalStateVerifier` (Tutorial 71) and a second, minimal hand-written verifier for a fictional `vendor:balance-check` capability, illustrative scaffolding only, not a real connector — into the single verifier `RuntimeEngine` actually accepts, with no cross-contamination between them.

## What You'll Learn

- `RuntimeEngine` accepts exactly one `SignalStateVerifier`, but a real deployment can have one independent, capability-scoped verifier per connector — `CompositeSignalStateVerifier` queries each in turn and returns the first non-empty result
- Each verifier is disciplined to recognize only its own action(s): the illustrative `balanceVerifier` returns no violations for a `hubspot:deal-update` request, and `HubSpotSignalStateVerifier` returns none for `vendor:balance-check` — a mismatched signal on the "wrong" verifier's action is silently ignored by that verifier, not misreported
- An action neither verifier recognizes (`payments:execute`) produces no violations at all — the composite doesn't invent false positives for capabilities it has no verifier for

## Running the Tutorial

```bash
npx tsx examples/tutorials/82-composite-signal-state-verification/run.ts
```

## Why This Matters

Without this discipline, adding a new connector's signal-state verifier could risk one connector's checks leaking into another's requests, or a shared verifier interface forcing an awkward monolith. This tutorial proves the real `CompositeSignalStateVerifier` — the exact class `application.ts` wires `HubSpotSignalStateVerifier` through in production — routes each request to precisely the verifier that understands it, nothing more. (An earlier version of this tutorial and this note paired `HubSpotSignalStateVerifier` with a real `RazorpaySignalStateVerifier`; that connector was deliberately removed from the codebase 2026-08-12, see `docs/CLAIMS.md`'s "Key Compromise Notice" section, and this tutorial now uses the illustrative `balanceVerifier` in its place.)

## Next Tutorial

Continue with **Tutorial 83 — Capability/Policy Binding (TD-22)**.
