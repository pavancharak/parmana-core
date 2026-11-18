# AWS architecture and usage: end to end

**Account:** Parmana (013659367671)
**Owner:** Pavan Charak
**As of:** 18 November 2026
**Companion runbook:** `AWS-COST-OPTIMISATION.md` (the detailed record of the cost and hardening work)

This document answers four questions: why AWS, where things run, which services are used, and when they started. It ends with the total usage and cost to date.

Sources are marked. **Repo** means the production docs in this repository. **Account** means checks made against the AWS account on 18 November 2026. Items marked **Unconfirmed** are inferences that the owner should verify.

---

## 1. Why AWS

**Repo.** The production docs give these reasons:

- **Signing keys stay inside KMS.** With `KEY_PROVIDER=aws-kms`, Parmana signs inside AWS KMS. The private key is created in KMS and never leaves it. The server sends the bytes to sign and gets a signature back.
- **No stored AWS keys.** The Vercel-hosted API exchanges its project OIDC token for short-lived credentials by assuming an IAM role. No AWS access key is stored in Vercel or in the repo.
- **Least-privilege signer role.** The role's trust policy allows only the production environment of the `parmana-api-real` Vercel project to assume it.

**Account.** The `dip` workload uses managed AWS services, so that the team doesn't run servers itself: containers on Fargate, an image registry, a managed Postgres database, a secrets store, and built-in logs and metrics.

---

## 2. Where it runs

| Part                                         | Location                                                     | Source  |
| -------------------------------------------- | ------------------------------------------------------------ | ------- |
| Parmana API (governance, approvals, signing) | Vercel project `parmana-api-real`                            | Repo    |
| Parmana signing key (`alias/default`)        | AWS KMS, **ap-south-1 (Mumbai)**                             | Repo    |
| Parmana production database                  | Supabase Postgres (transaction pooler)                       | Repo    |
| `dip-api` service                            | ECS cluster `dip-prod`, Fargate, **us-east-1 (N. Virginia)** | Account |
| `dip-api` image                              | ECR repository `dip-api`, **us-east-1**                      | Account |
| `dip-api` database                           | RDS `dip-postgres`, **us-east-1**                            | Account |
| `dip-api` secrets                            | Secrets Manager, **us-east-1**                               | Account |

Two regions are in use. The Parmana signing key is in Mumbai, and the `dip` workload is in N. Virginia. Keep them separate when you make changes.

**Unconfirmed:** the purpose of `dip-api`. Its logs mention "connectors" and `CONNECTOR_NOT_FOUND`, which suggests it is a Parmana connector or executor, but the repo docs do not describe it. The owner should confirm.

---

## 3. Which services

### 3.1 Parmana (repo)

| Service           | Use                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Vercel            | Hosts the API (`parmana-api-real`)                                                                        |
| AWS KMS           | Signs execution trust records, intents, refusal records and approvals. Key alias `default`, in ap-south-1 |
| IAM (OIDC role)   | Lets Vercel assume a signer role, with no stored keys                                                     |
| Supabase Postgres | Production storage (`PARMANA_STORAGE=postgres`)                                                           |

### 3.2 `dip` workload (account)

| Service         | Resource                                                                                                                                              | Use                                                                                              |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| ECS (Fargate)   | Cluster `dip-prod`, service `dip-api`                                                                                                                 | Runs the container. One task, 0.25 vCPU / 0.5 GB (task definition revision 6)                    |
| ECR             | Repository `dip-api`                                                                                                                                  | Stores the container image. Immutable tags, 9 images                                             |
| RDS             | `dip-postgres`, db.t4g.micro, 20 GB                                                                                                                   | Database. The app reads its connection from a secret                                             |
| Secrets Manager | `dip/prod/config`, `dip/prod/operator-key`, `dip/prod/pg-url`, `dip/prod/db-master`, `dip/prod/db-ca`                                                 | Configuration, operator key, database connection, master credentials, and the RDS CA certificate |
| KMS             | 9 customer keys in us-east-1                                                                                                                          | Encryption for the above. Not yet reviewed in ap-south-1                                         |
| IAM             | Users `dip-deployer`, `dip-sandbox`, `parmana-kms-drill`, `parmana-kms-operator`, `cost-audit`. Roles `dip-ecs-execution-prod`, `dip-api-signer-prod` | Access control. No user has MFA                                                                  |
| CloudWatch      | Log group `/ecs/dip-api`, ECS metrics                                                                                                                 | Logs and utilisation                                                                             |
| VPC             | Default networking                                                                                                                                    | No NAT gateway, no public IPv4 addresses, no VPC endpoints found                                 |
| S3              | Small usage                                                                                                                                           | Negligible                                                                                       |
| Billing         | Cost Explorer, Budgets (`Monthly-5-USD`, `Monthly-20-USD`), Credits                                                                                   | Cost tracking and alerts                                                                         |

---

## 4. When it started

| Date                 | Event                                                                                                                                                                     | Source  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1 Sep 2026 (approx.) | AWS Free Tier credit ($100) started. Expires 15 Sep 2027                                                                                                                  | Account |
| 1 Nov 2026           | AWS Activate FOUNDERS credit ($1,000) started. Expires 30 Nov 2028                                                                                                        | Account |
| 10 Nov 2026          | `dip` resources created: Secrets Manager secrets (07:00 IST), ECR repository (07:21), first image pushes (07:38 to 07:50). ECS service and RDS date from around this time | Account |
| 10 Nov 2026          | AWS Explore credit ($20) started. Expires 15 Sep 2027                                                                                                                     | Account |
| 18 Nov 2026          | Cost investigation, Fargate right-sizing, CA secret and sslmode hardening, read-only CLI, budget alerts                                                                   | Account |

The `dip` resources are about eight days old at the time of writing. The exact creation date of the ECS service and RDS instance was not checked.

---

## 5. Total usage and cost

### 5.1 Gross charges, 1 to 18 November 2026 (before credits)

| Service         | Gross            | Notes                                                            |
| --------------- | ---------------- | ---------------------------------------------------------------- |
| ECS (Fargate)   | $4.46            | Task ran from 10 Nov at 0.5 vCPU / 1 GB, then 0.25 vCPU / 0.5 GB |
| RDS             | $3.46            | `dip-postgres`, db.t4g.micro                                     |
| KMS             | $1.22            | Customer keys in us-east-1                                       |
| VPC             | $0.90            | Small leftover data transfer                                     |
| Secrets Manager | $0.40            | About $0.40 per secret per month                                 |
| ECR             | $0.003           | Image storage                                                    |
| S3              | $0.0001          |                                                                  |
| **Total**       | **about $10.45** | Matches the $10.46 budget alert                                  |

Cost Explorer, net of credits, shows about $0.00 for every service. The credits cover this period.

### 5.2 Credits

| Credit                      | Amount        | Expires     |
| --------------------------- | ------------- | ----------- |
| AWS Free Tier               | $100          | 15 Sep 2027 |
| AWS Explore (Aurora or RDS) | $20           | 15 Sep 2027 |
| AWS Activate FOUNDERS       | $1,000        | 30 Nov 2028 |
| **Total available**         | **$1,118.45** |             |

Billed so far: $1.55. Estimated used (Billing page): $12.01.

### 5.3 Expected run rate (gross, 24/7)

| Item                                       | Approximate monthly          |
| ------------------------------------------ | ---------------------------- |
| Fargate, 0.25 vCPU / 0.5 GB (after change) | about $9                     |
| RDS db.t4g.micro                           | about $12                    |
| KMS keys (about $1 each)                   | about $2 to $9               |
| Secrets (about $0.40 each)                 | about $1 to $2               |
| ECR, VPC, S3                               | under $2                     |
| **Total**                                  | **about $25 to $30 a month** |

At about $25 to $30 a month, the $1,118 in credits last well past the FOUNDERS expiry in November 2028.

### 5.4 Not included in these figures

- The Parmana API on Vercel (billed by Vercel)
- The Supabase database (billed by Supabase)
- The Mumbai KMS signing key and its requests, which were not in the us-east-1 query

---

## 6. Corrections and warnings

- **Do not delete KMS keys without checking both regions.** The production signing key behind `alias/default` is in **ap-south-1**. An earlier note suggested reviewing KMS keys, but only us-east-1 was checked. Review ap-south-1 separately, and never delete the key behind `alias/default`.
- **Do not remove RDS or secrets used by `dip-api`** without a snapshot first, and confirm with the owner. `DIP_PG_URL` points to `dip-postgres`.
- **Read-only CLI.** The `cost-audit` user can read costs and resources but cannot change them. Changes need an admin login.

---

## 7. Open questions for the owner

1. What does `dip-api` do, and is it a Parmana connector or executor?
2. Should `dip-api` have connectors configured? (The logs warn that none are.)
3. Is the Mumbai KMS key set up as the repo describes, and which KMS keys are in use in ap-south-1?
4. Is MFA enabled for the root user and for each IAM user?
5. Which Vercel and Supabase costs should be tracked alongside this account?
