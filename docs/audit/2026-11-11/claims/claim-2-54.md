# 2.54 Any Business System Can Be a Trusted Signal Source: Registered Through Maker Checker, Asked With a Signed Query, Answers Verified (Scoped, 2026-10-11)

Source: CLAIMS.md (commit d1d63c6), lines 735-763.

## Exact claim text

## 2.54 Any Business System Can Be a Trusted Signal Source: Registered Through Maker Checker, Asked With a Signed Query, Answers Verified (Scoped, 2026-10-11)

**Claim:** a business system that owns facts a policy needs (an ERP, an order system, a CRM, a ledger) is registered under a name through maker checker: a human proposes `register` with an HTTPS endpoint and, optionally, the Ed25519 public key it signs answers with, and a different human approves with a step up authorization. Only then do policies that name it in `signalSources` get answers from it. Parmana asks it with a query signed by Parmana's default key, naming the source, the endpoint as audience, the claim, the business object, the action, the transaction and a fresh nonce, valid 60 seconds. The endpoint's address is checked as public on proposal, on approval and before every query, and the query is sent to that address with redirects refused and the answer limited to 16 KiB. Parmana trusts an answer only when it is HTTP 200, version 1, and echoes the query's source, nonce, signal key, claim and subject; and, for a source registered with a key, only when it carries a valid Ed25519 signature over the canonical answer under that key (and the registered `keyId`, when given). Anything else is `SOURCE_UNAVAILABLE` and refuses the request. A verified answer is recorded in the Trusted Signal with `sourceProof`, `sourceKeyId` and `sourceProofVerified: true`, inside the signed Execution Trust Record or Refusal Record. Revoking a source makes every policy that names it refuse from the next request.

Scope, stated plainly:

- **Not deployed** until this change is merged and deployed, and **no real business system has been connected.** Every test runs against in-process endpoints, including the example endpoint the docs give operators. **Update (2026-10-11):** deployed; `GET /business-signal-sources` answers in production. Still no real business system connected and no source registered there. **Live check, passed in production 2026-10-11** (`examples/live-checks/business-signal-source`): with the demo source `livecheck-erp` (a deployed endpoint answering from a fixed table, registered with an Ed25519 key) and test policy `livecheck-signal`, a request for a paid invoice was approved on the source's signed answer (`sourceProofVerified: true`, released, verifies offline), an unpaid one was refused by the policy on the source's `false`, the agent's `true` against the source's `false` was refused as `INVALID`, and an unknown invoice as `MISSING_DATA`. Transactions `d736681f-8d86-4e24-bcf3-66debfa6ac23`, `266278b4-7683-43fd-97e7-aa724c6cca9a`, `1fd2274c-65e2-47c4-bda5-4dd57b198277` and `173c6f4f-f9d7-46e0-a712-9d9f39a274cd`. No real business system is connected yet.
- **Parmana proves the source said it, not that it is right.** A source answers for its own records.
- **A source registered without a key** is trusted on the pinned HTTPS connection alone; its Trusted Signal has no `sourceProof`. Registering a key is recommended, not required.
- **Checked once, at decision time.** `validUntil` is not re-checked at release; conditional execution is phase 4. **Update (2026-10-11):** re-checked at release, and carried to external systems as conditions.
- **Authority is unchanged** from 2.53: per-agent grants with limits and expiry are phase 3. **Update (2026-10-11):** built, see 2.55.
- **The SDK methods** (`proposeBusinessSignalSourceChange`, `business_signal_sources.propose_register` and the rest) ship in the next SDK release. **Update (2026-10-11):** published in SDK 1.6.0.

Verification

- `packages/api/tests/integration/business-signal-sources-governance.integration.test.ts` (14), through the real app: no credential is 401 and a service credential 403; the maker cannot approve; no step up, or one for the other action, is refused; an unknown change is 404; malformed names, timeouts, keys (not PEM, RSA), a `keyId` without a key, and a revoke with registration fields are 400; `http`, an IP literal, `localhost`, a private address and an unresolvable host are refused; one pending change and one active registration per name; the endpoint is stored normalized and the key in canonical SPKI PEM; nothing is registered until approval; the address is checked again on approval; reject needs a reason and resolves once; a revoke keeps the row.
- `packages/api/tests/unit/http-business-signal-source.test.ts` (29): the query Parmana sends is signed, names exactly this fact, and uses a fresh nonce; a registered source's signature is verified and marked; `not_found` and `conflicting` pass through; a non-200, non-JSON, missing answer, wrong nonce, subject or source, another version or status, missing value, invalid times, no signature, another key's signature, a signature over a different answer, another `keyId` or algorithm are each refused; a private address is refused before anything is sent; through the resolver, a verified Trusted Signal, `SOURCE_UNAVAILABLE` on a bad signature, after a revoke, and when the registry cannot be read; and the documented endpoint (`typescript/examples/08-business-signal-source.ts`) interoperates with the real client, refusing a query not signed by Parmana, meant for another endpoint, expired or repeated, while Parmana refuses its answer under the wrong key.
- `packages/api/tests/integration/business-validation-http-source.integration.test.ts` (3), through the real `RuntimeEngine` with a signed approval: the ERP's verified answer decides and is in the Trust Record; an agent claiming an unpaid invoice is paid is refused `INVALID` in a Refusal Record that verifies after a JSON round trip; after a revoke the request is refused `SOURCE_UNAVAILABLE` and no system is asked.
- `packages/storage/tests/integration/postgres-business-signal-source-repository.integration.test.ts` (6), against Postgres with every migration: register with key, revoke keeping the row; a source without a key; one pending change and one active registration per name; no double resolution, unknown id or revoke of an unregistered name; one of two simultaneous approvals applies; the database refuses the maker as checker, a register without its fields, a `keyId` without a key and a malformed name. Run on 2026-10-11 against a local Postgres 16.
- `python/tests/test_business_signal_source_api.py` (7): the Python SDK's requests and decoding.

Evidence

- `packages/api/src/routes/business-signal-sources.ts`, `packages/api/src/business-sources/HttpBusinessSignalSource.ts`, `packages/api/src/application.ts`
- `packages/shared/src/domain/business-signal-source.ts`, `packages/storage/src/{memory,postgres}/*BusinessSignalSourceRepository.ts`, `supabase/migrations/20261010120000_add_business_signal_sources.sql`
- `docs/internal/rfcs/RFC-0023-Business-Validation.md` (Business signal sources, Wire protocol), `docs/site/guides/connect-a-business-signal-source.mdx`

---


## Cited evidence paths

- `docs/internal/rfcs/RFC-0023-Business-Validation.md`: EXISTS
- `docs/site/guides/connect-a-business-signal-source.mdx`: EXISTS
- `examples/live-checks/business-signal-source`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/business-sources/HttpBusinessSignalSource.ts`: EXISTS
- `packages/api/src/routes/business-signal-sources.ts`: EXISTS
- `packages/api/tests/integration/business-signal-sources-governance.integration.test.ts`: EXISTS
- `packages/api/tests/integration/business-validation-http-source.integration.test.ts`: EXISTS
- `packages/api/tests/unit/http-business-signal-source.test.ts`: EXISTS
- `packages/shared/src/domain/business-signal-source.ts`: EXISTS
- `packages/storage/tests/integration/postgres-business-signal-source-repository.integration.test.ts`: EXISTS
- `python/tests/test_business_signal_source_api.py`: EXISTS
- `supabase/migrations/20261010120000_add_business_signal_sources.sql`: EXISTS
- `typescript/examples/08-business-signal-source.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/business-signal-sources-governance.integration.test.ts` | passed | 14 | 14 | 0 |
| `packages/api/tests/integration/business-validation-http-source.integration.test.ts` | passed | 3 | 3 | 0 |
| `packages/api/tests/unit/http-business-signal-source.test.ts` | passed | 30 | 30 | 0 |
| `packages/storage/tests/integration/postgres-business-signal-source-repository.integration.test.ts` | passed | 6 | 0 | 6 |
| `python/tests/test_business_signal_source_api.py` | passed | 7 | 7 | 0 |
