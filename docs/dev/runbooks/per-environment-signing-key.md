# Runbook: per-environment KMS signing key for Parmana

Status when written: production (`parmana-api-real`) is deployed from `main` with
`PARMANA_SIGNING_KEY_ID=alias/parmana-prod`. The production key and alias exist.
Production signing with the new key is NOT yet confirmed (see "What is still unconfirmed").

## 1. What we did and why

**Problem.** With `KEY_PROVIDER=aws-kms`, the server signed with the logical key
`default`, which resolves to the shared alias `alias/default`. Every environment shared
one key, and a drill or test could not run without repointing that alias, which would
affect live signatures.

**Change (PR #613, merged).**

- New setting `PARMANA_SIGNING_KEY_ID` (default `default`, so unset = old behaviour).
- Signing call sites use `currentSigningKeyId()`. Verification follows the signing key
  unless `PARMANA_VERIFICATION_KEY_ID` is set.
- Docs: `docs/site/deployment/environment-variables.mdx`,
  `docs/site/deployment/per-environment-signing-keys.mdx`, `.env.example`.

**Infrastructure (done for production).**

- KMS key `7b0c7156-…`, ap-south-1, spec
  `ECC_NIST_EDWARDS25519`, usage `SIGN_VERIFY`, tag `purpose=parmana-prod`.
  Created with `create-signing-key.ps1` (AWS CLI), because the Terraform AWS provider
  rejects this key spec.
- Alias `alias/parmana-prod` and inline policy `parmana-prod-kms-signing` on role
  `parmana-vercel-kms-signer`, created by Terraform (`infra/parmana-prod-signing/`).
  Policy allows only `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey` on that key.
- Vercel production variable `PARMANA_SIGNING_KEY_ID=alias/parmana-prod`.
- Production redeployed from `main` (`vercel --prod` from detached `origin/main`).

**Test drill (earlier, separate test key `83cd2361-â€¦`).** Created, signed and verified
locally; key scheduled for deletion. The drill policy was tightened to tag-scoped
permissions. Not needed for production.

## 2. Why each piece is needed

- **Own key per environment:** production signatures cannot be affected by drills or
  other environments.
- **Alias, not key ID, in config:** the alias can later be moved to a new key for
  rotation. Never repoint an alias that already has signatures under it: records that
  name the alias stop verifying.
- **Role policy limited to three actions on one key:** the server can only sign and read
  the public key.
- **Tag condition on the key:** lets admin policies target only Parmana keys.

## 3. How to do it again (new environment, e.g. staging)

Run from the repo, PowerShell, AWS CLI signed in as an admin (see troubleshooting for
sign-in problems).

1. Create the key:
   ```powershell
   cd D:\last\parmana-core\infra\parmana-prod-signing
   .\create-signing-key.ps1 -Environment staging
   ```
   Copy the printed `arn:aws:kms:...:key/...` value. Run this once per environment.
2. Copy `prod.tfvars` to `staging.tfvars` and set:
   - `environment = "staging"`
   - `server_role_name` = the staging server role name (not the ARN)
   - `signing_key_arn` = the ARN from step 1
   - `deletion_window_days = 7` (only if this copy uses `deletion_window_days`)
3. Validate and plan (no apply yet):
   ```powershell
   terraform init
   terraform validate
   terraform plan -var-file="staging.tfvars"
   ```
   Expected: 2 to add (alias, role policy), 0 change, 0 destroy.
4. Confirm the role is the one the server uses. Check its trust policy:
   ```powershell
   aws iam get-role --role-name <server-role-name> --query "Role.AssumeRolePolicyDocument" --output json
   ```
   It should trust the Vercel OIDC provider with the correct project and environment
   (for production: project `parmana-api-real`, environment `production`).
5. Apply, after reviewing the plan:
   ```powershell
   terraform apply -var-file="staging.tfvars"
   ```
   Type lowercase `yes` at the prompt. `YES` cancels.
6. Confirm the alias:
   ```powershell
   aws kms describe-key --region ap-south-1 --key-id alias/parmana-staging --query "KeyMetadata.[KeyId,KeyState,KeySpec]" --output text
   ```
   Expected: the key ID, `Enabled`, `ECC_NIST_EDWARDS25519`.
7. In Vercel, for the environment being set up only, add `PARMANA_SIGNING_KEY_ID` =
   `alias/parmana-staging`. Check it with `vercel env ls <environment>` (values hidden).
8. **Redeploy from `main`, not a dashboard "Redeploy".** See troubleshooting.
9. Check health, then the signing check in section 5.

## 4. Confirmation checks

| Check                | Command                                                                             | Proves                                                                        |
| -------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Alias resolves       | `aws kms describe-key ... --key-id alias/parmana-prod`                              | Alias points to an enabled Ed25519 key                                        |
| Key tagged           | Console: KMS â†’ key â†’ Tags (or an admin `aws kms list-resource-tags`)            | Tag condition will match                                                      |
| Role policy          | `aws iam get-role-policy` / console                                                 | Role can sign and read only this key                                          |
| Deploy is current    | `vercel ls parmana-api-real --environment production` (newest row)                  | A deploy happened after the change                                            |
| Health               | `curl.exe -s -o NUL -w "%{http_code}`n" https://parmana-api-real.vercel.app/health` | Server is up (200). Does NOT prove the key                                    |
| Key works end to end | `aws kms sign --profile <test> --key-id alias/parmana-prod ...` then CloudTrail     | Key, alias, policy and CloudTrail all work. Does NOT prove the server uses it |
| Server uses key      | CloudTrail `Sign` event by `parmana-vercel-kms-signer` with `7b0c7156-...`          | The production server signs with the new key                                  |

## 5. Checking the production server signs with the new key

The server only calls KMS when it signs something. Health checks don't. So:

1. Make one real request that produces a signature (a real action in the app). Do not
   use a live payment or order for a test unless intended.
2. Wait about 15 minutes (CloudTrail lag).
3. Run:
   ```powershell
   aws cloudtrail lookup-events --profile <profile> --region ap-south-1 --lookup-attributes AttributeKey=EventName,AttributeValue=Sign --max-results 5 --output json | Select-String "7b0c7156|2787acce"
   ```
   - `7b0c7156` from `parmana-vercel-kms-signer` after the deploy time: new key in use.
   - `2787acce` (`alias/default`): old key still in use. Check the deploy commit (section 6).
   - Nothing new: no signing since the deploy yet.

## 6. Troubleshooting

**"Credentials were refreshed, but the refreshed credentials are still expired"**

- Cause: the `aws login` (root) session cache expired and didn't refresh.
- Check the clock first: `Get-Date -Format u` should match real UTC.
- Try `aws login` again; approve in the browser; if the browser says
  "credentials shared", retry the command.
- Otherwise create access keys for an IAM admin user and use `aws configure --profile <name>`.
  Never paste keys into chats or files in the repo.

**Terraform: "No valid credential sources found"**

- Terraform doesn't read the `aws login` session. Export it into the current window:
  `aws configure export-credentials --format powershell | Invoke-Expression`
  then run Terraform in the same window. Or use `--profile` with an access-key profile
  (`TF`-style: set `AWS_PROFILE` first).

**Terraform: "expected customer_master_key_spec to be one of [...] got ECC_NIST_EDWARDS25519"**

- The AWS provider (5.x, and 6.x was not confirmed to help) does not accept this key
  spec. Create the key with `create-signing-key.ps1` and let Terraform manage only the
  alias and role policy (current design).

**Terraform plan: "Given variables file prod does not exist" / "Too many command line arguments"**

- PowerShell split the argument. Use quotes: `-var-file="prod.tfvars"`.

**`terraform apply` prints "Apply cancelled."**

- Input was `YES`. Terraform only accepts lowercase `yes`. Turn off Caps Lock.

**`aws configure ... --profile parmana-test,`**

- A stray comma changes the profile name. Cancel with Ctrl+C and re-run without it.

**Policy name already exists (IAM)**

- Policy names are unique per account. Use a new name (we used `parmana-prod-signing-test`).

**`create-signing-key.ps1` fails with "expected one argument" for `--region`**

- The script was pasted into the shell rather than saved as a file. Save it with
  `notepad create-signing-key.ps1`, then run `.\create-signing-key.ps1 -Environment prod`.
- Running it again creates another key. Only run it once per environment.

**CloudShell: "Unable to create the environment. Your account verification is in progress."**

- New accounts can be blocked from CloudShell for up to two days. Use the AWS CLI or the
  CloudTrail console instead.

**CloudTrail console filter returns nothing**

- Set the first filter to **Event name** (not Read-only). Type `Sign` with a capital S.
  Lookups can lag about 15 minutes.

**`vercel inspect` shows no Git commit**

- Deployments made by "Redeploy" reuse the old build. Use `git checkout --detach origin/main`
  then `vercel --prod` to deploy current `main`.

**Health returns 200 but signing uses the old key**

- The deploy predates the variable or the code. Check: (a) `vercel env ls production` shows
  `PARMANA_SIGNING_KEY_ID`; (b) the newest deployment is newer than the variable and built
  from `main`; (c) `origin/main` contains `currentSigningKeyId` (`git grep
currentSigningKeyId origin/main -- packages/crypto/src/KeyProvider.ts`).
  If (a) and (c) hold but the deploy is old, deploy from `main` as above.

**Server refuses to start: "Gateway private key not found"** (local test only)

- Generate it: `npx tsx scripts/generate-keypair.ts --key-id gateway --algorithm ed25519`
  with `PARMANA_KEY_DIR` set.

**Server refuses to start: "No caller authentication keys are configured"** (local test only)

- Local testing: set `PARMANA_AUTH_DISABLED=true`. Never set this in production.

**Server refuses to start: `relation "policy_change_approval_records" does not exist`** (local)

- Run migrations: `npx tsx scripts/migrate-database.ts apply` with `DATABASE_URL` set.
  The migrations create roles and need a superuser on a local test database only.

**`git push` blocked by pre-commit: "Node 24 is required"**

- Use Node 24.x (`.nvmrc` pins 24.22.2). Check with `node -v`.

**Pre-push preflight fails: docs test "PARMANA_SIGNING_KEY_ID ... expected [...] to deeply equal []"**

- Add the variable to `docs/site/deployment/environment-variables.mdx` (see the reference
  table row we added).

**Stop hook: "There are uncommitted changes..."** (during this work)

- It was reporting a sandbox copy with staged changes that were already merged. Check
  `git status` on your own machine before committing anything.

## 7. What is still unconfirmed

- **Production signs with the new key.** The newest `Sign` events from the production
  role at 18:18 UTC use `alias/default`, from the old build. Nothing has signed since the
  new deploy. Confirm using section 5 once real traffic arrives.
- **Commit of the current production deploy.** `vercel inspect` on `8ma2zq723` did not
  show the Git commit. Confirm it in the Vercel dashboard (deployment â†’ Source).

## 8. Cleanup still to do

- Delete the test access key and the `parmana-prod-test` IAM user, then the
  `parmana-prod-signing-test` policy.
- Schedule deletion of the drill key `83cd2361-df73-4879-859f-412d5f9fd7c9` if not already
  done (it was scheduled for 2026-11-20 at the time of writing; cancel by then if still needed).
- Stop the local PostgreSQL service on the sandbox if no longer needed.

## Reference IDs

- Production key: `7b0c7156-…` (alias `alias/parmana-prod`)
- Old shared key: `2787acce-…` (alias `alias/default`), unchanged
- Server role: `parmana-vercel-kms-signer` (Vercel project `parmana-api-real`, production)
- PR: https://github.com/pavancharak/parmana-core/pull/613
