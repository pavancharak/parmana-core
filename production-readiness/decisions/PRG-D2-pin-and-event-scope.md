# Decision: pin the readiness engine to d93f4d1; scope checks by event

- **Reference:** PRG-D2
- **Source:** Pull request #768; the 2026-11-22 discussion of the G7 race, the G3 Scorecard and G8 deadlock, and the tag pinning plan
- **Date recorded:** 2026-11-22
- **Owner:** Pavan Charak

## Question

The CI run of #768 still used the engine at `1173d06`, so the G7 wait fix did not apply. G3's Scorecard check cannot pass on a pull request, and G8's owner records cannot pass on a pull request. How should the pin move, and how should checks be scoped?

## Options considered

1. Pin the release tag `prg-v1.0.0` (the plan in PRG-D2 as first proposed). A tag is readable and can be protected. The tag push was refused by GitHub (HTTP 403) during this session, so it cannot be created from here.
2. Pin the commit `d93f4d1`, which is on the remote branch, and create the tag later.
3. Keep the old pin and document the failures.

## Recommendation

Option 2 now, option 1 when the owner can push the tag. Pinning a reviewed commit keeps the same trust model: the rules are fixed to a named version, and changing the pin needs a decision record. The tag only changes the name.

## Owner decision

Approved by Pavan Charak on 2026-11-22: option 2. The pin moves to `d93f4d129a9e2e00087bc706145543ef4f076d1b`. The tag `prg-v1.0.0` is to be created by the owner on that commit and then used as the pin, with a follow-up decision record.

Also approved: event-scoped checks. Checks with `run_on` report NOT_APPLICABLE on other events. G3.scorecard runs on push. G8 release checks run on release, except DCO and signatures. The workflow passes `--event` (`github.event_name`) and runs on `release`.

## Effect on the documents

| Document                                              | Change                                                                            |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `.github/workflows/production-readiness.yml`          | `ENGINE_SHA` is `d93f4d1`. The gate passes `--event`. Adds the `release` trigger. |
| `production-readiness/scripts/evaluate-gates.py`      | Adds `NOT_APPLICABLE` and `--event`. A gate passes only with at least one PASS.   |
| `production-readiness/policies/readiness-policy.json` | `run_on` on G3.scorecard and on the G8 release checks.                            |
| `docs/PRODUCTION_READINESS.md`                        | Full description of the gate, the pin and the events.                             |

## Not changed by this decision

- The checks themselves, their commands and their timeouts, apart from the `run_on` scopes above.
- Strict enforcement: no override path, a missing pinned engine still fails, and a skipped check still fails its gate.
- Owner records: each release still needs the three G8 records, read from the base branch once merged.
- Any change to the pin needs a new decision record and owner approval.
