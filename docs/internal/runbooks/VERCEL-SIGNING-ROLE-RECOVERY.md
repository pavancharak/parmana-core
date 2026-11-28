# Runbook: recover the Vercel signing role and KMS key

Use this when `parmana-api-real` (production, Vercel) fails on every request after an AWS change. The procedure was used
on 2026-11-28 to recover from the outage in INC-17. Read INC-17 for the history.

Run the PowerShell commands from `infra\parmana-prod-signing`. Quote every argument that contains a dot, `=` or a
hyphen-plus-name, because PowerShell splits unquoted arguments at dots. Never use angle brackets (`<...>`) in a command,
because PowerShell reads `<` as an operator. Replace placeholders with real values.

## 1. Confirm the symptom

```
curl.exe -s -o NUL -w "%{http_code}\n" https://parmana-api-real.vercel.app/health
```

`200` means the service is up and this runbook isn't needed. `500` with `FUNCTION_INVOCATION_FAILED` means it's needed.
Read the newest runtime log in the Vercel dashboard, and find the first error line. Then use the matching section below.

| First error in the log                                                  | Cause                                                      | Go to            |
| ----------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------- |
| `AccessDenied: Not authorized to perform sts:AssumeRoleWithWebIdentity` | Role missing, or its trust policy no longer matches Vercel | Section 2        |
| `Alias arn:aws:kms:...:alias/parmana-prod is not found`                 | Alias deleted, or key not reachable                        | Sections 3 and 4 |
| `KeyState` other than `Enabled`                                         | Key disabled or scheduled for deletion                     | Section 3        |

## 2. Check the role and the OIDC provider

```
aws iam get-role --role-name parmana-vercel-kms-signer --query Role.Arn --output text
aws iam list-open-id-connect-providers
aws cloudtrail lookup-events --region us-east-1 --start-time 2026-11-20T00:00:00Z --end-time 2026-11-30T00:00:00Z --lookup-attributes AttributeKey=EventName,AttributeValue=DeleteRole --query "Events[].[EventTime,Username]" --output table
```

- If `get-role` fails with `NoSuchEntity`, the role is missing. Recreate it:
  1. Save the trust policy in the current folder as `vercel-signer-trust.json`. Use the policy below, and write the file with
     `[System.IO.File]::WriteAllText` rather than `Set-Content`, so there is no byte-order mark. Replace the account ID.

     ```json
     {
       "Version": "2012-10-17",
       "Statement": [
         {
           "Effect": "Allow",
           "Principal": {
             "Federated": "arn:aws:iam::<ACCOUNT_ID>:oidc-provider/oidc.vercel.com/pavan-dev-singh-charaks-projects"
           },
           "Action": "sts:AssumeRoleWithWebIdentity",
           "Condition": {
             "StringEquals": {
               "oidc.vercel.com/pavan-dev-singh-charaks-projects:aud": "https://vercel.com/pavan-dev-singh-charaks-projects",
               "oidc.vercel.com/pavan-dev-singh-charaks-projects:sub": "owner:pavan-dev-singh-charaks-projects:project:parmana-api-real:environment:production"
             }
           }
         }
       ]
     }
     ```

  2. Create the role:
     `aws iam create-role --role-name parmana-vercel-kms-signer --assume-role-policy-document "file://vercel-signer-trust.json" --description "Parmana production signing role, assumed by Vercel OIDC"`

  The `aud` value is Vercel's default for the team. It was not checked against the policy the role had before it was
  deleted, because that policy was gone. If `/health` still fails with `AccessDenied` after the role exists, check the
  `aud` and `sub` values against a working Vercel deployment, and correct them in the trust policy.

- If the OIDC provider is missing from the list, stop. Recreating the provider is a separate change with its own review.
- The `DeleteRole` lookup shows who deleted the role and when.

Recreating the role does not restore its permission policies. Section 4 restores the signing policy. Any other policy the
role had must be restored from its previous definition, which is not in this repository.

## 3. Check the signing key

```
aws kms describe-key --key-id 7b0c7156-88b1-4979-be5d-7eca96972c39 --region ap-south-1 --query KeyMetadata.KeyState --output text
```

- `Enabled` is correct.
- `Disabled` or `PendingDeletion`: restore it. A scheduled deletion has a window of 7 to 30 days, so this is usually still
  possible.

  ```
  aws kms cancel-key-deletion --key-id 7b0c7156-88b1-4979-be5d-7eca96972c39 --region ap-south-1
  aws kms enable-key --key-id 7b0c7156-88b1-4979-be5d-7eca96972c39 --region ap-south-1
  ```

- `NotFoundException`: the key is gone and cannot be restored. Stop and escalate. Signed evidence made with it can still be
  verified with its public key, but new signing needs a new key and a new deployment configuration.

Also check who scheduled any deletion, with `ScheduleKeyDeletion` in CloudTrail, and whether any alias was deleted, with
`DeleteAlias`.

## 4. Restore the alias and the signing policy with Terraform

Plan with a saved file, so the apply runs exactly what was reviewed. Use `-target` for the two resources this needs:

```
terraform init
terraform plan "-var-file=prod.tfvars" "-target=aws_kms_alias.signing" "-target=aws_iam_role_policy.runtime" "-var=secondary_key_secret_name=not-used" "-var=secret_key_admin_arn=arn:aws:iam::<ACCOUNT_ID>:root" "-out=restore.tfplan"
```

Check the plan before applying it. It should be `Plan: 2 to add, 0 to change, 0 to destroy` (or fewer adds if one of the
two already exists). The placeholder values for `secondary_key_secret_name` and `secret_key_admin_arn` are used only so
Terraform stops prompting. The `-target` flags keep the secret resources out of the plan. Nothing is written to
`prod.tfvars`.

```
terraform apply restore.tfplan
```

Terraform needs AWS credentials in the same PowerShell session. If it reports no credentials, run
`aws configure export-credentials --format powershell | Invoke-Expression` first, as the repository's command runbook
describes.

A full plan without `-target` would also create the secondary secret and its KMS key. Don't run one unless that is wanted.

## 5. Verify

```
curl.exe -s -o NUL -w "%{http_code}\n" https://parmana-api-real.vercel.app/health
curl.exe -s -o NUL -w "%{http_code}\n" https://parmana-api-real.vercel.app/ready
curl.exe -s -o NUL -w "%{http_code}\n" https://parmana-api-real.vercel.app/policies
```

Expected: `200`, `200` and `401`. `/policies` returns `401` without credentials, which is correct.

## 6. Record it

Add the outcome to the incident entry (INC-17 in `04-INCIDENTS-LOG.md`). Don't rewrite earlier entries. Add dated notes.

## Prevention

- Before deleting an IAM role, a KMS key or an alias, check every deployment's AWS settings for a reference to it. This
  includes the `AWS_ROLE_ARN` variable in Vercel.
- Keep the 7-day deletion window on KMS keys, and alert on any `ScheduleKeyDeletion` or `DeleteRole` event that concerns a
  production resource.
- Put the Terraform state for the signing role and its trust policy under management, so a deleted role shows up as drift.
