# Tutorial 106 — API Key Issuance (Writing a New Policy)

## Objective

Author a brand-new policy from scratch, correctly, under the discipline this repository's
10 pre-existing policies had to be retrofitted for: fail-closed `boundSignals` coverage
(`docs/VERIFICATION-GAPS.md` G-33) and zero advisory rule conflicts (G-39). Where Tutorial 14
shows how to write _a_ policy, this one is a template for writing a _correct_ one the first
time — no retrofit needed.

## What You'll Learn

- `policies/api-key-issuance/1.1.0/policy.json` binds its one genuinely Intent-bindable fact
  (`keyLifetimeDays`, an amount-like field) via `boundSignals`, and explicitly acknowledges
  every other fact (`requesterVerified`, `scopeAuthorized`, `riskScore`) in
  `unboundSignalReasons` with a specific reason — `PolicyValidator.validate()` would otherwise
  refuse to load it at all
- A caller declaring `keyLifetimeDays: 30` while the actual Intent requests a 400-day key is
  rejected by `SignalIntentBinder` _before_ `PolicyEngine` ever evaluates a rule — the bound
  fact really is checked, not just documented as bindable (Scenario 2)
- Independently-attested facts still produce specific, human-readable rejection reasons
  (Scenario 3) — the auditability payoff of writing explicit rejection rules instead of
  relying solely on the engine's own default-reject (see
  [Write your first policy](https://docs.parmanasystems.com/guides/write-your-first-policy)'s "Why explicit rejection
  rules?" section)
- `PolicyValidator.findRuleConflicts(policy)` reports zero warnings for this policy's shape
  (one nested-`all` approve rule, several single-fact reject rules, one trailing
  `always: true` catch-all) — the same shape every real policy in this repo now has, by
  construction, not by luck (Scenario 4)

## Running the Tutorial

```bash
npx tsx examples/tutorials/106-api-key-issuance/run.ts
```

Uses the real `policies/` directory (including the new `api-key-issuance/1.1.0` policy this
tutorial adds), in-memory trust records — no HTTP server, no Supabase, no scratch key
directory needed.

## Why This Matters

Every one of this repository's 10 pre-existing policies needed two rounds of retrofitting
this session: `unboundSignalReasons` entries added after `boundSignals` coverage became
fail-closed (G-33), and — separately — verification that none of them tripped the new
rule-conflict checker (G-39). This tutorial's policy needed neither: it was written with both
disciplines in mind from the start, and this tutorial is the proof — `validate()` doesn't
throw, and `findRuleConflicts()` returns an empty array, on the very first version of the
file.

## Next

This is currently the last tutorial in the sequence.
