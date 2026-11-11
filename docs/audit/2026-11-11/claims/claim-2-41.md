# 2.41 The TypeScript and Python SDKs Cover the Same Product API (Scoped, SDK 1.3.0, Published)

Source: CLAIMS.md (commit d1d63c6), lines 1387-1417.

## Exact claim text

## 2.41 The TypeScript and Python SDKs Cover the Same Product API (Scoped, SDK 1.3.0, Published)

Both SDKs have a method for every product operation of the API, the same set in each, and the same offline and signing capabilities. The mapping, with the reason for each route that has no method, is `docs/site/sdks/api-coverage.mdx`.

- **Policy governance**, which neither SDK had: propose (`POST /policies/{name}/{version}/pending-changes`), list for review (`GET /policies/pending-changes`), approve and reject (`POST /policies/pending-changes/{id}/approve|reject`), and signing the step up authorization on the approver's machine (`signPolicyChangeStepUp()`, `parmana.crypto.sign_policy_change_step_up()`). The signature is the server's own format: key sorted canonical JSON of the payload, Ed25519, base64.
- **Also in both:** `GET /callers/me`, `GET /keys/{keyId}`, and Trust Record listing (`GET /trust-records`, with `since` and `until`).
- **TypeScript gains what only Python had:** offline verification of Trust Records and Execution Intents, `GET /receipt/latest/{id}`, and the HTTP status on every error (`statusCode`, Python's `status_code`).
- **Python gains:** the offline verifiers accept the SDK's own decoded models as well as raw JSON, and a `latest_receipt()` shortcut.
- Policy content and step up authorizations are sent exactly as given. The Python SDK's model encoder rewrites dict keys with an underscore to camelCase; the new methods do not pass user content through it.

Scope, stated plainly:

- **Published: both.** `@parmana/sdk` 1.3.0 was published to npm on 2026-09-25 (visible at 10:14:57 UTC); installed from npm into a clean project it reports 1.3.0 with every new export, and it passed the same 11 of 11 live checks against a self hosted deployment. `parmana` 1.3.0 was published to PyPI the same day (wheel and source archive); installed from PyPI into a clean environment it reports 1.3.0 with every new method, and it passed the same 11 of 11 live checks against a self hosted deployment.
- The routes with no method are the readiness probe, the JWKS document, the API's own description files and the handbook download, each with its reason in the coverage page.
- ML-DSA-65 is not verified by either SDK; a hybrid record is reported as not valid, with the reason.
- In Python, `client.version` is the SDK's version, while TypeScript's `version()` is the server's. This existing difference is documented, not changed.

Verification

- TypeScript: 191 tests in 18 files pass, including `typescript/test/Alignment.test.ts` (16 tests): the method, path and body of each new operation; offline verification of the same real server signed Execution Intent the Python tests use, and of a Trust Record checked against the server's own reference verifier; a step up authorization accepted by the server's `PolicyChangeStepUpAuthorizationVerifier`; `statusCode` on HTTP errors. The documentation examples were typechecked against the built SDK in strict mode.
- Python: 119 tests pass, including `python/tests/test_sdk_alignment.py` (10 tests), one of which runs the server's TypeScript verifier on a step up authorization signed in Python. `ruff`, `black` and `mypy` are clean. `npm run check:python-models` covers the newly generated `policy_change.py`.
- Live, 2026-09-25, each SDK against a self hosted deployment: caller; public key; propose, list, sign and approve a policy change; a reused signature refused (`403`); a refused request (`403 POLICY_DENIED`) with its Refusal Record verified; an authorized request with no connector (`503`, `CONNECTOR_NOT_REGISTERED` on the error); that request's Execution Intent verified offline with the fetched public key; Trust Record listing. 11 of 11 in each.
- `scripts/check-sdk-docs.ts` passes: every name the SDK pages use exists.

Evidence

- `typescript/src/client/PolicyApi.ts`, `CallerApi.ts`, `TrustRecordApi.ts`, `ReceiptApi.ts`, `ParmanaClient.ts`; `typescript/src/crypto/canonical.ts`, `offline-verifier.ts`, `step-up.ts`; `typescript/src/models/policy-change.ts`, `caller.ts`; `typescript/src/transport/mapHttpErrorResponse.ts`
- `python/parmana/api/policy_api.py`, `caller_api.py`, `trust_record_api.py`; `python/parmana/crypto/step_up.py`, `offline_verifier.py`; `python/parmana/models/policy_change.py` (generated), `policy_change_results.py`, `caller.py`; `python/parmana/client.py`
- `typescript/test/Alignment.test.ts`, `python/tests/test_sdk_alignment.py`
- `docs/site/sdks/api-coverage.mdx`, `docs/site/sdks/typescript.mdx`, `docs/site/sdks/python.mdx`; `docs/internal/VERIFICATION-GAPS.md` G-62 and G-64


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/site/sdks/api-coverage.mdx`: EXISTS
- `docs/site/sdks/python.mdx`: EXISTS
- `docs/site/sdks/typescript.mdx`: EXISTS
- `python/parmana/api/policy_api.py`: EXISTS
- `python/parmana/client.py`: EXISTS
- `python/parmana/crypto/step_up.py`: EXISTS
- `python/parmana/models/policy_change.py`: EXISTS
- `python/tests/test_sdk_alignment.py`: EXISTS
- `scripts/check-sdk-docs.ts`: EXISTS
- `typescript/src/client/PolicyApi.ts`: EXISTS
- `typescript/src/crypto/canonical.ts`: EXISTS
- `typescript/src/models/policy-change.ts`: EXISTS
- `typescript/src/transport/mapHttpErrorResponse.ts`: EXISTS
- `typescript/test/Alignment.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `python/tests/test_sdk_alignment.py` | passed | 11 | 11 | 0 |
| `typescript/test/Alignment.test.ts` | passed | 17 | 17 | 0 |
