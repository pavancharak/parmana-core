# Decision: pin the readiness engine to a reviewed commit

- **Reference:** PRG-D1
- **Source:** Pull request #768 (Add the Production Readiness Gate); the 2026-11-22 discussion of the bootstrap failure
- **Date recorded:** 2026-11-22
- **Owner:** Pavan Charak

## Question

The gate takes its engine and policy from the base branch. The engine first lands on `main` only with pull request #768, so on that pull request the base has no engine and the check fails closed. How should the gate get its rules, both for this first introduction and afterwards?

## Options considered

1. Merge #768 with the admin bypass. The gate never checks its own introduction, and later changes to the gate still come from whatever is on `main`.
2. Fall back to the pull request's own engine when `main` has none. A pull request could then run its own rules. Rejected.
3. Pin the engine and policy to a reviewed commit SHA in the workflow file, record the bootstrap as this decision, and fail with a clear message when the pinned engine is missing.

## Recommendation

Option 3. The rules a commit is judged by become a named, reviewed version. The first introduction is an explicit owner decision, recorded here, not an accident of the merge order.

## Owner decision

Approved by Pavan Charak on 2026-11-22: option 3. The engine and policy are pinned to commit `1173d062744252dc217b779d932c1838f228912e` (the commit that first adds them). Owner records are read from the base branch of each pull request.

## Effect on the documents

| Document                                     | Change                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/production-readiness.yml` | Engine and policy come from `ENGINE_SHA`, not from the base branch. Owner records come from the base branch. A clear error when the pinned engine is missing. |
| `docs/PRODUCTION_READINESS.md`               | Enforcement rule 1 describes the pin. A Bootstrap section points to this record.                                                                              |

## Not changed by this decision

- The gate's checks, gate definitions and pass/fail rules in `readiness-policy.json`.
- Strict enforcement: no override path, and a missing engine still fails.
- Owner records: each release still needs the three G8 records, read from the base branch once merged.
- Changing `ENGINE_SHA` later requires a reviewed pull request that records a new decision.
