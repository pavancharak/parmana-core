# Tutorial 83 — Capability/Policy Binding (TD-22)

## Objective

Exercise `CapabilityPolicyBinder` directly: the canonical, one-to-one capability-to-policy binding table that closes TD-22 — a real capability paired with the wrong policy.

## What You'll Learn

- `boundSignals`/`SignalStateVerifier` protections are declared per-_policy_ and per-_action_ respectively, but nothing else cross-checked that the policy attached to a request was actually the one meant for that capability — `PolicyEngine.evaluate` takes no action parameter at all
- The exact live-shaped exploit: `hubspot:deal-update` (data-mutating, protected by `hubspot-deal-update/1.1.0`'s `boundSignals`) paired with `vendor-payment/2.1.0` — a real, loadable policy with no `boundSignals` for it at all, trivially satisfiable by caller-declared signals alone
- A matching policy _name_ with the wrong _version_ is still caught — the binding is exact, not name-only

## Running the Tutorial

```bash
npx tsx examples/tutorials/83-capability-policy-binding/run.ts
```

## Why This Matters

Without this binder, a caller who found any real, loadable policy with weaker (or no) `boundSignals` could attach it to an unrelated, sensitive capability and inherit that policy's laxer rules — a live-shaped exploit found during Phase 2K's independent verification, not a theoretical one. `CapabilityPolicyBinder.findViolation()` runs before `PolicyEngine.evaluate`, checked automatically by `RuntimeEngine` for every real execution.

## Next Tutorial

Continue with **Tutorial 84 – Caller Authentication**.
