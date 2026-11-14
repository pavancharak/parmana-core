# Permanent direction for Parmana assurance

**Status:** Accepted by the owner on 14 November 2026 (decision D13 in [ASSURANCE_DECISIONS.md](../ASSURANCE_DECISIONS.md)).
**Owner:** Pavan Charak.

This records the long-term direction the owner agreed to. It is the standing reference for future work. It sets priorities; it does not change the plan's score policy, phase exit criteria or acceptance principles.

## Core position

- A claim is only as strong as the part of the system a third party can check without trusting the operator.
- Internal checks (the gateway, the reconciliation job, the stored trust records) are necessary. They are not sufficient for the claim that a third party can verify evidence, because whoever controls the database can change what those checks see.
- The target is an external anchor and a verifier that does not depend on Parmana's infrastructure.

## Standing actions

1. **Never claim more than the coverage register shows.** Every product claim links to [COVERAGE_REGISTER.md](COVERAGE_REGISTER.md). A claim with no entry there is not made.
2. **Run the benchmark as a CI gate.** One run on one commit is evidence for that commit only. The runner in `tests/assurance/poae/` runs in the existing test job. A failing benchmark test blocks the merge. It must not be skipped to get green.
3. **Write the frozen-core list.** D8 was decided as "define as proposed". The draft list is in [COVERAGE_REGISTER.md](COVERAGE_REGISTER.md), section 3. It needs owner confirmation before the rule is enforced.
4. **One source of truth for each fact.** Plan, results log, decision record and design notes overlap. Where a fact appears in more than one document, the document named as its source wins, and the others link to it. Architecture tests that check documents against code are the preferred way to keep them consistent.
5. **Independent review of the verifier.** The signature encoding defect was found by the benchmark, not by review. Before the verifier is relied on externally, it needs an outside review and fuzz tests on the parsers.
6. **Keep pull requests small.** Nothing in this branch reaches `main` until its PR merges. Merge in small, reviewable steps.

## Target (not started)

- An external anchor for trust records, so removal is detectable by a party that does not run Parmana (decision D11, option C).
- A verifier that runs without Parmana's storage, using only the published records and public keys.

## What this does not establish

This direction does not establish that Parmana is secure. It defines what would have to be true for a third party to check the evidence. Independent review and adversarial testing remain necessary, as the plan states in its limits section.
