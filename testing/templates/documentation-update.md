# Documentation update: <short title>

- **Date:** YYYY-MM-DD
- **Trigger:** <what was asked, for example "updated documentation" or "testing results">
- **Commit:** `<SHA>`
- **Branch:** `<branch>`

## Documents checked

| Document                             | Changed  | Reason   |
| ------------------------------------ | -------- | -------- |
| `docs/ASSURANCE_TESTING_PLAN.md`     | yes / no | <reason> |
| `docs/ASSURANCE_TESTING_STANDARD.md` | yes / no | <reason> |
| `docs/ASSURANCE_RESULTS.md`          | yes / no | <reason> |
| `docs/ASSURANCE_DECISIONS.md`        | yes / no | <reason> |
| `docs/ASSURANCE_TESTING_OVERVIEW.md` | yes / no | <reason> |
| `CLAUDE.md`                          | yes / no | <reason> |

## Checks

- [ ] Each factual claim was checked against the repository. Note the file and line or the command output.
- [ ] Package names match `packages/*/package.json`.
- [ ] Commands match `package.json` scripts.
- [ ] Workflow names match `.github/workflows/`.
- [ ] Any policy, exit criterion or acceptance principle change has an owner decision recorded in `docs/ASSURANCE_DECISIONS.md`.
- [ ] Earlier results entries were not rewritten. Corrections are dated notes.
- [ ] `npx prettier --check` passes on the changed files.

## Not verified

- <claim>: <reason it could not be checked>

## Open items

1. <item>
