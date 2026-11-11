# 2.2 Deterministic Policy Selection

Source: CLAIMS.md (commit d1d63c6), lines 79-108.

## Exact claim text

## 2.2 Deterministic Policy Selection

Parmana executes exactly one explicitly referenced business policy.

The runtime loads the policy identified by the Business Transaction and validates its identity before evaluation.

The runtime does not:

- discover policies

- negotiate policies

- automatically select the latest version

- substitute alternative policies

A Business Transaction referencing a `(name, version)` pair with no corresponding file fails closed: `FilePolicyRepository.load` throws `PolicyNotFoundError` (distinct from `PolicyValidationError`/`SignalValidationError`, which map to `400`), the error handler maps it to `404`, and no policy evaluation, connector dispatch, or Refusal Record write occurs — there is no fallback to a default or most-recent version.

Evidence

- PolicyRouter

- PolicyValidator

- `packages/policy/src/FilePolicyRepository.ts` (`PolicyNotFoundError`), `packages/api/src/middleware/error-handler.ts` (maps to `404`)

- `packages/api/tests/unit/execute-api.test.ts`: `"returns 404 when the referenced policy does not exist (PolicyNotFoundError)"`

---

## Cited evidence paths

- `packages/api/src/middleware/error-handler.ts`: EXISTS
- `packages/api/tests/unit/execute-api.test.ts`: EXISTS
- `packages/policy/src/FilePolicyRepository.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                     | Status | Tests | Passed | Skipped |
| --------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/execute-api.test.ts` | passed | 3     | 3      | 0       |
