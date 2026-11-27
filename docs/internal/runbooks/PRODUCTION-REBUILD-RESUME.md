# Production rebuild: complete runbook

Last updated: 2026-11-27 (IST). Branch: `ccr-1a094afc-j22f36`.

Read this whole file before running any AWS command. It records what has been done, what is pending, the commands to run, and what must not be done.

---

## 1. Current status

| Item | Status |
|---|---|
| Production account `<ACCOUNT_ID>` (Parmana) | Active. Holds the $1,000 AWS Activate credit (expires 2028-11-30). |
| IAM Identity Center | Enabled, `ap-south-1`, single-Region instance `<SSOINS-ID>`. Identity source: Identity Center directory. |
| Human admin user | `pavan`, MFA on, `AdministratorAccess` on account `<ACCOUNT_ID>`. |
| CLI profile `parmana-prod` | Working. `aws sts get-caller-identity --profile parmana-prod` returns `pavan` in `<ACCOUNT_ID>`. |
| Root account | Not used for this work. MFA and access keys still to be confirmed with a credential report (see section 7). |
| Network stack `infra/parmana-prod-network` | **Applied 2026-11-27.** 8 resources created. |
| Database stack `infra/parmana-prod-database` | **Applied 2026-11-27.** 2 resources created (subnet group and RDS instance). Endpoint in section 4.3. |
| API (App Runner) | **Phase 1 applied 2026-11-27.** Phase 2 (service) blocked by the account restriction. |
| Secrets | Database URL created by the database stack. API keys and key material are empty placeholders, to be set by hand. New KMS signing key not started. |
| CI (GitHub OIDC role) | Not started. |
| Budget alerts | Not started. |
| Remote Terraform state | Not set up. State is local. |

---

## 1a. Recent events and security review (2026-11-26 to 2026-11-27)

**Status: open.** AWS restricted account `<ACCOUNT_ID>` on 2026-11-26 with the notice "temporarily restricted", and CreateService is blocked. Security review is case `<CASE-ID>` (reopened for a reply, 2026-11-27). The App Runner VPC case `<CASE-ID>` is pending customer action.

### What was found
- **Root access key** created 2026-11-20 13:56 UTC by root, one minute after a root console sign-in from `<REDACTED-IP>` (an AWS-hosted address) at 13:55 UTC. The key was used in `ap-southeast-2` for SES and account checks on 2026-11-20 and 21 (IST).
- **IAM user `parmana-kms-drill`** called `CreateUser` from `<REDACTED-IP>` at 2026-11-25 17:14 UTC. That address is not a known location.
- **SES in `ap-southeast-2`:** no identities, no sends in the last 24 hours, and no sends in the last 14 days of send statistics. Sandbox mode.
- **Root sign-ins** from several addresses, recorded in the private incident file. The Indian addresses match the owner. `<REDACTED-IP>` is not yet explained.

### Steps completed (2026-11-27)
1. Root access key deleted. Root now has no access keys (confirmed on the root Security credentials page).
2. Root password changed on the Account Details page.
3. Root MFA checked: device `Authapp` (virtual, created 2026-09-20), owner's device.
4. Security contact added on the billing Account page: `<OWNER-EMAIL>`.
5. CloudTrail reviewed for IAM changes in the last 90 days (`CreateUser`, `CreateAccessKey`, `CreateLoginProfile`, `CreateRole`, `AttachUserPolicy`, `AttachRolePolicy`, `PutUserPolicy`, `PutRolePolicy`, MFA events). Entries are matched to known work, except the two items above.
6. Sign-in history (ConsoleLogin) reviewed for 90 days.
7. SES checked in `ap-southeast-2`, as above.
8. Security case reply drafted and sent on `<CASE-ID>` (summary of steps 1 to 7 and the open items).

### Open items
- Owner to confirm the root `GetResources` and `ListAgentSpaces` calls in `ap-southeast-2` on 2026-11-26 and 2026-11-27 (IST) were not run by the owner.
- Owner to confirm whether the root sign-in from `<REDACTED-IP>` on 2026-11-20 was theirs.
- AWS to confirm what triggered the restriction and what is needed to lift it.
- Confirm no other root actions were made outside the owner's control. CloudTrail retains 90 days.
- The `parmana-kms-drill` user and its key were deleted on 2026-11-27. Keep the CloudTrail record.

### Build and API progress
- **API phase 1** applied 2026-11-27 (13 resources). App Runner service not created.
- **Image build:** blocked. Local `docker login` to ECR fails with a Windows credential-helper error (`The stub received bad data`). Switched to CodeBuild (stack `infra/parmana-prod-build`, applied 2026-11-27, 9 resources).
- **CodeBuild start blocked:** `AccountLimitExceededException`. The quota `L-9D07B6EF` (Concurrently running builds for Linux/Small environment) is 0.0. The request API returns AccessDenied, so the increase must be raised through Support. Case not yet created.
- **Source bucket:** `parmana-prod-build-source-<ACCOUNT_ID>`, with `source.zip` uploaded from commit `642e3ee9`.
- **App Runner VPC connector:** `parmana-prod`, created by the API phase 1 stack and ACTIVE. This is separate from `parmana-connector`, the earlier attempt in support case `<CASE-ID>`. The networking service-linked role `AWSServiceRoleForAppRunnerNetworking` was created on 2026-11-26 (08:28 UTC) following Support's instructions.

### Rules from this review
- Do not create or change resources while the account is restricted, unless AWS asks for it.
- Use root only for account-level actions. Routine work uses `parmana-prod` (Identity Center).
- Do not delete CloudTrail-visible evidence until the case is closed.
- Do not describe the account as secure until AWS confirms it in writing.

---

## 2. Accounts and what each one is for

| Account | Role | Use |
|---|---|---|
| `<ACCOUNT_ID>` | Parmana. Management account of organization `o-ue5snvmsp0`. Holds the credit. | **Production. Use this.** |
| `<TEST_ACCOUNT_ID>` | Member of organization `o-d3kwxef51u`, managed by `<MGMT_ACCOUNT_ID>`. | **Not usable.** SCP `p-2snbjrpj` denies EC2 actions, including `ec2:DescribeAvailabilityZones`. Not changed. |
| `<MGMT_ACCOUNT_ID>` | Management account of `o-d3kwxef51u`. | Root email unknown. Recovery needed only if its SCPs must change. Not required for production. |

Do not use the free-plan test account route. It was tried and closed. The account sign-up flow redirects to AWS Builder ID, and a second new account was not created.

---

## 3. Decisions made

1. **One production account** (`<ACCOUNT_ID>`). No separate test account. The owner accepted this because there are no live users yet.
2. **Region `ap-south-1` (Mumbai)** for everything. Chosen for data residency in India and consistency with the repo.
3. **Identity Center as a single-Region instance** in `ap-south-1`, not Multi-Region. Multi-Region would copy identity data to US West (Oregon).
4. **No NAT gateway and no internet gateway.** AWS access from the API will use VPC endpoints in a later step, for cost.
5. **Network CIDR `10.30.0.0/16`** for production.
6. **Database `db.t4g.micro`, 20 GB gp3, single-AZ, encrypted, private.** Chosen for minimal traffic. Upgrade to `db.t4g.small` if needed, with a short restart.
7. **Master database password held by RDS** in Secrets Manager (`manage_master_user_password`). Terraform never holds it.
8. **Workloads run in the management account for now.** Move them to a member account once the organization account quota is raised.

---

## 4. Completed steps, with IDs

### 4.1 Identity and CLI
- Identity Center enabled in `ap-south-1`. Access portal: `https://<SSO-PORTAL-ID>.awsapps.com/start`.
- User `pavan` created, MFA registered, `AdministratorAccess` permission set created and assigned to account `<ACCOUNT_ID>`.
- CLI profile created with `aws configure sso --profile parmana-prod`.
- Verified identity: role `AWSReservedSSO_AdministratorAccess_*/pavan`, account `<ACCOUNT_ID>`.

### 4.2 Network (applied 2026-11-27)
| Resource | ID |
|---|---|
| VPC `10.30.0.0/16` | `<VPC-ID>` |
| Private subnet, ap-south-1a (`10.30.1.0/24`) | `<PRIVATE-SUBNET-A>` |
| Private subnet, ap-south-1b (`10.30.2.0/24`) | `<PRIVATE-SUBNET-B>` |
| Route table (private, no internet route) | `<RTB-ID>` |
| Route table associations | `<RTBASSOC-ID>`, `<RTBASSOC-ID>` |
| Default security group (locked down) | `<DEFAULT-SG-ID>` |
| Database security group (PostgreSQL 5432 from VPC only) | `<DB-SG-ID>` |

Code: `infra/parmana-prod-network` (commit `fbb99aa3`, then `41b5928` for the profile change).

### 4.3 Database (applied 2026-11-27)
- Code: `infra/parmana-prod-database` (commit `40169fa`).
- Plan (2026-11-27): **2 to add, 0 to change, 0 to destroy.**
  - `aws_db_subnet_group.main`: `parmana-prod`, in the two private subnets.
  - `aws_db_instance.main`: `parmana-prod`, PostgreSQL `16`, `db.t4g.micro`, 20 GB gp3 autoscaling to 100 GB, encrypted, single-AZ, not public, deletion protection on, final snapshot `parmana-prod-final`, 7-day backups, master password managed by RDS.
- Applied with the saved plan. Result:
  | Output | Value |
  |---|---|
  | DB subnet group | `parmana-prod` |
  | DB instance identifier | `parmana-prod` (resource `<DB-RESOURCE-ID>`) |
  | Endpoint | `<DB-HOST-PREFIX>.ap-south-1.rds.amazonaws.com` |
  | Port | `5432` |
  | Master password secret | `arn:aws:secretsmanager:ap-south-1:<ACCOUNT_ID>:secret:<RDS-MANAGED-SECRET>` (managed by RDS) |
- Creation took about 7 minutes 22 seconds.
- Reachable only from inside the VPC, through `<DB-SG-ID>`. Not publicly accessible.

### 4.3a Database password change (pending apply)
- The database stack now generates the master password with `random_password` and writes the full `DATABASE_URL` to `parmana/prod/database-url`. It replaces the RDS-managed password.
- **Plan run 2026-11-27 (after pulling `843389b6`):** `3 to add, 1 to change, 0 to destroy`.
  - `~ aws_db_instance.main`: **update in place.** `manage_master_user_password` true to null, and `password` set (sensitive). Not replaced.
  - `+ aws_secretsmanager_secret.database_url` (`parmana/prod/database-url`, 30-day recovery window).
  - `+ aws_secretsmanager_secret_version.database_url`.
  - `+ random_password.master` (32 characters, no special characters).
  - Outputs: `database_url_secret_arn` added; `master_secret_arn` removed.
- **Applied 2026-11-27.** Result: `3 added, 1 changed, 0 destroyed`.
  - Instance `parmana-prod` (`<DB-RESOURCE-ID>`) modified in place in about 1 minute 30 seconds. Endpoint unchanged: `<DB-HOST-PREFIX>.ap-south-1.rds.amazonaws.com`, port 5432.
  - Secret `parmana/prod/database-url` created: `arn:aws:secretsmanager:ap-south-1:<ACCOUNT_ID>:secret:parmana/prod/database-url-<SUFFIX>`. Holds the full `DATABASE_URL` (sslmode=require).
  - Generated master password stored only in that secret and in the state file. The state file must stay private.
- **Before apply:** back up `terraform.tfstate` privately. After apply it holds the generated password.
- **Old RDS-managed secret still exists:** `<RDS-MANAGED-SECRET>`. It holds a password that no longer works. Do not delete it until the new `DATABASE_URL` has been verified by the API in phase 2. Then schedule deletion with a 30-day recovery window, and only with the owner's approval.
- Nothing uses the password yet (the API is not deployed), so there is no outage risk from the change.
- The password is now in the database stack's state file. Protect that state file the same way as before.

### 4.3b API stack (written, not applied)
- Code: `infra/parmana-prod-api`.
- Phase 1 creates: ECR repository `parmana-api` (immutable tags, scan on push, keeps 10 images), secret containers `parmana/prod/api-keys` and `parmana/prod/key-material` (placeholders, set by hand), VPC connector `parmana-prod` with its security group (outbound 5432 to the database only), access role for ECR pull, instance role that reads only the three secrets, and a scaling configuration (1 to 2 instances).
- **Phase 1 applied 2026-11-27:** `13 added, 0 changed, 0 destroyed`. No App Runner service yet.

| Resource | ID or value |
|---|---|
| ECR repository | `<ACCOUNT_ID>.dkr.ecr.ap-south-1.amazonaws.com/parmana-api` (immutable tags) |
| Secret: API keys (placeholder `[]`) | `parmana/prod/api-keys`, `arn:aws:secretsmanager:ap-south-1:<ACCOUNT_ID>:secret:parmana/prod/api-keys-<SUFFIX>` |
| Secret: key material (placeholder `{}`) | `parmana/prod/key-material`, `arn:aws:secretsmanager:ap-south-1:<ACCOUNT_ID>:secret:parmana/prod/key-material-<SUFFIX>` |
| VPC connector | `parmana-prod`, `arn:aws:apprunner:ap-south-1:<ACCOUNT_ID>:vpcconnector/parmana-prod/1/<CONNECTOR-UUID>` |
| Connector security group | `<CONNECTOR-SG-ID>` (outbound 5432 to `<DB-SG-ID>` only) |
| Auto scaling (1 to 2 instances) | `arn:aws:apprunner:ap-south-1:<ACCOUNT_ID>:autoscalingconfiguration/parmana-prod/1/<AUTOSCALE-UUID>` |
| ECR-pull role | `parmana-prod-apprunner-access` |
| Instance role (reads three secrets only) | `parmana-prod-api-instance` |

The secret values are still placeholders. They must be set by hand before phase 2.

- Phase 2 creates the App Runner service `parmana-api-prod` (0.25 vCPU, 0.5 GB, port 3000, health check `/health`), once `deploy_service = true` and an `image_tag` is pushed.
- Expected cost: App Runner charges for memory while idle and for requests. Roughly $10 to $15 a month at minimal traffic. No NAT gateway.
- Image build and push steps, and the secret upload steps, are in `infra/parmana-prod-api/README.md`.

### 4.4 Incident record
- Earlier teardown of the core stack and the `dip-*` resources, and the loss of test data: recorded in `04-INCIDENTS-LOG.md`, entry INC-16.

---

## 5. Pending decisions (owner)

0. **Push the API image to ECR, then set the two secret values** (see `infra/parmana-prod-api/README.md`). Then apply phase 2.

1. **KMS signing keys in `ap-south-1`** (`2787acce-db19-4cd6-88ed-ce2c1319096b`, `7b0c7156-88b1-4979-be5d-7eca96972c39`) are scheduled for deletion on **2026-12-04**. Decide: keep (cancel deletion before that date with `aws kms cancel-key-deletion`), or let them go and create new production keys. Confirm no signed evidence needs verifying with the old keys.
2. **Organization account quota**: request an increase through AWS Support (Organizations, account quota), so workloads can move into a member account.
3. **Management account `<MGMT_ACCOUNT_ID>`**: recover root access only if its SCPs must change later.

---

## 6. Next steps, in order

1. (Done 2026-11-27) Database applied. Password change to the generated secret pending, see 4.3a.
2. **Back up both state files now** (see section 8). The database state now records a live instance.
3. **Remote state backend.** Private S3 bucket with versioning, encryption, public access blocked, and state locking. Migrate the stacks to it.
4. **API.** Stack written (see 4.3b). Apply phase 1, push the image to ECR, set the two secret values, apply phase 2, and run the checks in the API README. Confirm the RDS certificate is trusted at first start.
5. **Secrets and keys.** New Secrets Manager entries for application secrets, and a new KMS signing key unless decision 5.2 keeps the old ones.
6. **CI.** GitHub OIDC provider and a deploy role that trusts only `pavancharak/parmana-core` on `main`. No AWS keys stored in GitHub.
7. **Budget.** AWS Budgets alerts at 50%, 80% and 100% of the monthly target (about $35 to $60 for minimal traffic).
8. **Root account check.** Credential report, root row: `mfa_active` true, both access keys false.

---

## 7. Checks to run

Confirm the account before any plan or apply:
```powershell
aws sts get-caller-identity --profile parmana-prod
```
The `Account` must be `<ACCOUNT_ID>`.

Root check:
```powershell
aws iam generate-credential-report
$c = aws iam get-credential-report --query Content --output text
$report = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($c))
$report.Split("`n") | Where-Object { $_ -like "<root_account>*" }
```
If the report isn't ready, run the generate command again after a few seconds.

Sign in each day with `aws sso login --profile parmana-prod` if the session has expired.

---

## 8. State files (important)

Terraform state is **local** until a remote backend is added. Each stack keeps its own `terraform.tfstate` in its folder:

- `infra/parmana-prod-network/terraform.tfstate`: holds the eight network resources.
- `infra/parmana-prod-database/terraform.tfstate`: holds the live database instance.

Rules:
- **Back up both state files** to a location outside the repo before any apply or destroy.
- **Never commit state files.** They are git-ignored by `.terraform` and state patterns, but check before every commit.
- The database state file (`infra/parmana-prod-database/terraform.tfstate`) now records a live instance. Losing it is serious, so back it up first.
- Losing a state file means Terraform no longer knows what it manages. Recovery then needs `terraform import`.

---

## 9. Never do these

- Do not use `aws login` as root for routine work. Use `parmana-prod` (Identity Center).
- Do not run `terraform destroy`, `delete-*`, `terminate-*` or `schedule-key-deletion` without the owner's written approval and a backup.
- Do not disable deletion protection on the database without approval.
- Do not use account `<TEST_ACCOUNT_ID>` or `<MGMT_ACCOUNT_ID>` expecting production resources to work there.
- Do not put passwords, access keys or state files in the repo.

---

## 10. Troubleshooting notes

- **`git pull` says local changes would be overwritten by `.terraform.lock.hcl`.** `terraform init` updates the lock file on Windows. Discard the local copy, then pull: `git checkout -- infra/parmana-prod-database/.terraform.lock.hcl`, then `git pull`. Lock files are generated, so this is safe. Check `git status` first if in doubt.
- **A plan says "No changes" right after a pull that failed.** The plan ran against the old code. Pull successfully, then plan again.

- **PowerShell splits `-var-file=...`.** Wrap every Terraform flag that has an `=` in double quotes: `"-var-file=prod.tfvars"`, `"-out=prod.tfplan"`.
- **Pasting a command into a prompt.** If a command is typed into an interactive prompt (for example the `aws configure sso` region question), it's saved as a value. Fix the saved value with `aws configure set ... --profile parmana-prod`.
- **"Credentials were refreshed, but the refreshed credentials are still expired."** Check the clock first (`Get-Date` against `[DateTime]::UtcNow`). If the clock is right, delete `%USERPROFILE%\.aws\login\cache`, then sign in again. For production, use the SSO profile instead of `aws login`.
- **The `default` profile must not hold root credentials.** Delete the `[default]` section from `%USERPROFILE%\.aws\config` and `credentials` if it does.
- **Account sign-up redirects to AWS Builder ID.** Builder ID is a personal profile and is not an AWS account. Use the sign-up page directly, in a private window, with a new email.
- **An organization policy denies an action** (for example `AccessDenied ... service control policy`). This comes from the management account's SCP. Don't work around it. Use an account where the policy is yours to change.
- **Terraform reports missing credentials.** Confirm the profile is set (`$env:AWS_PROFILE` or the profile in `main.tf`), then sign in with `aws sso login --profile parmana-prod`.

---

## 11. Repo files for this work

| Path | Purpose |
|---|---|
| `infra/parmana-prod-network/` | Production network stack (applied) |
| `infra/parmana-prod-database/` | Production database stack (planned, not applied) |
| `infra/parmana-test-network/` | Earlier test network stack for the test account (not used) |
| `infra/parmana-prod-signing/` | Earlier production signing stack, from before this rebuild. Review before reuse. |
| `04-INCIDENTS-LOG.md` | Incident record, including INC-16 |
| `docs/internal/runbooks/PRODUCTION-REBUILD-RESUME.md` | This runbook |
