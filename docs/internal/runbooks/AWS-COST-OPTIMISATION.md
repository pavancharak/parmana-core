# AWS Cost Optimisation and Hardening: End-to-End Record

**Account:** Parmana (013659367671)
**Region used for workloads:** us-east-1 (N. Virginia)
**Date of work:** 18 November 2026
**Production service:** `dip-api` on ECS cluster `dip-prod`
**Owner:** Pavan Charak

This document records the full process, from the first budget question to the final verified state. It contains no passwords, access keys or secret values. Secret names and ARNs are included because they are needed to operate the system.

---

## 1. Outcome summary

| Area | Before | After |
|---|---|---|
| Fargate task size (`dip-api`) | 0.5 vCPU / 1 GB (revision 3) | 0.25 vCPU / 0.5 GB (revision 6) |
| Estimated Fargate cost | about $18 a month (24/7) | about $9 a month (24/7) |
| Database `dip-postgres` | running, db.t4g.micro | unchanged (in use by the app) |
| SSL warning in app logs | present | resolved |
| CLI access | none | read-only IAM user `cost-audit` |
| Budget alerts | none | `Monthly-5-USD` (exceeded at the time), `Monthly-20-USD` to confirm |
| Deployment status | n/a | `dip-api:6` COMPLETED, 1 task running |

Net effect: the app runs on a smaller container, with no outage and no change to the data layer. Credits cover the bill for now.

---

## 2. Starting position

- **Credits** (Billing → Credits, screenshot on 18 Nov 2026):
  - AWS Activate FOUNDERS, $1,000, expires 30 Nov 2028
  - Explore AWS: Aurora or RDS, $20, expires 15 Sep 2027
  - AWS Free Tier, $100, expires 15 Sep 2027
  - Total available: $1,118.45. Total used: $1.55 (billed). Estimated used: $12.01.
- **Budget alert:** `Monthly-5-USD` showed **Exceeded**, with $10.46 used and a forecast of $27.63.

---

## 3. Investigation: where the money goes

### 3.1 First pass (wrong assumption)
The Bills page showed **EC2 Container Registry (ECR), US East (N. Virginia), $9.77**. This was assumed to be image storage. It was not. The repository holds about 0.8 GB, which costs well under $0.10 a month.

### 3.2 Cost Explorer by service, 1 to 18 November (gross, before credits)

Gross costs were measured with a filter that excludes credit records (`RECORD_TYPE` not `Credit` or `Refund`).

| Service | Gross cost | Likely source |
|---|---|---|
| Amazon Elastic Container Service | $4.46 | Fargate task `dip-api` in `dip-prod` |
| Amazon RDS | $3.46 | `dip-postgres` (db.t4g.micro, 20 GB) |
| AWS Key Management Service | $1.22 | Customer-managed KMS keys |
| Amazon VPC | $0.90 | Small leftover data transfer or endpoints (no NAT gateway, no public IPs found) |
| AWS Secrets Manager | $0.40 | Secrets (about $0.40 each per month) |
| Amazon ECR | $0.003 | Image storage (negligible) |
| Amazon S3 | $0.0001 | Negligible |

Total gross: about **$10.45**, which matches the budget alert.

Net of credits, every service was about **$0.00** for the period.

### 3.3 Corrected monthly estimates
The earlier estimates were too low. Corrected figures for 24/7 running:

| Item | Approximate monthly cost |
|---|---|
| Fargate, 0.5 vCPU / 1 GB (before) | about $18 |
| Fargate, 0.25 vCPU / 0.5 GB (after) | about $9 |
| RDS db.t4g.micro | about $12 |
| KMS keys (about $1 each) | about $2 to $9 |
| Secrets (about $0.40 each) | about $1 to $2 |

At about $35 a month gross, the credits last roughly until the FOUNDERS expiry in November 2028.

### 3.4 Inventory of `us-east-1` resources (read-only checks)

| Resource | Finding | Decision |
|---|---|---|
| ECS cluster `dip-prod` | 1 service (`dip-api`), 1 running task | Keep (production) |
| Task definition `dip-api` | Revisions 1 to 3 (inactive or old), 4 to 6 active | Keep 3 for rollback for about 2 weeks |
| RDS `dip-postgres` | `available`, db.t4g.micro, 20 GB | Keep. The app reads its connection from the `DIP_PG_URL` secret |
| ECR `dip-api` | 9 images, about 91 MB each, immutable tags | Keep. Apply lifecycle policy |
| NAT gateways | None | n/a |
| Public IPv4 addresses | None | n/a |
| VPC endpoints | None | n/a |
| KMS customer keys | 9 keys | Review for unused keys before any deletion |
| Secrets Manager | 5 secrets: `dip/prod/db-master`, `dip/prod/pg-url`, `dip/prod/config`, `dip/prod/operator-key`, and later `dip/prod/db-ca` | Review unused ones before any deletion |
| IAM users | `dip-deployer`, `dip-sandbox`, `parmana-kms-drill`, `parmana-kms-operator`, `cost-audit` | No MFA on any user. Review |

**Correction:** `dip-postgres` was first assumed unused ("I don't use the DB"). The running task's environment included `DIP_PG_URL`, and the app logged "state is durable in PostgreSQL". The database is in use, so it was kept.

---

## 4. Access setup for cost work

### 4.1 Read-only IAM user
1. Root or admin: **Account → IAM user and role access to Billing information → Activate**. This lets IAM users see Billing and Cost Explorer.
2. **IAM → Users → Create user**: name `cost-audit`, no console access.
3. Attach the AWS managed policy **ReadOnlyAccess** (job function).
4. Create an access key for CLI use. Save the CSV privately. Never paste keys into chat.

### 4.2 CLI on Windows
```powershell
winget install Amazon.AWSCLI
aws configure            # Access key ID, Secret key, region us-east-1, output json
aws sts get-caller-identity
```
Identity confirmed as `arn:aws:iam::013659367671:user/cost-audit`.

**Note:** the CLI default region was `ap-south-1` (India), because the machine is in India. Commands for this account use `--region us-east-1`, since the workloads run there. Cost Explorer is global and works from any region.

### 4.3 What `cost-audit` can and cannot do
- Can: read costs, describe ECS, RDS, EC2, KMS, Secrets Manager, CloudWatch metrics and logs.
- Cannot: create snapshots, create secrets, change task definitions, or delete anything. These denials were expected and correct.
- Do not give this user write permissions. Use an admin login for changes.

---

## 5. Changes made

### 5.1 Budgets
- `Monthly-5-USD` created with an alert at $5. It fired (Exceeded) at $10.46 gross.
- `Monthly-20-USD` was planned. **Confirm it exists** (Billing → Budgets).

### 5.2 Fargate right-sizing (`dip-api`)
Evidence before the change (CloudWatch, `AWS/ECS`, 10 to 19 November 2026, hourly maximum):
- **MemoryUtilization peak: 2.73%** of 1 GB (about 28 MB used)
- **CPUUtilization peak: 5.28%** of 0.5 vCPU

Both were far below the limits of the smaller size (0.25 vCPU / 0.5 GB, with a 512 MB memory limit).

Steps:
1. Created revision 4 from revision 3: task size 0.25 vCPU / 0.5 GB.
2. Updated the service to revision 4, with **Force new deployment**. Rollout COMPLETED, 1 task running.
3. Logs confirmed the app started.

Rollback target: revision 3 (0.5 vCPU / 1 GB).

### 5.3 SSL and CA hardening
**Warning in logs:** the database URL used `sslmode=require`, `prefer` or `verify-ca`. Node-postgres treats these as `verify-full` today, and future versions will change the meaning. The fix needs the RDS CA certificate.

Steps taken:
1. Downloaded the AWS RDS CA bundle (`us-east-1-bundle.pem`) from the AWS truststore URL.
2. Created Secrets Manager secret **`dip/prod/db-ca`** (type: Other, plaintext PEM). ARN: `arn:aws:secretsmanager:us-east-1:013659367671:secret:dip/prod/db-ca-by7xBf`.
3. Created revision 5 with environment variable `PARMANA_DATABASE_CA` (ValueFrom).
   - **Problem:** the value was entered as a name, not a full ARN. ECS tried SSM Parameter Store and failed with `ssm:GetParameters` AccessDenied. The old task kept serving, so there was no outage.
4. Created revision 6 with the full secret ARN as the ValueFrom value.
   - **Problem 2:** the execution role `dip-ecs-execution-prod` lacked `secretsmanager:GetSecretValue` on the new secret.
5. Added an inline policy to `dip-ecs-execution-prod`, named `read-db-ca-secret`, allowing `GetSecretValue` on the single secret ARN.
6. Force-redeployed. The service reached **COMPLETED** on revision 6, with 1 task running.
7. Final logs (task `b57f789511554f39aff8195ac0e4d7b5`) show:
   - `dip-api listening on 3000`
   - `state is durable in PostgreSQL`
   - `warning: no connectors are configured; execution refuses with CONNECTOR_NOT_FOUND`
   - **No SSL warning.**

Note: the `sslmode` warning was resolved in the final logs. The `pg-url` secret was edited to set `sslmode=verify-full` as the warning recommends (confirmed by owner, 18 Nov 2026). Do not paste the URL anywhere.

### 5.4 ECR lifecycle policy (applied, confirmed by owner 18 Nov 2026)
Repository `dip-api` has immutable tags, so each deploy adds a new image. Apply the lifecycle policy to keep storage small:

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Expire untagged images older than 1 day",
      "selection": { "tagStatus": "untagged", "countType": "sinceImagePushed", "countUnit": "days", "countNumber": 1 },
      "action": { "type": "expire" }
    },
    {
      "rulePriority": 2,
      "description": "Keep only the 10 newest tagged images",
      "selection": { "tagStatus": "any", "countType": "imageCountMoreThan", "countNumber": 10 },
      "action": { "type": "expire" }
    }
  ]
}
```

ECR storage is not the main cost driver, so this is housekeeping rather than a major saving.

---

## 6. Current state (verified)

```text
Service:        dip-api (cluster dip-prod)
Task definition: dip-api:6
Rollout:         COMPLETED
Running count:   1
Task size:       0.25 vCPU / 0.5 GB
Logs:            listening on 3000; state durable in PostgreSQL; no SSL warning
Open warning:    no connectors are configured (owner decision)
```

---

## 7. Open items

| # | Item | Owner | Notes |
|---|---|---|---|
| 1 | ~~Confirm the `pg-url` sslmode edit was made and record the value~~ **Done (confirmed by owner 18 Nov 2026).** Record the sslmode value in the secret's own notes, not here | Owner | Do not share the URL |
| 2 | Connector warning: decide whether `dip-api` needs connectors | Owner | Harmless if not needed. Does not affect cost |
| 3 | ~~Confirm `Monthly-20-USD` budget exists~~ **Done (confirmed by owner 18 Nov 2026).** | Owner | Billing → Budgets |
| 4 | ~~Apply the ECR lifecycle policy to `dip-api`~~ **Done (confirmed by owner 18 Nov 2026).** | Owner | Section 5.4 |
| 5 | Review the 9 KMS keys and 5 secrets for unused items | Owner | Schedule deletion with the 7-day window only after confirming no use |
| 6 | Remove `PARMANA_DATABASE_CA` and `dip/prod/db-ca` | Owner | Optional. Saves about $0.40 a month on the secret. Only after confirming the warning stays resolved |
| 7 | Deregister task definition revision 3 | Owner | After about 2 weeks of stable running |
| 8 | Enable MFA on the root user and on IAM users | Owner | Recommended |
| 9 | Delete the `cost-audit` access key when cost work is finished | Owner | Keep only if you want ongoing CLI cost checks |
| 10 | Remove any saved `cost-audit` console password from the browser | Owner | That user should not have console access |
| 11 | Delete the local CSV with the access key | Owner | Store it in a password manager if needed |
| 12 | Re-check the bill after one week | Owner | Expect Fargate to be about half its previous level |

---

## 8. Monthly routine (read-only)

Run these in PowerShell as `cost-audit`:

```powershell
# Gross cost by service, month to date (excludes credits)
Set-Content -Path "$env:USERPROFILE\nocredit.json" -Encoding ascii -Value '{"Not":{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit","Refund"]}}}'
aws ce get-cost-and-usage --time-period Start=2026-12-01,End=2026-12-31 --granularity MONTHLY --metrics UnblendedCost --group-by Type=DIMENSION,Key=SERVICE --filter file://$env:USERPROFILE/nocredit.json --output json

# Deployment health
aws ecs describe-services --cluster dip-prod --services dip-api --region us-east-1 --query "services[0].[taskDefinition,deployments[0].rolloutState,runningCount]" --output table

# Application logs (last 15 minutes)
aws logs tail /ecs/dip-api --since 15m --region us-east-1

# Memory and CPU peaks (last 7 days)
aws cloudwatch get-metric-statistics --namespace AWS/ECS --metric-name MemoryUtilization --dimensions Name=ClusterName,Value=dip-prod Name=ServiceName,Value=dip-api --start-time 2026-11-25T00:00:00Z --end-time 2026-12-02T00:00:00Z --period 3600 --statistics Maximum --region us-east-1 --query "max_by(Datapoints, &Maximum).Maximum" --output text
```

Change the dates in the commands to the period you want to check.

---

## 9. Rollback procedures

**Fargate size (revision 6 to 3):**
- Update the service to task definition `dip-api:3` and tick **Force new deployment**.
- Revision 3 uses 0.5 vCPU / 1 GB, with the original environment and image.

**Database URL or CA change (revision 6 to 4):**
- Update the service to `dip-api:4`. Revision 4 has the original database settings.
- If the `pg-url` secret was changed, restore the previous secret version in Secrets Manager (**Versions** tab). Only restore if the app fails.

**Stuck rollout:**
1. Check the events:
   ```powershell
   aws ecs describe-services --cluster dip-prod --services dip-api --region us-east-1 --query "services[0].events[0:3].message" --output text
   ```
2. A `ResourceInitializationError` about secrets points to an execution role permission or an ARN problem. Check the execution role `dip-ecs-execution-prod`.
3. The old task keeps running until the new one is healthy, so the app stays up during a failed rollout.

---

## 10. Lessons learned

1. **Confirm what a cost number represents.** Bills show gross charges and Cost Explorer shows net charges after credits. Check both before acting.
2. **Measure before shrinking.** The memory and CPU peaks justified the change. The CloudWatch metrics were checked first.
3. **ECS secrets need full ARNs.** A name is read from SSM Parameter Store, which causes a confusing `ssm:GetParameters` error.
4. **Execution roles need permission for each new secret.** Add the new secret's ARN to the execution role before deploying.
5. **Don't remove `sslmode` from a database URL without a CA setting.** Use an explicit mode such as `verify-full`, which behaves the same as today's `require`.
6. **Read-only identities should stay read-only.** The denials from `cost-audit` were a useful safety check.
7. **Keep the previous revision until the new one is proven.** This makes rollback a single update.
8. **Don't create new task definitions by mistake.** Use **Create new revision** from the existing `dip-api` family.

---

## 11. Security notes

- No access keys, passwords or secret values appear in this document or in chat.
- Access keys were shared only through a local CSV. Delete the CSV once it's stored safely.
- The browser autofilled `cost-audit` details into a secret form once. Clear saved passwords for that user.
- No IAM user has MFA. Enable it for the root user first, then for human users.
- The `dip-prod` database and secrets were not stopped or deleted. Any future change to them should be taken from a snapshot first, using an admin identity.
