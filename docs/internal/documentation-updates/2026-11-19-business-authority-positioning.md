# Documentation update: Business Authority positioning, marketing content

- **Date:** 2026-11-19
- **Trigger:** "revise docs site, in parmana core only marketing content", applying the positioning foundation in `docs/internal/positioning/POSITIONING-FOUNDATION.md`
- **Commit:** recorded in the git log of the commit that adds this file (a commit cannot name its own SHA)
- **Branch:** `claude/elegant-edison-gawxlj`

## Documents checked

| Document                                                                                                           | Changed         | Reason                                                                                     |
| ------------------------------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------------------------------------------------------ |
| `docs/internal/positioning/POSITIONING-FOUNDATION.md`                                                              | yes (new)       | Positioning foundation for owner approval                                                  |
| `docs/site/index.mdx`                                                                                              | yes             | Homepage: positioning, Declared, Authorized, Executed, Proven, a refund example, status    |
| `docs/site/llms.txt`                                                                                               | yes (generated) | Homepage description changed. Regenerated with `npm run generate:llms-txt`                 |
| `docs/site/llms-full.txt`                                                                                          | yes (generated) | Homepage body changed. Regenerated with `npm run generate:llms-txt`                        |
| `docs/site/how-parmana-compares.mdx`                                                                               | yes             | Short version restated. Four-category distinction added                                    |
| `docs/site/why-parmana-is-built-this-way.mdx`                                                                      | yes             | Section 8 corrected to claim 2.58. Four ADR links repointed to `docs/internal/adr/`        |
| `README.md`                                                                                                        | yes             | Opening lead restated with the positioning                                                 |
| `docs/internal/CLAIMS.md`                                                                                          | no              | Category change needs an owner decision (foundation, decision 2)                           |
| `docs/internal/adr/ADR-0017-Operator-Kill-Switch.md`                                                               | no              | Status line is stale. Flagged for engineering (foundation, item 12)                        |
| `docs/site/handbook/12-connectors.mdx`, `docs/site/integrations/overview.mdx`                                      | no              | Technical pages with broken ADR links. Flagged (foundation, item 13)                       |
| `docs/site/faq.mdx`, `docs/site/how-parmana-thinks.mdx`, `docs/site/choose-your-path.mdx`, `docs/site/roadmap.mdx` | no              | Reviewed. Technical or navigation content, with no positioning change needed for this pass |

## Checks

- [x] Each factual claim was checked against the repository. Claim sources are cited in the foundation document. The kill switch was checked against claim 2.58 and `packages/api/src/app.ts`. The approval lifetime (15 minutes by default, up to a day) was checked against `docs/site/sdks/typescript.mdx` and `docs/site/sdks/python.mdx`.
- [ ] Package names match `packages/*/package.json`. Not applicable: no package names changed.
- [x] Commands match `package.json` scripts. `npm run generate:llms-txt` (exit 0), `npm run build` (exit 0).
- [ ] Workflow names match `.github/workflows/`. Not applicable: no workflow names changed.
- [ ] Any policy, exit criterion or acceptance principle change has an owner decision recorded. Not applicable: no assurance policy changed.
- [x] Earlier results entries were not rewritten. Not applicable: no results entries changed.
- [x] `npx prettier --check` passes on the changed files (`index.mdx`, `how-parmana-compares.mdx`, `why-parmana-is-built-this-way.mdx`, `README.md`, `POSITIONING-FOUNDATION.md`).
- [x] Architecture tests pass under Node 24, the `.nvmrc` version: `tests/architecture` 26 files, 590 tests, including `llms-txt-up-to-date` and `documentation-references`, and `terminology-guard`. The suite does not run on Node 22 because it generates an ML-DSA-65 key.

## Not verified

- Commit signature: the configured SSH signing key file (`/home/claude/.ssh/commit_signing_key.pub`) is empty and its private key is absent, so commits in this session cannot be signed. Commits carry the `Signed-off-by` line only. Re-sign with `git rebase --exec 'git commit --amend --no-edit -S' <base>` once a key is available.
- Quickstart timing: the earlier homepage claim of "under 10 minutes" was removed because no measured run is recorded.
- Live site: the built site at docs.parmanasystems.com was not rendered. Mintlify was not run here.

## Open items

1. Owner decision: approve or amend the positioning foundation, sections 1 and 2.
2. Owner decision: category in `docs/internal/CLAIMS.md` section 1 ("Execution Trust Infrastructure") against the new positioning.
3. Owner decision: the public status line. This update keeps "prototype" on the homepage and the README.
4. Engineering: update the status line of ADR-0017 to match claim 2.58.
5. Engineering: repoint the ADR-0018 and ADR-0013 links on the handbook and integrations pages.
6. Owner or engineering: claim numbers 2.58 and 2.59 are each used twice in `docs/internal/CLAIMS.md`.
7. Parmana Systems website (`parmanasystems.com`) lives in another repository and is not changed here.
