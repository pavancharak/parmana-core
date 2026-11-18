# Evidence review procedure

**Status:** reference draft. The frequency and the reviewers are **PROPOSED**; the owner confirms them.

## What is reviewed

The evidence log records each decision: the outcome, the reason, each sourced answer and its check, each refusal, and each review. It is the record that shows why a decision was made.

## Who reviews

- **Primary:** Asha (gate owner), ASSUMED.
- **Second:** Mamta (gate owner), ASSUMED.
- The action owner, Mohinder, receives the monthly summary.

A reviewer must not review decisions for an action they own or succeed (the same separation as the go-live gate).

## How often

- **First month:** weekly.
- **After that:** monthly, or after any incident.

## What to check in each review

1. Every `APPROVE` has `released: false` and a policy version that was approved on the date of the decision.
2. Every refusal names its rule or check. No refusal is missing a reason.
3. The count of `SOURCE_UNAVAILABLE` refusals is in line with the adapter's log (see `09`).
4. No decision used a value whose answer failed a check.
5. No review was decided by a reviewer who is also the requester.
6. Anything unusual is raised with the action owner the same day.

## Recording the review

Record each review in a dated note, with the period reviewed, the number of decisions, the findings, and the reviewers' names. Keep the note with the change log.

## Escalation

- A decision that should not have been approved: stop the capability (see `POLICY-V2-ENABLEMENT.md`, section 7) and tell the action owner.
- A compromised source key: follow `08`.
