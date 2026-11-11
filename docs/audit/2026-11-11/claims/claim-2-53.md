# 2.53 An Agent's Proposed Fact Is Not a Business Fact: Sourced Signals and Separate Authority, Validity and Execution Statuses (Scoped, 2026-10-10)

Source: CLAIMS.md (commit d1d63c6), lines 705-734.

## Exact claim text

## 2.53 An Agent's Proposed Fact Is Not a Business Fact: Sourced Signals and Separate Authority, Validity and Execution Statuses (Scoped, 2026-10-10)

**Claim:** a policy can declare, per fact, the business system that owns it (`signalSources`, RFC-0023). For such a fact Parmana asks the source itself, about the business object read from the Intent, never using the caller's value, and records the answer as a Trusted Signal: source, source identity, subject, claim, observed value, observation time, `validUntil`, the action and transaction it supports, and a SHA-256 digest. The policy is evaluated on the trusted value. A different value proposed by the caller refuses the request as `INVALID`. A source that is not registered, fails or times out is `SOURCE_UNAVAILABLE`; no answer, no business object or the wrong type is `MISSING_DATA`; contradictory facts are `CONFLICTING_DATA`; an answer older than `maxAgeSeconds` (default 300) or past the source's own `validUntil` is `VALIDATION_EXPIRED`. Each refuses the request, with no authorization generated. Every Decision now carries `assessment`, with authority, business validation and, for a refusal, execution as separate statuses. It is signed inside the Execution Trust Record and the Refusal Record.

Scope, stated plainly:

- **No business source is registered in the server yet.** A policy that declares one is refused as `SOURCE_UNAVAILABLE`, failing closed. No shipped policy declares one, so production decisions are unchanged except that they now record `assessment`. Registering sources is RFC-0023 phase 2.
- **Authority is today's checks, named.** `AUTHORIZED` means the governance verification and capability/policy binding passed (and, at the API, the caller key's capability scope). Per-agent limits and expiry are phase 3, so `AUTHORITY_EXPIRED` is not yet produced.
- **Policies without sources are unchanged.** Their validation status is `NOT_EVALUATED`, never `VALID`, and they still need a signed human approval to approve (2.47).
- **The digest proves what Parmana observed, not what the source said.** A source's own proof is carried verbatim in `integrityProof.sourceProof` and verified for a source registered with a key (2.54, `sourceProofVerified`). A source registered without a key has no proof.
- **Execution statuses for approved actions** remain the Trust Record's executions; `EXECUTION_UNKNOWN` and conditional execution are phase 4. **Update (2026-10-11):** built.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/runtime/tests/unit/trusted-signal-resolver.test.ts` (19): no sources is `NOT_EVALUATED`; the source is asked about the Intent's object; the signal's digest recomputes; a contradicting proposal is `INVALID`; a missing object, `not_found` and a wrong type are `MISSING_DATA`; `conflicting` is `CONFLICTING_DATA`; no registry, an unregistered source, a throw, a timeout, no identity, an invalid or future time are `SOURCE_UNAVAILABLE`; an old answer or a past `validUntil` is `VALIDATION_EXPIRED`; one failing fact of several refuses and every failure is reported.
- `packages/runtime/tests/unit/business-validation.test.ts` (9), through the real `RuntimeEngine` with a signed approval: execution when both hold, deciding on the source's value; `INVALID` with nothing executed when the proposal contradicts the source; the assessment signed into the Refusal Record, verifying after a JSON round trip and failing when a status is changed; the policy refusing on the source's value when the caller sent none; `SOURCE_UNAVAILABLE` with no source or a failing one; `MISSING_DATA`; no source asked when authority is `NOT_AUTHORIZED`; `NOT_EVALUATED` under a policy without sources.
- `packages/policy/tests/unit/PolicyValidator-signalSources.test.ts` (19): valid declarations load and count as covered; malformed or contradictory ones are refused; `GET /policies/in-effect` lists them as `sourced`.

Evidence

- `packages/shared/src/domain/business-validation.ts`, `packages/shared/src/domain/decision.ts` (`assessment`)
- `packages/runtime/src/business-validation/`, `packages/runtime/src/RuntimeEngine.ts`, `packages/runtime/src/DecisionBuilder.ts`
- `packages/policy/src/types/Policy.ts` (`signalSources`), `packages/policy/src/PolicyValidator.ts` (`validateSignalSources`)
- `docs/internal/rfcs/RFC-0023-Business-Validation.md`

**Update (2026-10-11):** the first scope bullet is superseded by 2.54: business systems can now be registered as sources through maker checker, and a source registered with a key must sign its answers, which Parmana verifies (`sourceProofVerified`). The fourth bullet holds only for sources registered without a key. The second bullet is superseded by 2.55 for a policy with `requireAuthorityGrant`: authority then also needs the caller's grant, and `AUTHORITY_EXPIRED` is produced.

---


## Cited evidence paths

- `docs/internal/rfcs/RFC-0023-Business-Validation.md`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/src/types/Policy.ts`: EXISTS
- `packages/policy/tests/unit/PolicyValidator-signalSources.test.ts`: EXISTS
- `packages/runtime/src/DecisionBuilder.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/src/business-validation/`: EXISTS
- `packages/runtime/tests/unit/business-validation.test.ts`: EXISTS
- `packages/runtime/tests/unit/trusted-signal-resolver.test.ts`: EXISTS
- `packages/shared/src/domain/business-validation.ts`: EXISTS
- `packages/shared/src/domain/decision.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/policy/tests/unit/PolicyValidator-signalSources.test.ts` | passed | 24 | 24 | 0 |
| `packages/runtime/tests/unit/business-validation.test.ts` | passed | 8 | 8 | 0 |
| `packages/runtime/tests/unit/trusted-signal-resolver.test.ts` | passed | 21 | 21 | 0 |
