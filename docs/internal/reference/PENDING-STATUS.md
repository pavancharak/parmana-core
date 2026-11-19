# Pending status: policy version 2, `crm:read` and `erp:invoice-pay`

> **REFERENCE ONLY. NOT A REAL RECORD.** This is a status record for reference. It is not a decision, an approval, a register entry or a test result. Nothing here enables a capability.

Status date: 2026-11-19. Read this with `NEXT-STEPS.md`, which lists the steps in order.

## 1. Built and merged

| Item                                                                                                    | Where                                             | PR               |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ---------------- |
| Policy version 2 server: decisions, reviews, register, validator, go-live gate, evidence, notifications | `packages/policy`, `packages/api`                 | earlier releases |
| SDK methods for decisions and reviews (4.1.0)                                                           | TypeScript and Python clients                     | #721             |
| Release process: timestamp from the version bump, reproducible builds, registry check                   | `.github/workflows`, `.github/release`            | #717, #724       |
| Published releases: 4.1.1 on npm and PyPI; docs name 4.1.1                                              | npm, PyPI, `docs/site`                            | #725, #726       |
| Enablement runbook, design, `crm:read` runbook and build guide                                          | `docs/internal/runbooks`, `docs/internal/designs` | #727, #728, #729 |
| Reference documents (13), marked reference only                                                         | `docs/internal/reference`                         | #730             |
| SDK replay of a recorded decision, read-only (TypeScript and Python)                                    | Both clients                                      | #732             |
| Source client, source wiring, fixture adapter, and their tests                                          | `packages/api/src/policyV2`, `test-support`       | #733             |
| Documentation brought up to date with the source client                                                 | `docs/site`, `docs/internal`                      | #734             |

PR #731 (next steps checklist) is open unless it has merged since this was written. Check its status before relying on it.

## 2. Built, but not in a release

- The SDK replay (#732) and the source client (#733) are on `main`. They ship in the next SDK release, not in 4.1.1.

## 3. Pending: needs information from the owner

| Item                                                        | Needed            | Blocks                                           |
| ----------------------------------------------------------- | ----------------- | ------------------------------------------------ |
| Accounts system's name, and its API or a sandbox            | Owner (Mohinder)  | The real adapter                                 |
| Staging environment: where it is, and its settings          | Owner or operator | The staging run                                  |
| `crm:read` rules confirmed                                  | Owner (Mohinder)  | Writing the `crm:read` policy and its enablement |
| `erp:invoice-pay` thresholds, tiers and currency            | Owner (Mohinder)  | The `erp:invoice-pay` policy and its enablement  |
| Alert channel: email, SES bounce reports, or console only   | Owner             | Alerts setup (`10-alerts-setup.md`)              |
| Whether the note on the `sdk-v4.1.0` release page is wanted | Owner             | The release page wording                         |
| Whether to look at the Dependabot alert on `main`           | Owner             | The alert                                        |

## 4. Pending: needs building, once the information in section 3 is given

| Item                                                               | Blocked by                        | Who                       |
| ------------------------------------------------------------------ | --------------------------------- | ------------------------- |
| The real adapter beside the accounts system                        | Accounts system's name            | Engineer                  |
| A tooled procedure for holding and rotating the source key         | Adapter design                    | Engineer                  |
| A staging run of the source path, and its test report (`04`, `07`) | Staging environment, real adapter | Operator                  |
| The `crm:read` policy text, validated, and its enablement          | `crm:read` rules confirmed        | Action owner, gate owners |
| The `erp:invoice-pay` policy text, and its enablement              | Thresholds, source in staging     | Action owner, gate owners |

## 5. Not decided, and not built on purpose

- **Register writes in the SDKs** (granting roles, approving policies). These change who may approve what, so they wait for the owner's sign-off.
- **The console and the webhooks in the SDKs.** The console returns HTML, and both SDK transports parse JSON only. Webhooks are inbound callbacks into the server, not an SDK call.

## 6. Known gaps (recorded, not to be fixed by editing history)

- The 4.0.0 and 4.0.1 PyPI Python files differ from their release files, so the release provenance does not cover them. PyPI does not allow re-uploads.
- The 4.1.0 npm packages differ from the 4.1.0 release files in timestamps only. Their contents are identical.
- `@parmana/cli` 4.0.2 on npm differs from its release file in one file mode.

## 7. Who acts next

1. **Owner:** give the accounts system's name, and the staging environment details, then answer section 3.
2. **Engineer:** on receipt of the accounts system's name, build the real adapter (section 4).
3. **Operator:** run the staging steps once the adapter is ready, and record them in `04-staging-test-report.md`.
4. **Owner and gate owners:** confirm the policy text and run the go-live gate, as in `CRM-READ-ENABLEMENT.md` and `POLICY-V2-ENABLEMENT.md`.
