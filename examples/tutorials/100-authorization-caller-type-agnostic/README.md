# Tutorial 100 — Authorization Is Caller-Type-Agnostic

## Objective

Prove, directly and executably, that the authorization pipeline's outcome depends only on the requested action, the governing policy, and independently-verified facts — never on what kind of system, model, or entity submitted the request (`docs/CLAIMS.md` §2.24). Mirrors `packages/api/tests/integration/authority-type-agnostic-execution.integration.test.ts` at the library level.

## What You'll Learn

- `BusinessTransactionMapper.fromRequest` casts the caller-declared `authority` field with no runtime validation against the `AuthorityType` enum (`USER | ROLE | SERVICE | ORGANIZATION`) — an arbitrary string reaches the runtime completely unfiltered
- `RuntimeEngine`, `PolicyEngine`, `SignalIntentBinder`, and `CapabilityPolicyBinder` contain zero references to `authority` or caller identity anywhere in their source — this isn't inferred here, it's demonstrated: two transactions, identical except for `authority.authorityType`, produce byte-identical decisions
- This holds on **both** paths: an `authorityType` of `"USER"` versus `"FULLY_AUTONOMOUS_AI_AGENT_NEVER_SEEN_BEFORE"` (not a member of the enum at all) produce the same `APPROVED` outcome and the same `reason` string when the request would be approved, and the same `403`/`POLICY_DENIED`/message when it would be rejected
- A mechanism could in principle be blind on approval but special-case rejection (an authority-based override, say) — testing both paths separately rules that out explicitly, not just "both got some rejection"

## Running the Tutorial

```bash
npx tsx examples/tutorials/100-authorization-caller-type-agnostic/run.ts
```

## Why This Matters

This is the source-code basis for Parmana's positioning claim that it protects institutional authority against execution risk from any source — AI agents, humans, applications, automated systems, third-party systems, compromised systems — not only AI, and not only the caller kinds anyone thought to name in advance. The `AuthorityType` enum exists as a convenience for common cases; nothing in the authorization pipeline actually enforces membership in it, and this tutorial proves that by using a value that isn't a member at all and getting an identical result to the conventional case.

## Next Tutorial

Continue with **Tutorial 101 — Fail-Closed Caller-Authentication Audit Writes**.
