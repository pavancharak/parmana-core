# Master record: per-environment KMS signing key

Date range: 2026-11-13 to 2026-11-14. Account 013659367671, region ap-south-1.
This record indexes everything produced in the work. Secrets, access keys and session
tokens are not recorded here and must never be added.

## 1. Pull requests and branches

| Item                                 | Reference                                            | State                                        | What it contains                                                                        |
| ------------------------------------ | ---------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------- |
| PR #613                              | https://github.com/pavancharak/parmana-core/pull/613 | Merged (commit `a1d75f4d`)                   | `PARMANA_SIGNING_KEY_ID`, `currentSigningKeyId()`, signing call sites, unit tests, docs |
| PR #614                              | https://github.com/pavancharak/parmana-core/pull/614 | Merged                                       | Runbook, command log, status record, production Terraform, `.prettierignore`            |
| PR #615                              | https://github.com/pavancharak/parmana-core/pull/615 | Merged                                       | Status record update                                                                    |
| Branch `claude/gracious-cerf-c2ehq9` | origin                                               | Contains merged history plus docs            | Working branch for the signing key work                                                 |
| Branch `claude/build-order-fix`      | local, on your machine                               | Changes applied, not yet committed or pushed | `build:packages` script; tests and mutation rebuild first                               |
| Branch `claude/sweet-sagan-uzqxcr`   | origin                                               | Unrelated, diverged                          | Not part of this work; do not push to it from this work                                 |

## 2. Documents in the repository

| Path                                                      | Purpose                                                                                                                       |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `docs/dev/runbooks/per-environment-signing-key.md`        | Runbook: what was done and why, steps to repeat, checks, troubleshooting, open items, security notes, known issues, decisions |
| `docs/dev/runbooks/commands-and-policies.md`              | Every command run in order, each policy's JSON, what the setup enables now and next                                           |
| `docs/dev/runbooks/status-per-environment-signing-key.md` | Current state, verified and unverified items, open actions with owners                                                        |
| `docs/site/deployment/environment-variables.mdx`          | Reference row for `PARMANA_SIGNING_KEY_ID`                                                                                    |
| `docs/site/deployment/per-environment-signing-keys.mdx`   | Public page: what the setting enables and how to set it up                                                                    |
| `.env.example`                                            | Commented `PARMANA_SIGNING_KEY_ID` entry                                                                                      |
| `infra/parmana-prod-signing/`                             | Terraform (`main.tf`, `prod.tfvars`, `.terraform.lock.hcl`), `create-signing-key.ps1`, `README.md`, `.gitignore`              |
| `.prettierignore`                                         | Excludes local Terraform providers and state from Prettier                                                                    |

Not in the repository, kept in the working sandbox only: testing report (published as an artifact, see section 6), claims check, and the build-order patch.

## 3. Code changed (PR #613)

- `packages/crypto/src/KeyProvider.ts`: `currentSigningKeyId()`; verification defaults to the signing key.
- `packages/crypto/src/ReceiptCrypto.ts`, `PolicyChangeCrypto.ts`, `ExecutionChainCrypto.ts`, `providers/signer/KmsSigner.ts`: use the configured key.
- `packages/runtime/src/RefusalRecordBuilder.ts`, `ExecutionIntentBuilder.ts`, `BusinessTrustRecordBuilder.ts`, `TenantKeyResolver.ts`: use the configured key.
- `packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.ts`: uses the configured key.
- `packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts`, `createGatewayPublicKey.ts`, `packages/api/src/business-sources/HttpBusinessSignalSource.ts`: use the configured key.
- `packages/crypto/tests/unit/signing-key-id.test.ts`: five tests, all passing.

Local files written during testing (sandbox only, not committed): drill signing helper, drill policy JSON files, Terraform drafts, server logs.

## 4. AWS resources

| Resource               | Identifier                                                     | State                                                                            | Created by                      |
| ---------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------- |
| Production signing key | `7b0c7156-…` (tag `purpose=parmana-prod`)                      | Enabled, `ECC_NIST_EDWARDS25519`, `SIGN_VERIFY`                                  | `create-signing-key.ps1`        |
| Production alias       | `alias/parmana-prod`                                           | Points to the key above                                                          | Terraform                       |
| Server role policy     | `parmana-prod-kms-signing` on role `parmana-vercel-kms-signer` | Sign, GetPublicKey, DescribeKey on the production key only                       | Terraform                       |
| Old shared key         | `2787acce-…` behind `alias/default`                            | Unchanged                                                                        | Pre-existing                    |
| Drill key              | `83cd2361-…` (tag `purpose=parmana-drill`)                     | Scheduled for deletion, around 2026-11-20                                        | Drill                           |
| Drill user             | `parmana-kms-drill`                                            | Inline policy `parmana-kms-drill` (v3 intended); still has test-only permissions | Pre-existing user, policy by us |
| Test user              | `parmana-prod-test` with access key                            | Still exists; to be deleted                                                      | Test                            |
| Test policy            | `parmana-prod-signing-test`                                    | Still exists; to be deleted                                                      | Test                            |
| Other alias            | `alias/parmana-ed25519-signer`                                 | Not ours; left untouched                                                         | Pre-existing                    |

Policy text for each is in `docs/dev/runbooks/commands-and-policies.md`.

## 5. Vercel and deployments

| Item                             | Value                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Project                          | `parmana-api-real` (team `pavan-dev-singh-charaks-projects`)                                                                        |
| Production variable              | `PARMANA_SIGNING_KEY_ID=alias/parmana-prod` (Production only; value hidden)                                                         |
| Current production deployment    | `dpl_AGh2CNLugRCsqzm4R3FK5zhGGjXp` (`parmana-api-real-8ma2zq723-â€¦`), Ready, built from `main`                                     |
| Previous deployment              | `dpl_7djdqhbVydfjD3UJQ7neSBY6to39` (`parmana-api-real-cx11v4j3l-â€¦`), Ready, built before the variable, signs with `alias/default` |
| Health                           | `https://parmana-api-real.vercel.app/health` returns 200                                                                            |
| Git commit of current deployment | Not confirmed (the CLI output does not show it)                                                                                     |

## 6. Verification and testing

Full detail: the testing report (published at https://claude.ai/artifact/JZupWjaH7icBS5dvXgJpmy).

| Area                                                        | Result                                                                                                                                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New unit tests                                              | 5 of 5 pass                                                                                                                                                                        |
| Crypto suite                                                | Same 56 failures before and after; caused by Node 22 lacking ML-DSA support                                                                                                        |
| Typecheck (api, crypto, runtime, execution-gateway, shared) | Pass                                                                                                                                                                               |
| Full preflight on Node 24                                   | Pass after two fixes (Prettier ignore, docs row)                                                                                                                                   |
| Local drill: sign, public key, verify, tamper check         | Pass                                                                                                                                                                               |
| Local server with the new setting                           | Starts; `/health` 200                                                                                                                                                              |
| Terraform plan and apply                                    | 2 added, 0 changed, 0 destroyed; applied once                                                                                                                                      |
| Test signature with `alias/parmana-prod`                    | Succeeded; recorded in CloudTrail against the new key                                                                                                                              |
| Production signing with the new key                         | **Not confirmed**                                                                                                                                                                  |
| Secret scan                                                 | 2 false positives (public key IDs), resolved by shortening them in documents                                                                                                       |
| Mutation testing                                            | Not yet run successfully: fails at the stale-build check; fix in `claude/build-order-fix`                                                                                          |
| Security review of PR #613                                  | Done; two medium findings (blank setting falls back to shared key; no check that the alias is per-environment) and one low finding (tag-based permissions depend on tag integrity) |

Known test environment problems (not caused by this change):

- Node 22 does not support ML-DSA-65; use Node 24.
- Stale `dist/` makes tests and mutation runs fail; fixed by `npm run build:packages` on `claude/build-order-fix`.

## 7. Problems encountered and how they were resolved

| Problem                                          | Cause                                                                        | Resolution                                                                                           |
| ------------------------------------------------ | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Server refused to start under KMS                | Signing used `alias/default`, which the role could not read                  | Added `PARMANA_SIGNING_KEY_ID` (PR #613)                                                             |
| Drill could not create or enable aliases or keys | Policy did not include those actions; later policies widened `alias/default` | Final policy v3 limits drill actions to tagged keys and `alias/parmana-drill`                        |
| Terraform rejected `ECC_NIST_EDWARDS25519`       | AWS provider 5.x schema does not list the spec                               | Key created with `create-signing-key.ps1`; Terraform manages alias and policy. Provider 6.x untested |
| Vercel redeploy did not pick up the change       | "Redeploy" rebuilds the old commit                                           | Deploy from `main` with `vercel --prod` after `git checkout --detach origin/main`                    |
| AWS CLI session expired                          | Root session cache did not refresh                                           | Used the console; created a test user with an access key                                             |
| CloudShell blocked                               | Account verification in progress                                             | Used CloudTrail console and CLI                                                                      |
| Prettier failed on Terraform files               | Local provider binary and state were scanned                                 | `.prettierignore`                                                                                    |
| Secret scan blocked commit                       | KMS key IDs flagged as secrets                                               | Shortened the IDs in documents                                                                       |
| Mutation runs failed immediately                 | Stale `dist/`                                                                | `build:packages` runs before tests and mutation                                                      |
| Claims draft overstated three points             | Reviewer's table was partly wrong                                            | Claims check (sections in the attached claims check file)                                            |

## 8. Open items

1. **Production signing with the new key.** Make one real signed request in production, wait about 15 minutes, then check CloudTrail for `Sign` events on `7b0c7156-â€¦` from `parmana-vercel-kms-signer`. Owner: team.
2. **Git commit of the current production deployment.** Confirm in the Vercel dashboard (deployment â†’ Source). Owner: team.
3. **Delete the test user and its access key and policy** (`parmana-prod-test`, `parmana-prod-signing-test`). Owner: admin.
4. **Drill key.** Cancel deletion of `83cd2361-â€¦` before about 2026-11-20 if it is still needed. Owner: admin.
5. **Drill user permissions.** Remove `EnableKey`, `DisableKey`, `CreateAlias`, `DeleteAlias` from `parmana-kms-drill` once the drill is closed. Owner: admin.
6. **Build-order fix.** Commit and push `claude/build-order-fix` after `npm test` passes on Node 24; then open a PR. Re-run `npm run mutation -- crypto` and `-- execution-gateway` and send the summaries. Owner: engineer.
7. **Security findings.** Decide on the two medium findings (fail on a blank setting in production; require the `alias/parmana-` prefix in production). Owner: engineer.
8. **Local PostgreSQL on the sandbox.** Stop it. Owner: engineer.
9. **Full test suite on Node 24** for the signing change. Owner: engineer.
10. **Staging key and alias.** Not created; repeat the runbook when needed. Owner: admin.
11. **Provider 6.x** for the Ed25519 key spec. Untested. Owner: engineer.
12. **Connector claims.** Verify Razorpay idempotency and Slack/GitHub behaviour in `parmana-connectors` before publishing the claims draft. Owner: engineer.

## 9. Security notes

- The root account was used for much of the CLI work. Future work should use an IAM admin user with a short-lived session.
- The test access key was used once and should have been deleted immediately (item 3).
- The local `parmana` database role is a superuser on the sandbox only.
- No access keys or secrets were pasted into chats or repository files.
- A repository-wide rule: never repoint an alias that already has signatures under it.
