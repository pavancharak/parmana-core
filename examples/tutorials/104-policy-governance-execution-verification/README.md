# Tutorial 104 — Policy Governance Execution Verification

## Objective

Show what happens _after_ a policy change is approved (Tutorial 103 covers the approval flow itself): `RuntimeEngine` can refuse to execute against a policy at all — before `PolicyEngine` ever evaluates a single rule in it — when it has no approval record, when its live content no longer matches what was approved, or when the approval record itself has been tampered with. Mirrors `docs/CLAIMS.md` §2.35 and `packages/api/tests/unit/PolicyGovernanceExecutionVerifier.test.ts`.

## What You'll Learn

- `PolicyGovernanceExecutionVerifier` (`packages/api/src/governance/`) is wired into `RuntimeEngine` as an optional, trailing constructor parameter — the same pattern `signalStateVerifier`/`capabilityPolicyBinder` already use (`RuntimeBuilder.withPolicyExecutionVerifier()`)
- A policy with no `PolicyChangeApprovalRecord` at all is refused (Scenario 2) — this is what makes a policy that predates governance, or was never proposed through it, unexecutable rather than silently trusted
- A policy whose live file no longer matches its approval record's `contentHashAfter` is refused (Scenario 3) — a direct edit to `policy.json` outside the governed API doesn't just get logged after the fact, it stops that policy from executing at all
- The same tampering is _also_ independently caught by `verifyPolicyGovernanceIntegrityAtStartup()` — the deploy-time/periodic detection layer from `docs/CLAIMS.md` §2.34 — proving these are two structurally distinct mechanisms (prevention vs. detection), not one wrapping the other
- A tampered approval record — its signature no longer verifying — is refused independently of the content-hash check (Scenario 4), even if the live file itself is untouched
- Every refusal becomes an ordinary `PolicyDecision` with `outcome: REJECT` and `matchedRuleId: "policy-execution-verification-violation"`, flowing through the exact same refusal-recording and fail-closed enforcement path as any other rejection — no separate throw-and-audit-elsewhere mechanism

## Running the Tutorial

```bash
npx tsx examples/tutorials/104-policy-governance-execution-verification/run.ts
```

Writes to a scratch temp directory (`mkdtempSync`), never the real `policies/` tree, and cleans it up afterward. Uses an in-memory approval-record repository directly — this tutorial does not start an HTTP server (see Tutorial 103 for the full maker-checker flow over real HTTP).

## Why This Matters

`docs/CLAIMS.md` §2.34 closed the _detection_ gap: a bypass of Policy Governance would eventually be noticed, at startup or on a 5-minute interval. This tutorial demonstrates the _prevention_ half added afterward: the same bypass simply doesn't execute in the first place, once `PolicyGovernanceExecutionVerifier` is wired in. In production this is feature-flagged (`POLICY_EXECUTION_VERIFICATION_ENFORCED`, default `false`) — every real policy in this system is still `PENDING_APPROVAL` (see the policy approval runbook, in git history), so turning it on unconditionally today would refuse all of them, not just a genuine bypass. This tutorial builds the same verifier directly, against a scratch policy of its own, specifically so it can show all four outcomes without depending on that real-world state.

## Next Tutorial

[Tutorial 105 - Tenant Key Isolation](../105-tenant-key-isolation/README.md)
