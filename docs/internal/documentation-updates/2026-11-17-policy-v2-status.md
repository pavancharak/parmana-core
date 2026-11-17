# Documentation update: policy version 2 status

- **Date:** 2026-11-17
- **Trigger:** "updated documentation", after the policy version 2 build steps 1 to 8 were merged
- **Commit:** the commit that adds this record (see `git log` on `claude/v2-docs-update`)
- **Branch:** `claude/v2-docs-update`

## Documents checked

| Document                                                    | Changed | Reason                                                                                                                           |
| ----------------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `packages/policy/src/v2/*.ts` (module headers)              | yes     | Headers said the modules were standalone and not used by the runtime. They are used now, and the headers now say where.          |
| `docs/internal/design/POLICY-V2-SPEC.md`                    | yes     | Status said "not yet built". The runtime applies the specification now.                                                          |
| `docs/internal/design/CONSOLIDATED-DESIGN-AND-DECISIONS.md` | yes     | Section 8.3 said nothing was built, and that the validator had not run the spec examples. Section 9 now states the build status. |
| `docs/internal/design/POLICY-V2-REGISTER-API.md`            | yes     | Added that source integrations are not connected.                                                                                |
| `docs/internal/runbooks/ENV-VARIABLE-REFERENCE.md`          | yes     | The entry said SES bounces were not read back. The SNS adapter reads them when enabled.                                          |
| `docs/internal/design/CHECKPOINT.md`                        | yes     | Added a current-state section at the top.                                                                                        |
| `docs/internal/design/TRUSTED-UNTRUSTED-PLAN.md`            | no      | Describes decisions and principles, with no build status.                                                                        |
| `docs/internal/design/GOVERNANCE-CONSOLE-DESIGN.md`         | no      | Describes the console's design. The console route now serves it, and the design does not state a status.                         |
| `docs/internal/design/OWNER-HELP-GUIDE.md`                  | no      | Describes owner tasks. It does not state build status.                                                                           |
| `docs/internal/design/NEW-SYSTEM-DESIGN.md`                 | no      | No build status is stated.                                                                                                       |
| `docs/internal/design/PROVIDER-EVENT-ADAPTERS.md`           | no      | Already states the SES adapter is built and other providers are not.                                                             |
| `docs/internal/decisions/POLICY-V2-ROLES-DECISION.md`       | no      | Records a decision. Decisions are not edited.                                                                                    |
| `CLAUDE.md`                                                 | no      | Repository instructions.                                                                                                         |

## Checks

- [x] Each factual claim was checked against the repository. The validator's example tests are in `packages/policy/tests/unit/policy-v2-validator.test.ts`. The bounce, notification and console routes are in `packages/api/src/routes/`. The SNS adapter is `packages/api/src/policyV2/policyV2Sns.ts`.
- [x] Package names match `packages/*/package.json`.
- [x] Commands match `package.json` scripts. This update runs none beyond formatting.
- [x] Workflow names match `.github/workflows/`. Not affected.
- [x] No policy, exit criterion or acceptance principle changed. No owner decision was needed.
- [x] Earlier results entries were not rewritten.
- [x] `npx prettier --check` passes on the changed files.

## Not verified

- The current pull request numbers in the checkpoint: checked against the list of open pull requests, which was empty. The merged numbers were taken from the merge history.

## Open items

1. A bounce adapter for a provider other than SES, waiting for the provider's name.
2. Source integrations, waiting for the systems and their owners.
3. Business inputs: owner names, threshold values, intermediary operators, contacts, and the owner's confirmation of decisions D6 to D19.
