# 2.55 Per-Agent Authority: Grants With Limits and Expiry, Made Through Maker Checker, Checked Before Anything Is Asked (Scoped, 2026-10-11)

Source: CLAIMS.md (commit d1d63c6), lines 764-796.

## Exact claim text

## 2.55 Per-Agent Authority: Grants With Limits and Expiry, Made Through Maker Checker, Checked Before Anything Is Asked (Scoped, 2026-10-11)

**Claim:** a policy with `requireAuthorityGrant` decides a request only when its authenticated caller (`metadata.submittedBy`, which the server sets from the API key) holds an authority grant in force for the action and the request is within the grant's limits. A grant names one caller, one capability, optional limits by Intent path (`min` and `max` for a number, `oneOf` for allowed values), and an expiry at most 366 days away; it is made and revoked through maker checker (`/authority-grants`): a human proposes, a different human approves with a step up authorization, and neither may be the grantee. No grant, a revoked one, one not yet in force, a request outside a limit (or with the limited value missing or of another type), or no authenticated caller is `NOT_AUTHORIZED`; a grant past its `validUntil` is `AUTHORITY_EXPIRED`; grants that cannot be read, or no grant registry, are `AUTHORITY_UNCLEAR`. Each refuses the request before business validation, so no business system is asked, with a Refusal Record (`authority-not-authorized`, `authority-expired`, `authority-unclear`) that a signed approval cannot cure. The grant checked is recorded in `assessment.authority.grant`, signed in the record. `GET /policies/in-effect` answers `authorityGrantRequired: true` for such a policy.

Scope, stated plainly:

- **Opt in per policy, and no shipped policy opts in.** A policy without `requireAuthorityGrant` keeps the authority of 2.53.
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; `GET /authority-grants` answers in production. No grant has been made there and no production policy requires one. **Live check, passed in production 2026-10-11** (`examples/live-checks/authority-grant`): under test policy `livecheck-grant` with `requireAuthorityGrant`, each request with a valid signed approval, a request before any grant was refused (`authority-not-authorized`), one within grant `4b60507f-adb8-4fe0-82b3-a83c41e09022` (max 100) was approved, released and verified offline with the grant in the signed record, one for 500 was refused as above the granted maximum, and one after the revoke was refused. Transactions `8a75374c-150d-4cea-b57a-abb3a92bcac6`, `da96002b-66ec-44cf-88da-0f29997e4711`, `87770ab4-ac7c-4768-94a9-46df2367782b` and `41ec047d-bf64-48f4-b718-a419c7575e8d`. No production policy for a real action requires a grant yet.
- **Limits are per request.** Cumulative limits ("100000 per day") are not built.
- **The grantee is a caller id the server does not check exists.** A grant to a key that does not exist has no effect.
- **Checked at decision time.** Not re-checked at release (phase 4); the authorization's short TTL bounds the window. **Update (2026-10-11):** re-checked at release.
- **The SDK methods** ship in the next SDK release. **Update (2026-10-11):** published in SDK 1.6.0.

Verification

- `packages/runtime/tests/unit/authority-grant-evaluator.test.ts` (14): no effect without `requireAuthorityGrant`; a current grant within limits is `AUTHORIZED` with the grant recorded; no caller (asking nothing), no grant, before `validFrom`, above a maximum, below a minimum, not in `oneOf`, a string where a number is limited and a missing value are `NOT_AUTHORIZED`; at and after `validUntil` is `AUTHORITY_EXPIRED`; the bounds themselves are allowed; the target can be limited; no registry and a failing one are `AUTHORITY_UNCLEAR`.
- `packages/runtime/tests/unit/authority-grants-runtime.test.ts` (9), through the real `RuntimeEngine` with a signed approval: execution with the grant in the Trust Record; refusals for no grant, an expired grant, a request above the limit, another caller's grant and no registry, each with business validation `NOT_EVALUATED` and nothing executed; no caller asks no registry; the expired grant signed into the Refusal Record, which verifies after a JSON round trip and fails when the status is changed; a policy without the flag reads no grant.
- `packages/api/tests/integration/authority-grants-governance.integration.test.ts` (11), through the real app: no credential 401, a service credential 403; a self grant, the grantee as checker and the maker as checker are refused; no step up is refused; an unknown change is 404; malformed fields, limits and expiry (missing, past, before `validFrom`, beyond 366 days) are 400; one pending change and one active grant per caller and capability; nothing is granted before approval; a grant starts at approval unless `validFrom` is later; a revoke keeps the row; reject needs a reason and resolves once.
- `packages/api/tests/unit/authority-grants-route-clock.test.ts` (1): a grant whose `validUntil` passed while it waited is refused on approval, granting nothing.
- `packages/api/tests/integration/authority-grant-runtime.integration.test.ts` (1): a grant made and revoked through the API is what the runtime reads: refused before it, executed within it, refused above its limit and after the revoke.
- `packages/api/tests/integration/policy-in-effect-authority-grant.integration.test.ts` (3) and `packages/policy/tests/unit/PolicyValidator-requireAuthorityGrant.test.ts` (7).
- `packages/storage/tests/integration/postgres-authority-grant-repository.integration.test.ts` (6), against Postgres 16 with every migration, run 2026-10-11: limits and expiry stored; a grant starts at approval or its `validFrom`; one pending change and one active grant per caller and capability; no double resolution; one of two simultaneous approvals applies; the database refuses a self grant, maker or grantee as checker, a grant without expiry and a revoke with limits.
- `python/tests/test_authority_grant_api.py` (7): the Python SDK's requests and decoding.

Evidence

- `packages/runtime/src/authority/AuthorityGrantEvaluator.ts`, `packages/runtime/src/RuntimeEngine.ts`
- `packages/api/src/routes/authority-grants.ts`, `packages/api/src/application.ts`
- `packages/shared/src/domain/authority-grant.ts`, `packages/storage/src/{memory,postgres}/*AuthorityGrantRepository.ts`, `supabase/migrations/20261011120000_add_authority_grants.sql`
- `docs/internal/rfcs/RFC-0023-Business-Validation.md` (Authority grants), `docs/site/guides/grant-an-agent-authority.mdx`

---


## Cited evidence paths

- `docs/internal/rfcs/RFC-0023-Business-Validation.md`: EXISTS
- `docs/site/guides/grant-an-agent-authority.mdx`: EXISTS
- `examples/live-checks/authority-grant`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/routes/authority-grants.ts`: EXISTS
- `packages/api/tests/integration/authority-grant-runtime.integration.test.ts`: EXISTS
- `packages/api/tests/integration/authority-grants-governance.integration.test.ts`: EXISTS
- `packages/api/tests/integration/policy-in-effect-authority-grant.integration.test.ts`: EXISTS
- `packages/api/tests/unit/authority-grants-route-clock.test.ts`: EXISTS
- `packages/policy/tests/unit/PolicyValidator-requireAuthorityGrant.test.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/src/authority/AuthorityGrantEvaluator.ts`: EXISTS
- `packages/runtime/tests/unit/authority-grant-evaluator.test.ts`: EXISTS
- `packages/runtime/tests/unit/authority-grants-runtime.test.ts`: EXISTS
- `packages/shared/src/domain/authority-grant.ts`: EXISTS
- `packages/storage/tests/integration/postgres-authority-grant-repository.integration.test.ts`: EXISTS
- `python/tests/test_authority_grant_api.py`: EXISTS
- `supabase/migrations/20261011120000_add_authority_grants.sql`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/authority-grant-runtime.integration.test.ts` | passed | 1 | 1 | 0 |
| `packages/api/tests/integration/authority-grants-governance.integration.test.ts` | passed | 11 | 11 | 0 |
| `packages/api/tests/integration/policy-in-effect-authority-grant.integration.test.ts` | passed | 3 | 3 | 0 |
| `packages/api/tests/unit/authority-grants-route-clock.test.ts` | passed | 1 | 1 | 0 |
| `packages/policy/tests/unit/PolicyValidator-requireAuthorityGrant.test.ts` | passed | 7 | 7 | 0 |
| `packages/runtime/tests/unit/authority-grant-evaluator.test.ts` | passed | 14 | 14 | 0 |
| `packages/runtime/tests/unit/authority-grants-runtime.test.ts` | passed | 9 | 9 | 0 |
| `packages/storage/tests/integration/postgres-authority-grant-repository.integration.test.ts` | passed | 6 | 0 | 6 |
| `python/tests/test_authority_grant_api.py` | passed | 7 | 7 | 0 |
