# Checkpoint: trusted-signal design and related work

Last updated: 2026-11-17. Read this first when resuming.

## 1. Completed

### Repository (parmana-core)

- **PR #665 merged** into `main` as commit `2f067c8`. It contains:
  - `docs/internal/design/`: six documents (consolidated design and decisions, plan, policy v2 spec, governance console design, owner help guide, requirements-based design).
  - `packages/runtime/tests/unit/refund-amount-scenarios.test.ts`: scenario tests for a consistent but wrong amount. Two assert the current gap, two are todo.
  - `scripts/list-approval-refusals.mjs` and `tests/scripts/list-approval-refusals.test.ts`: a read-only lister for refusals that need a human approval. Tests pass against an in-process server only.
  - `docs/internal/runbooks/APPROVAL-REFUSAL-LISTER.md`, with an index entry.
  - A formatting commit, after CI flagged Prettier issues on ten files.
- The branch `claude/new-session-pox9jt` still exists and matches the merged work. Start new work from the latest `main`.

### Local environment

- Dependencies installed with `npm ci --ignore-scripts`. The `re2` native module was rebuilt.
- Packages built with `npm run build:packages`.
- Node 24.22.2 installed at `/home/user/node24`. Unit tests need Node 24.
- The refund example (`examples/integrations/google-ax-refund/run.ts`) passed all 8 steps.
- Targeted policy and runtime tests passed (57). Lister tests (5), architecture and documentation tests passed.

### Design

- Requirements R1 to R6 and the definitions (trusted, untrusted, caller, approval trust).
- Confirmed by the owner: D1 to D5; manager approval is trusted only when it verifies; the review design (5A, 5B, 5D); the tiered approach (5F).
- Recommended long-term answers, not yet confirmed: D6 to D19 (see section 2).
- The plan's history was removed. The old plan is archived in the scratchpad as `trusted-untrusted-plan-archive.md`.

## 2. Pending

### Needs the business to supply

- Owners and successors for each action, and data owner and signer for each source.
- Threshold values, each with reason, evidence, second approver, and risk-function approval if high-value.
- Named intermediary operators for any source that cannot sign.
- The go-live gate owner (a role in Operations, with a deputy).
- Role-based contacts for the Parmana owner and Operations. These are placeholders in the help guide.

### Needs your confirmation

- D6 to D19. Recommended answers:
  - D6 derive provenance; D7 REVIEW as its own record type; D8 intermediary as signer with data owner recorded; D9 thresholds set by the business through a process; D10 new policy format (version 2); D11 review and approval caps; D12 exact approvals; D13 explicit tier field; D14 full redesign, staged; D15 claims review for the website; D16 no comparison of two values in a rule; D17 units; D18 every number a named threshold, except zero; D19 registered sources and claims.
- Section 4.11 of the plan: intermediaries, windows, go-live gate, existing data, decision confirmation.
- Platform caps: three business days for review, 60 minutes for approval validity.
- Section 4.12 of the plan: two reviewers for high-value items; sign-off by source type; two backup reviewers per action; alert rules.
- Website option: claims review first (D15).
- Policy redesign scope: full version 2, staged (D14).

### Build (not started)

Build order (plan section 6 / consolidated document section 9):

1. Register: sources, keys, actions, thresholds, with owners and approvers.
2. Source signing contract, with tests for unsigned, wrong key, replayed, expired and revoked answers.
3. Policy format and validator, with the 20 checks in the spec. First step: run the two spec examples through it.
4. Decision flow, with tests for each outcome.
5. Approvals: exact, informed, single-use.
6. Review: items, reviewers, windows, decisions.
7. Governance console and alerts.
8. Evidence and replay.

Phase 1 (the validator) does not depend on any open decision. It can start on your go-ahead.

### Open testing and verification

- The two example policies in the spec have not been run through a validator, because none exists yet.
- The two characterisation tests in `refund-amount-scenarios.test.ts` must flip when the gap is closed. The two todo tests need a policy that declares a sourced amount.
- The lister has not been run against a live Parmana instance.
- The full `npm test` and the repository-wide typecheck were not run locally. CI's `build-and-test` passed on the merged commit.

### Operations and outside the repository

- Go-live and treatment of existing data are decided in principle (plan 4.11) but not scheduled. Operations must name the gate owner.
- Nothing has been sent to the business for the owner, threshold or intermediary inputs.

### Housekeeping

- `trusted-untrusted-plan-archive.md` is kept in the scratchpad. Delete it if it is no longer needed.
- Scratch files in the scratchpad (`mock-server.mjs`, `list-refusals.mjs`, `ids.txt`, `report.json`) came from the lister's first test. They are not part of the repository.

## 3. Where things are (repository copies)

Scratchpad copies (sandbox only, may be cleared):

- `TRUSTED-UNTRUSTED-PLAN.md`: the current plan (also in the repository at `docs/internal/design/TRUSTED-UNTRUSTED-PLAN.md`).
- `policy-v2-spec.md`: the policy format (repository: `docs/internal/design/POLICY-V2-SPEC.md`).
- `governance-ui-design.md`: the console (repository: `docs/internal/design/GOVERNANCE-CONSOLE-DESIGN.md`).
- `owner-help-guide.md`: owner instructions (repository: `docs/internal/design/OWNER-HELP-GUIDE.md`).
- `new-system-design.md`: the requirements-based design.
- `consolidated-design-and-decisions.md`: single reference (repository: `docs/internal/design/CONSOLIDATED-DESIGN-AND-DECISIONS.md`).
- `CHECKPOINT.md`: this file.

Repository:

- Design set: `docs/internal/design/`.
- Lister: `scripts/list-approval-refusals.mjs`, its test, and `docs/internal/runbooks/APPROVAL-REFUSAL-LISTER.md`.
- Scenario tests: `packages/runtime/tests/unit/refund-amount-scenarios.test.ts`.

## 4. Resume checklist

1. Pull the latest `main`.
2. Check whether the business has supplied any owner, threshold, intermediary or contact details (section 2).
3. Confirm or change D6 to D19 and the other items in section 2. Record each in the decision record.
4. If Phase 1 is approved, branch from `main`, implement the validator, and run the two spec examples through it.
5. Update the two characterisation tests when the amount gap is closed.
