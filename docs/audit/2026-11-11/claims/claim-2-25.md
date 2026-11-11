# 2.25 Only Authorized Actions Take Effect: Status of the Internal Review

Source: CLAIMS.md (commit d1d63c6), lines 917-932.

## Exact claim text

## 2.25 Only Authorized Actions Take Effect: Status of the Internal Review

**Claim.** Parmana authorizes an action only when the conditions in 2.47 are met: a signed approval from a trusted person for that action and resource, checked at policy load and at decision. This section records how that claim was reviewed, and what the review did and did not cover.

**Review.** The project team reviewed the source four times, each pass run fresh, without relying on the earlier passes' conclusions. The first three passes found one capability that would have violated the claim if it had ever been enabled: `payments:execute` (vendor payment), which had no connector gated by its own authorization. The fourth pass found that capability had been removed from the repository (`docs/internal/VERIFICATION-GAPS.md`, G-27), and found no capability in the current repository that could execute without an approval.

**What the review did not cover.** The reviews were internal, not by an independent third party. The last pass re-ran two of the ten negative tests cited across the reviews; the others were checked by reading code paths that the removal did not change. Multi-tenant authority isolation, and the case where an operator with direct database access bypasses the API, were not re-traced in that pass.

Evidence

- `packages/api/tests/integration/action-without-human-approval.integration.test.ts` (the invariant, through the HTTP API)
- No current test asserts that `payments:execute` has no connector. The earlier test that did was removed with the connector migration, so this point rests on the removal recorded in G-27.
- `docs/internal/VERIFICATION-GAPS.md`, G-27

Dated updates for this claim, and the detail of each review pass, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `packages/api/tests/integration/action-without-human-approval.integration.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/action-without-human-approval.integration.test.ts` | passed | 4 | 4 | 0 |
