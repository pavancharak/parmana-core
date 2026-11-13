# Commands run, policies created, and what they enable

Account 013659367671, region ap-south-1. Credentials, keys and secrets are not included.

## A. Policies created

### A1. Production signing policy (Terraform, inline on the Vercel server role)

Name: `parmana-prod-kms-signing`, attached to role `parmana-vercel-kms-signer`.
Source: `infra/parmana-prod-signing/main.tf`, resource `aws_iam_role_policy.runtime`.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "ParmanaSigningOnly",
      "Effect": "Allow",
      "Action": ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"],
      "Resource": "arn:aws:kms:ap-south-1:013659367671:key/7b0c7156-88b1-4979-be5d-7eca96972c39"
    }
  ]
}
```

**Enables:** the production server role can sign with the production key and read its public
key. It cannot create, enable, disable, delete or repoint keys or aliases.

### A2. Test policy (for the test user only)

Name: `parmana-prod-signing-test` (created after `parmana-prod-test` name was taken),
attached to user `parmana-prod-test`. Deleted after the test is confirmed (cleanup pending).

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["kms:Sign", "kms:GetPublicKey", "kms:DescribeKey"],
      "Resource": "arn:aws:kms:ap-south-1:013659367671:key/7b0c7156-88b1-4979-be5d-7eca96972c39"
    },
    {
      "Effect": "Allow",
      "Action": ["cloudtrail:LookupEvents"],
      "Resource": "*"
    }
  ]
}
```

**Enables:** one signing test and reading CloudTrail. Nothing else.

### A3. Drill inline policy (on `parmana-kms-drill`, final version v3)

Saved file: `scratchpad/parmana-kms-drill/drill-inline-policy-v3.json`. Pasted into IAM and saved.
Statements:

- `CreateTaggedDrillKeyOnly`: `kms:CreateKey` only if the request tag `purpose=parmana-drill`.
- `UseAndManageOnlyDrillKeys`: `DescribeKey`, `GetPublicKey`, `Sign`, `EnableKey`, `DisableKey`,
  `ScheduleKeyDeletion`, `CancelKeyDeletion` on `key/*`, only where the key has tag `purpose=parmana-drill`.
- `DrillAliasNameOnly`: `CreateAlias`, `DeleteAlias` on `alias/parmana-drill` only.
- `DrillAliasTargetOnly`: `CreateAlias`, `DeleteAlias` on `key/*` only for drill-tagged keys.
- `ListAliases` on `*`.
  **Enables:** the drill identity can run the drill end to end on drill-tagged keys and one
  alias name. It cannot touch `alias/default`, `alias/parmana-prod` or untagged keys.
  Earlier, unsaved or rejected versions (v1 and v2) included `alias/default` or lacked
  `EnableKey`; those were replaced.

### A4. Earlier drill files (not applied to AWS, kept for reference)

- `drill-admin-policy.json`: an admin-side draft for a drill role. Not used.
- `parmana-runtime-policy.json`: draft server policy (same as A1). Superseded by A1.

### A5. Terraform-managed IAM for production only; no other policies were created.

## B. Commands, in order

### B1. Sandbox AWS checks and the drill (earlier)

```
aws sts get-caller-identity
aws kms create-key --region ap-south-1 --key-spec ECC_NIST_EDWARDS25519 --key-usage SIGN_VERIFY --description "Parmana outage-drill test key; delete after test" --tags TagKey=purpose,TagValue=parmana-drill
aws kms list-aliases --region ap-south-1
aws kms create-alias --region ap-south-1 --alias-name alias/default --target-key-id <drill-key>      # denied
aws kms describe-key --region ap-south-1 --key-id alias/default                                     # (read via list-aliases)
aws kms schedule-key-deletion --region ap-south-1 --key-id <drill-key> --pending-window-in-days 7
aws kms cancel-key-deletion --region ap-south-1 --key-id <drill-key>
aws kms enable-key --region ap-south-1 --key-id <drill-key>                                         # denied, then allowed after policy
aws kms create-alias --region ap-south-1 --alias-name alias/parmana-drill --target-key-id <drill-key>
aws kms sign --region ap-south-1 --key-id <drill-key> --message fileb://msg.txt --message-type RAW --signing-algorithm ED25519_SHA_512
aws kms get-public-key --region ap-south-1 --key-id <drill-key>
aws kms delete-alias --region ap-south-1 --alias-name alias/parmana-drill
aws kms schedule-key-deletion --region ap-south-1 --key-id <drill-key> --pending-window-in-days 7
aws iam get-user-policy --user-name parmana-kms-drill --policy-name parmana-kms-drill              # denied (no permission)
aws iam simulate-principal-policy ...                                                              # denied (no permission)
aws kms list-resource-tags --region ap-south-1 --key-id <drill-key>                               # denied (no permission)
```

Local verification of the drill (no AWS change):

```
python3 verify_sign.py   (inline Python with cryptography: Ed25519 verify + tamper check)
```

### B2. Local server start for the drill (sandbox, no AWS change)

```
pip3 install awscli
npm ci --workspace @parmana/api --include-workspace-root
npm run build --workspaces --if-present            (failed on order; rebuilt per package with tsc -p tsconfig.json)
npx tsx scripts/generate-keypair.ts --key-id gateway --algorithm ed25519
pg_ctlcluster 16 main start
su postgres -c "psql -c \"CREATE USER parmana WITH PASSWORD '...';\" -c \"CREATE DATABASE parmana OWNER parmana;\""
su postgres -c "psql -c \"ALTER USER parmana SUPERUSER;\""
npx tsx scripts/migrate-database.ts apply
KEY_PROVIDER=aws-kms AWS_REGION=ap-south-1 PARMANA_SIGNING_KEY_ID=alias/parmana-drill PARMANA_AUTH_DISABLED=true PARMANA_STORAGE=postgres DATABASE_URL=... NODE_ENV=development PORT=3100 npx tsx src/server.ts
curl -s -o /dev/null -w "HTTP %{http_code}" http://localhost:3100/health    -> 200
pkill -f "src/server.ts"
```

Earlier, before PARMANA_SIGNING_KEY_ID existed, the server failed with `AccessDeniedException` on `kms:DescribeKey` for `alias/default`. That is the evidence for the change.

### B3. Code change and checks (sandbox, then pushed)

```
npx tsc --noEmit (api, crypto, runtime, execution-gateway, shared)
npx vitest run tests/unit/signing-key-id.test.ts      (5 passed)
git stash push -- packages; git stash pop              (baseline comparison)
npx vitest run (from repo root, crypto suite): 56 failing before and after (Node 22 ML-DSA)
git add / git commit / git push (branch claude/gracious-cerf-c2ehq9)
```

### B4. Pull request

Opened PR #613 with the repo template. Description updated 3 times. Merged by you.

### B5. Production infrastructure (your machine, PowerShell)

```
winget install --id Hashicorp.Terraform -e
terraform version
cd D:\last\parmana-core\infra\parmana-prod-signing
terraform init
terraform init -upgrade
terraform validate                      (failed: ECC_NIST_EDWARDS25519 not in provider 5.x enum)
.\create-signing-key.ps1 -Environment prod          -> arn ...key/7b0c7156-88b1-4979-be5d-7eca96972c39
aws iam list-roles --query "Roles[?contains(RoleName, 'parmana')].RoleName" --output text   -> parmana-vercel-kms-signer
aws iam get-role --role-name parmana-vercel-kms-signer --query "Role.AssumeRolePolicyDocument"  (trust: Vercel OIDC, project pavan-dev-singh-charaks-projects, sub owner:...:project:parmana-api-real:environment:production)
aws iam get-role --role-name parmana-vercel-kms-signer --query "Role.RoleLastUsed"
terraform validate                      (Success)
aws configure export-credentials --format powershell | Invoke-Expression
terraform plan -var-file="prod.tfvars"  (2 to add)
terraform apply -var-file="prod.tfvars" (typed "YES" twice: cancelled; typed "yes": applied)
aws kms describe-key --region ap-south-1 --key-id alias/parmana-prod --query "KeyMetadata.[KeyId,KeyState,KeySpec]" --output text
```

### B6. Vercel (production)

```
vercel env ls production                              (PARMANA_SIGNING_KEY_ID present, Production)
vercel ls parmana-api-real --environment production
vercel inspect https://parmana-api-real-cx11v4j3l-....vercel.app      (no git commit shown)
curl.exe -s -o NUL -w "%{http_code}`n" https://parmana-api-real.vercel.app/health   -> 200
git fetch origin; git checkout --detach origin/main; vercel --prod
vercel inspect https://parmana-api-real-8ma2zq723-....vercel.app
git checkout claude/gracious-cerf-c2ehq9
```

Dashboard: added environment variable `PARMANA_SIGNING_KEY_ID` (Production) and clicked Redeploy (this reused the old build).

### B7. Verification (your machine)

```
aws kms describe-key ... --key-id alias/parmana-prod           -> 7b0c7156..., Enabled, ECC_NIST_EDWARDS25519
aws kms sign --profile parmana-test --key-id alias/parmana-prod --message fileb://msg.txt --message-type RAW --signing-algorithm ED25519_SHA_512 --query Signature --output text   -> signature returned
aws cloudtrail lookup-events --profile parmana-test --region ap-south-1 --lookup-attributes AttributeKey=EventName,AttributeValue=Sign --max-results 5 ...
aws cloudtrail lookup-events ... AttributeKey=EventName,AttributeValue=DescribeKey ...
```

Console: CloudTrail Event history (Mumbai), CloudShell attempted (blocked by account verification).

### B8. Test identity

```
aws configure --profile parmana-test      (region ap-south-1, output json)
```

User `parmana-prod-test`, access key created in IAM console, policy A2 attached.

## C. What this enables

**Now (confirmed):**

- A per-environment signing key with its own alias. Production uses `alias/parmana-prod`; the drill uses `alias/parmana-drill`; `alias/default` is untouched.
- The production role can sign with the production key and nothing else (policy A1).
- Drills can run end to end on drill-tagged keys without touching live keys (policy A3).
- The test identity showed that a signature from the production key works and is logged in CloudTrail.

**Not yet confirmed:**

- That production signs with `alias/parmana-prod`. Until a real request signs, the newest production signing calls are the old `alias/default` ones.
- The Git commit behind the current production deploy.

**Next time it enables:**

- A new environment (for example staging) with its own key, alias and role policy, using the same steps.
- Key rotation: a new key and a new alias, with `PARMANA_SIGNING_KEY_ID` changed. Old records keep verifying because the old alias keeps its key.
- Clean drills with a deletion window, without risk to live signatures.

## D. Items to clean up

- Delete the access key and user `parmana-prod-test`, and policy `parmana-prod-signing-test`.
- Drill key `83cd2361-df73-4879-859f-412d5f9fd7c9` is scheduled for deletion (around 2026-11-20). Cancel it if you want to keep it.
- Remove the drill inline policy's test-only permissions (`EnableKey`, `CreateAlias`) from `parmana-kms-drill` once the drill is finished.
