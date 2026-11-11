# 2.52 A Request Whose Signals Do Not Have the Declared Types Is Refused (Scoped, 2026-10-05)

Source: CLAIMS.md (commit d1d63c6), lines 683-704.

## Exact claim text

## 2.52 A Request Whose Signals Do Not Have the Declared Types Is Refused (Scoped, 2026-10-05)

**Claim:** before any rule runs, every signal a policy declares in `signalsSchema` must have the declared type (`boolean`, `number` or `string`). A request that sends one with another type, such as an amount as text (`"150000"`), `null`, an array, `NaN` or `Infinity` for a number, is refused with `matchedRuleId` `signal-type-violation`, a reason naming each mismatching signal, and no rule evaluated. A policy whose `signalsSchema` declares any other type fails validation.

Why: numeric operators are false for a value that is not a number, so without this check a rule written as "reject if amount gt X, otherwise approve" would not fire for an amount sent as text. Mutation testing surfaced it (docs/internal/testing/MUTATION-TESTING.md); no shipped policy was found to approve such a request, since each also needs a signed approval.

Scope, stated plainly:

- **Only declared signals are checked.** A signal the policy does not list in `signalsSchema` is not, and a policy with no `signalsSchema` is evaluated as before.
- **An absent signal is not a type violation.** It is left to the rules, where a missing fact satisfies no condition (`PolicyEngine`).
- **Not deployed** until this change is merged and deployed. **Update (2026-10-11):** deployed; production runs `main` at `4fdc2c2` (#100) and answers `GET /health` `UP` and `GET /ready` `READY`.

Verification

- `packages/policy/tests/unit/signalTypes.test.ts`: an amount as text is refused where the rules alone would approve it; booleans as text or numbers, strings as numbers, `null`, arrays, objects, `NaN` and `Infinity` refused; every mismatch named; correctly typed, absent, undeclared and inherited signals not refused; `PolicyValidator` refuses an unknown type, a non-string type, an array and `null` as `signalsSchema`.

Evidence

- `packages/policy/src/signalTypes.ts`, `packages/policy/src/PolicyEngine.ts` (`evaluate`), `packages/policy/src/PolicyValidator.ts`

---

## Cited evidence paths

- `packages/policy/src/PolicyEngine.ts`: EXISTS
- `packages/policy/src/PolicyValidator.ts`: EXISTS
- `packages/policy/src/signalTypes.ts`: EXISTS
- `packages/policy/tests/unit/signalTypes.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                        | Status | Tests | Passed | Skipped |
| ------------------------------------------------ | ------ | ----- | ------ | ------- |
| `packages/policy/tests/unit/signalTypes.test.ts` | passed | 21    | 21     | 0       |
