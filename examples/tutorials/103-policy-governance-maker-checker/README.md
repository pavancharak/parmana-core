# Tutorial 103 — Policy Governance (Maker-Checker)

## Objective

Exercise the full maker-checker approval flow a policy content change goes through before it can take effect, through a real HTTP server: human-only enforcement, maker ≠ checker, and step-up authorization, each independently enforced (`docs/CLAIMS.md` §2.26). Mirrors `packages/api/tests/integration/pending-policy-changes-governance.integration.test.ts`.

## What You'll Learn

- All four governance endpoints (`propose`, `list`, `approve`, `reject`) call `requireHumanCaller()` before doing anything else — a `SERVICE`-credentialed caller is denied `403 NON_HUMAN_CALLER_DENIED` on `propose`, exactly like it would be on any of the other three
- `SameActorCannotApproveOwnChangeError` is thrown independently of step-up: the maker attempting to approve its own proposal is rejected `403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE` even before a step-up envelope is checked
- A _distinct_ human checker still isn't enough on its own — approve/reject additionally require a `PolicyChangeStepUpAuthorization` envelope signed by the checker's own separate key, on top of (never instead of) their bearer token; omitting it gets `403 STEP_UP_AUTHORIZATION_INVALID`
- Only once every layer passes does `PolicyChangeApprovalService.approve()` run: it signs and durably persists the `PolicyChangeApprovalRecord` _before_ writing the live `policies/{name}/{version}/policy.json` file — this tutorial reads both back afterward to prove they're real, not just a `200` response

## Running the Tutorial

```bash
npx tsx examples/tutorials/103-policy-governance-maker-checker/run.ts
```

Writes to a scratch temp directory (`mkdtempSync`), never the real `policies/` tree, and cleans it up afterward — the same discipline the integration test it mirrors uses, so a run never litters the real policy directory with a fake tutorial policy.

## Why This Matters

Before this feature, any caller with write access to `policies/` could change what a policy allows with no second party involved and no durable, signed record of who approved it — the same trust boundary this entire system exists to give AI-initiated _execution_, quietly absent from the governance of the _rules_ execution is checked against. Maker ≠ checker and step-up authorization close that gap the same way the rest of this codebase closes gaps: independently, in the order that fails safest, with a durable signed artifact as the proof, not a status flag alone. `governance-ui` (a small, read-only internal tool) deliberately does not expose `/approve`/`/reject` at all — the checker's step-up private key must never leave their own machine, which a web UI collecting it would defeat.

## Next Tutorial

[Tutorial 104 — Policy Governance Execution Verification](../104-policy-governance-execution-verification/README.md) — what happens once an approved policy exists: execution-time refusal on tampering, independent of the approval flow this tutorial covers.
