# Parmana production API (step 3 of the production build)

App Runner service `parmana-api-prod`, 0.25 vCPU / 0.5 GB, scaling 1 to 2 instances.
Reaches the database only through a VPC connector in the private subnets.
No NAT gateway. Public HTTPS endpoint provided by App Runner.

Phase 1 creates ECR, secrets, the connector, and IAM roles. Phase 2 creates the service once the image is in ECR.

## Phase 1 (no service yet)

1. Confirm the account: `aws sts get-caller-identity --profile parmana-prod` shows `<ACCOUNT_ID>`.
2. `terraform init`
3. `terraform plan "-var-file=prod.tfvars" "-out=prod.tfplan"`, then review.
4. `terraform apply prod.tfplan`

## Push the image to ECR

Use the ECR repository URL from the phase 1 output. Tag the image with the git commit SHA, never `latest`, because the repository is immutable.

```powershell
cd D:\last\parmana-core
git pull
$tag = git rev-parse --short HEAD
$repo = (terraform -chdir=infra\parmana-prod-api output -raw ecr_repository_url)
aws ecr get-login-password --profile parmana-prod --region ap-south-1 | docker login --username AWS --password-stdin ($repo.Split('/')[0])
docker build -t "parmana-api:$tag" .
docker tag "parmana-api:$tag" "$repo`:$tag"
docker push "$repo`:$tag"
```

Build from the repo root, where the Dockerfile is. Note the Dockerfile base images are pinned by digest, so the build uses the exact versions that were reviewed.

## Set the secret values (by hand)

Do not put these values in code, in tfvars, or in the repo.

- `parmana/prod/api-keys`: JSON array of caller keys, the output of `npm run generate:api-key` (see the production runbook in `docs/site/deployment/production.mdx`).
- `parmana/prod/key-material`: JSON object with `default` and `gateway` key pairs, the PEM material from `scripts/generate-keypair.ts` and `npm run generate:gateway-keys`.

```powershell
aws secretsmanager put-secret-value --profile parmana-prod --region ap-south-1 --secret-id parmana/prod/api-keys --secret-string file://api-keys.json
aws secretsmanager put-secret-value --profile parmana-prod --region ap-south-1 --secret-id parmana/prod/key-material --secret-string file://key-material.json
```

Delete the local JSON files after upload. Do not commit them.

## Phase 2 (create the service)

1. Edit `prod.tfvars`: set `deploy_service = true`, and pass `image_tag` on the command line:
   ```powershell
   terraform plan "-var-file=prod.tfvars" "-var=image_tag=<commit-sha>" "-out=prod.tfplan"
   terraform apply prod.tfplan
   ```
2. The output `service_url` is the API's public address.

## Checks after phase 2

```powershell
curl https://<service_url>/health
curl https://<service_url>/ready
curl -X POST https://<service_url>/execute -H "Content-Type: application/json" -d "{}"
```

Expected: `/health` returns `200` with `"status":"UP"`. `/ready` returns `200` with `"status":"READY"` and `"authDisabled":false`. `/execute` with no key returns `401`.

If `/ready` fails on database TLS, the RDS certificate authority is not trusted. Fix it by setting `PARMANA_DATABASE_CA_FILE` to an RDS CA bundle in the image, not by turning TLS verification off.

## Before the first real request

- Run database migrations and the policy load (`npm run db:migrate -- apply`, then `npx tsx scripts/apply-policies-table-and-backfill.ts`), from a machine that can reach the database. The database is private, so this needs a bastion, or a one-off job, to be added later.
- Complete the policy approvals (maker and checker), as in the production runbook.

## Notes

- The database URL uses the master user for now. A dedicated application database user is a follow-up.
- `auto_deployments_enabled` is off. Deploy only by running phase 2 with a new `image_tag`.
