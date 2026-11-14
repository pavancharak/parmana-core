# Testing and documentation updates

This folder holds the templates used when the assurance documents are updated or when testing results are recorded. Each template lives under [`templates/`](templates/).

## Standing rule

When a request says **"updated documentation"**, **"testing results"** or similar, do the following without waiting for a reminder:

1. Identify which documents the change affects, using the map below.
2. Update each affected document. Use the matching template where one exists.
3. Record only outputs that were actually produced. Write "not run" for anything not run.
4. Commit on a `claude/` branch with a sign-off, and push to that branch. Open a pull request only when the user asks for one.

`CLAUDE.md` holds the full rules for assurance testing.

## Documents and what they hold

| Document                             | Holds                                      | Change it when                                                             |
| ------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------- |
| `docs/ASSURANCE_TESTING_PLAN.md`     | The plan, phases, exit criteria, gates     | The plan or its status changes. Policy changes need an owner decision.     |
| `docs/ASSURANCE_TESTING_STANDARD.md` | PARMANA-ATS-001, the adopted standard      | The standard's requirements or mappings change.                            |
| `docs/ASSURANCE_RESULTS.md`          | The results log and the phase status table | Any test or check is run. Append an entry. Do not rewrite earlier entries. |
| `docs/ASSURANCE_DECISIONS.md`        | Owner decisions D1 to D5                   | An owner decision is recorded.                                             |
| `docs/ASSURANCE_TESTING_OVERVIEW.md` | Explanation of the plan for readers        | The plan's phases or rules change.                                         |
| `CLAUDE.md`                          | Rules for Claude Code in this repository   | The rules change, with owner approval.                                     |

## Templates

| Template                                                                       | Use                                              |
| ------------------------------------------------------------------------------ | ------------------------------------------------ |
| [`templates/assurance-results-entry.md`](templates/assurance-results-entry.md) | A new entry in `ASSURANCE_RESULTS.md`            |
| [`templates/assurance-run-report.json`](templates/assurance-run-report.json)   | The machine-readable report (standard Section 7) |
| [`templates/documentation-update.md`](templates/documentation-update.md)       | A checklist for a documentation update           |
| [`templates/decision-record.md`](templates/decision-record.md)                 | A new owner decision                             |

## Evidence rules

- A result is recorded only when the command was run and its output was observed.
- Each entry records the commit SHA tested, the exact command, the runtime, the results and the open items.
- A check that was not run is recorded as "not run", with the reason.
- Survivor classifications are kept separate from mutation scores.

## PoAE benchmark

The benchmark specification lives in [`poae/`](poae/README.md). Update [`poae/benchmark-spec.md`](poae/benchmark-spec.md) when a gap closes or a test is run. Record results with the templates above.

## Coverage and direction

- [`docs/assurance/COVERAGE_REGISTER.md`](../docs/assurance/COVERAGE_REGISTER.md) lists what each product claim covers. Update it whenever coverage changes.
- [`docs/assurance/PERMANENT_DIRECTION.md`](../docs/assurance/PERMANENT_DIRECTION.md) is the standing reference for priorities.
- [`docs/assurance/FROZEN_CORE.md`](../docs/assurance/FROZEN_CORE.md) is the rule and the procedure for changing the frozen cryptographic core.
- [`docs/assurance/OPEN_ITEMS.md`](../docs/assurance/OPEN_ITEMS.md) lists every open item, with the decision or action it needs.
