# 2.24 Authorization Is Caller-Type-Agnostic

Source: CLAIMS.md (commit d1d63c6), lines 891-916.

## Exact claim text

## 2.24 Authorization Is Caller-Type-Agnostic

The authorization pipeline's outcome depends only on the requested action, the governing policy, and the independently-verified facts bearing on it — never on what kind of system, model, or entity submitted the request. This is the source-code basis for the positioning claim that Parmana protects institutional authority against execution risk from any source (AI agents, humans, applications, automated systems, third-party systems, compromised systems), not only AI: the mechanism does not special-case any of them, including ones it has no name for.

Directly validated, not inferred from the absence of AI-specific code: `BusinessTransactionMapper.fromRequest` (`packages/api/src/mappers/BusinessTransactionMapper.ts:28`) casts the caller-declared `authority` field with no runtime validation against the `AuthorityType` enum (`USER | ROLE | SERVICE | ORGANIZATION`, `packages/shared/src/domain/authority.ts`) — an arbitrary string reaches the runtime unfiltered. `RuntimeEngine`, `PolicyEngine`, `SignalIntentBinder`, and `CapabilityPolicyBinder` contain zero references to `authority` or caller identity anywhere in their source (confirmed by direct grep across all four files). A regression test submits two transactions through the real `POST /execute` route, identical in every field except `authority.authorityType` — one declaring the conventional `"USER"`, the other declaring `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"`, a value that is not a member of the enum at all — and asserts byte-identical decisions (`outcome`, `matchedRuleId`, and, for the rejection case, the exact error text) on both the APPROVE and REJECT paths.

Independently confirmed by the Strategic Positioning source-code validation audit (2026-08-09, read-only): the caller-authentication layer (`StaticKeyAuthenticator`, `packages/api/src/auth/StaticKeyAuthenticator.ts`) authenticates by opaque API-key hash comparison only, with no concept of caller category either — the same identity mechanism a human operator, a script, an AI agent, or a third-party integration would all use identically.

**Scope, precisely:** this claim covers the general-purpose pipeline mechanism itself, which the regression test below exercises independently of any specific capability. The mechanism's caller-agnosticism does not depend on which capability is invoked (2.24's own evidence is about `RuntimeEngine`/`PolicyEngine`/`SignalIntentBinder`/`CapabilityPolicyBinder` never reading caller identity at all, not about per-capability behavior), so this claim's substance is unaffected by G-30 — G-30 is about policy _binding_ coverage, not caller-type discrimination. It does not claim that a non-AI caller has actually been exercised against a live production deployment — only that the mechanism contains no code path that could distinguish one caller kind from another to begin with.

Evidence

- packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts (2 cases: identical APPROVE, identical REJECT, across a conventional and a non-enum `authorityType`)

- packages/api/src/mappers/BusinessTransactionMapper.ts (unvalidated `authority` cast)

- packages/shared/src/domain/authority.ts (`AuthorityType` enum)

- packages/api/src/auth/StaticKeyAuthenticator.ts (caller-type-agnostic authentication)

- Repo-wide grep confirming zero `authority`/caller-identity references in RuntimeEngine.ts, PolicyEngine.ts, SignalIntentBinder.ts, CapabilityPolicyBinding.ts (as of this check, 2026-08-09, the last file lived at `packages/policy/src/`; moved to `packages/capability-registry/src/` 2026-08-26 — same file content, unaffected by the move)

- examples/tutorials/100-authorization-caller-type-agnostic/run.ts (runnable narrative, library-level: `"USER"` vs. `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"` produce byte-identical outcomes and reasons on both the APPROVE and REJECT paths)

---

## Cited evidence paths

- `packages/api/src/auth/StaticKeyAuthenticator.ts`: EXISTS
- `packages/api/src/mappers/BusinessTransactionMapper.ts:28`: MISSING
- `packages/capability-registry/src/`: EXISTS
- `packages/policy/src/`: EXISTS
- `packages/shared/src/domain/authority.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
