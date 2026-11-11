# 3.16 Caller-to-Capability Scoping (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1733-1751.

## Exact claim text

## 3.16 Caller-to-Capability Scoping (Scoped)

Extends `ApiKeyEntry` with an optional `allowedCapabilities` field: the set of capabilities (`Intent.action` values, e.g. `test:fixture-execute`) a given key may invoke. Checked in `execute.ts`/`transactions.ts` before the transaction ever reaches `application.execute()` — i.e. before `CapabilityPolicyBinder`/`PolicyEngine.evaluate` are reached, neither of which is caller-aware by design (2.24, 2.16's own G-28 note). A caller attempting a capability outside its grant is rejected `403 CAPABILITY_NOT_ALLOWED` and the denial is audited (`caller.capability_denied`, `CallerAuditSink`), never silently. The default is fail-closed and deliberately the opposite of `allowedPrincipalIds`' own default: an unset or empty `allowedCapabilities` denies every capability — there is no "may invoke its own capability" fallback the way there is a "may only assert itself" fallback for principals. The literal string `"*"` is an explicit, auditable wildcard grant, never an implicit default. `GET /callers/me` returns an authenticated caller's own resolved identity and scope (`callerId`, `allowedPrincipalIds`, `allowedCapabilities`, `unrestrictedCapabilities`) — self-lookup only, no key material — as the proof artifact a security review can point to.

**Scope, precisely:** this mechanism is implemented, tested, and enforced for every caller that authenticates through a caller-auth-enabled path. No built in connector is in core in this version, so no production capability is scoped by it yet.

Evidence

- `packages/shared/src/config/ApiKeyEntry.ts` (`allowedCapabilities`, fail-closed-by-default doc comment, `"*"` wildcard convention)
- `packages/shared/src/config/ConfigValidation.ts` (`parseApiKeys` validates `allowedCapabilities` the same way as `allowedPrincipalIds`)
- `packages/api/src/auth/isCapabilityAllowed.ts` (fail-closed check, wildcard handling)
- `packages/api/src/routes/execute.ts` / `transactions.ts` (enforced before `application.execute()`; `403 CAPABILITY_NOT_ALLOWED`; denial audited via `recordCallerAuditEvent`)
- `packages/api/src/auth/CallerAuditSink.ts` (`caller.capability_denied` event type, `capability` field)
- `packages/api/src/routes/callers-me.ts` (`GET /callers/me`, resolved identity/scope, no key material)
- `supabase/migrations/20260812120000_add_capability_to_caller_audit_events.sql` (additive `capability` column, widened `type` CHECK constraint; not yet applied to any live project)
- `packages/api/tests/unit/isCapabilityAllowed.test.ts`, `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` (allow/deny/fail-closed-default/wildcard, denial precedes policy evaluation, audit content, `/callers/me` self-lookup and resolved-defaults)

---


## Cited evidence paths

- `packages/api/src/auth/CallerAuditSink.ts`: EXISTS
- `packages/api/src/auth/isCapabilityAllowed.ts`: EXISTS
- `packages/api/src/routes/callers-me.ts`: EXISTS
- `packages/api/src/routes/execute.ts`: EXISTS
- `packages/api/tests/integration/caller-capability-scoping.integration.test.ts`: EXISTS
- `packages/api/tests/unit/isCapabilityAllowed.test.ts`: EXISTS
- `packages/shared/src/config/ApiKeyEntry.ts`: EXISTS
- `packages/shared/src/config/ConfigValidation.ts`: EXISTS
- `supabase/migrations/20260812120000_add_capability_to_caller_audit_events.sql`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/caller-capability-scoping.integration.test.ts` | passed | 18 | 18 | 0 |
| `packages/api/tests/unit/isCapabilityAllowed.test.ts` | passed | 9 | 9 | 0 |
