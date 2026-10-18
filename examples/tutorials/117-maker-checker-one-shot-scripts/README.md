# Tutorial 117 — Maker-Checker One-Shot Scripts

## Objective

Exercise `scripts/local-review-action.ts` and `scripts/refresh-approved-policy-content.ts`
directly — the exact two scripts used to approve all 14 real production policies the night
of 2026-09-16 (see `docs/CLAIMS.md` §2.26's "Legacy-policy backfill" entry) — and prove they
produce the identical durable effects (a written `policy.json`, a signed
`PolicyChangeApprovalRecord`) as the fully manual sign-then-curl flow Tutorial 103 already
demonstrates.

## What You'll Learn

- **Why these scripts exist at all:** chaining a step-up signature (valid for 120 seconds)
  across separate `sign` and `submit` commands is fragile the moment a human, a shell, or a
  network hop sits between the two steps — shell quoting can mangle the JSON body, a slow
  relay can burn the window, and a stale credential produces a confusing
  `STEP_UP_AUTHORIZATION_INVALID` that looks unrelated to timing at all. Both scripts
  collapse sign-then-submit into one process, so there's no gap for any of that to go wrong
  in.
- **`local-review-action.ts`** (Scenario 1): signs and submits an approve/reject for an
  _existing_ pending change in one call — `REVIEWER_KEY` env var plus a
  `--pending-policy-change-id`.
- **`refresh-approved-policy-content.ts`** (Scenario 2): proposes whatever is _currently on
  disk_ for a given `(name, version)` and immediately approves it, in one call —
  `PROPOSER_KEY` and `REVIEWER_KEY` env vars plus `--policy-name`/`--policy-version`. This is
  what closed the real drift found the same night: the original 2026-08-19 proposals for ten
  policies had gone stale relative to their live files, and this script is how they were
  re-proposed and re-approved with current content instead.
- Both scripts' `main()` is exported and callable directly (not just as a CLI entry point),
  which is what makes this tutorial possible without shelling out to a subprocess — the same
  hermetic-in-process discipline the rest of this tutorial series uses.

## Running the Tutorial

```bash
npx tsx examples/tutorials/117-maker-checker-one-shot-scripts/run.ts
```

Entirely hermetic: a real Express app on an ephemeral local port, real `FilePolicyRepository`
writes to scratch temp directories (never the real `policies/` tree), a real Ed25519 step-up
keypair generated fresh per run. No network access, no real credentials, nothing left behind.

## Why This Matters

A maker-checker approval isn't complete until both a durable, signed record exists _and_ the
live policy content actually changes — and both of those need to happen without exposing any
secret material along the way. This tutorial's real value isn't the mechanics (Tutorial 103
already proves those independently) — it's confirming that the _operational shortcut_ built
to make step-up signing reliable in practice produces exactly the same trustworthy result as
doing every step by hand.

## Related Tutorials

[Tutorial 103 - Policy Governance (Maker-Checker)](../103-policy-governance-maker-checker/README.md) —
the fully manual flow this tutorial's scripts collapse into one step each. ·
[Tutorial 116 - SupabasePolicyRepository (the EROFS fix)](../116-supabase-policy-repository/README.md) —
the storage-layer fix from the same night that made real production approvals possible at
all.
