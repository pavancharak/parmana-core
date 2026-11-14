# Instructions for Claude in parmana-core

## Assurance testing

When asked to run, update or report assurance testing:

1. Read `docs/ASSURANCE_TESTING_PLAN.md` for the plan and `docs/ASSURANCE_RESULTS.md` for the latest entry and the phase status table.
2. Run the requested checks. Record only outputs that were actually produced. If a check cannot be run in the session, say so and record it as "not run". Do not report a result you did not observe.
3. Append a new dated entry to `docs/ASSURANCE_RESULTS.md` using the template at the end of that file. Record the commit SHA tested, the command, the runtime, the results and the open items.
4. Update the phase status table in `docs/ASSURANCE_RESULTS.md` when a phase's status changes.
5. Do not change the score policy, the phase exit criteria or the acceptance principles in the plan without a decision from the owner, Pavan Charak. Propose changes in the PR description instead.
6. Do not rewrite earlier entries in the results log. Correct them with a dated note.
7. Commit on a `claude/` branch and open a pull request for the update. Do not push to `main`.

## Documentation and testing updates

When asked for "updated documentation", "testing results" or similar:

1. Read `testing/README.md` for the map of documents and the templates.
2. Identify every document the change affects, and update each one. Do not stop at the first document.
3. Use the templates under `testing/templates/`: `assurance-results-entry.md` for results, `assurance-run-report.json` for the machine-readable report, `documentation-update.md` for a documentation checklist, and `decision-record.md` for owner decisions.
4. Record only outputs that were actually produced. Write "not run" for anything not run, with the reason.
5. Commit on a `claude/` branch with a sign-off, and push to that branch. Open a pull request only when the user asks for one.

## Commits

- Sign off every commit with `Signed-off-by`, as the DCO check requires.
- Sign commits with the repository's signing key where one is configured. The `verified-commits` check fails otherwise.
