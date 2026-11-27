# Parmana test network (step 1 of the test rebuild)

Creates the VPC, two private subnets in two availability zones, a route table with no internet route,
a locked-down default security group, and a database security group that only allows PostgreSQL from inside the VPC.

Not applied yet. Apply only after the test account inventory has been reviewed.

## Before plan or apply

1. Sign in to the **test account only** (`<TEST_ACCOUNT_ID>`). Check with `aws sts get-caller-identity`.
   The stack also checks the account at plan time and stops if it is wrong.
2. Run `terraform init` in this folder.
3. Run `terraform plan -var-file=test.tfvars` and review the output before any apply.

## Not included, on purpose

- **NAT gateway:** the largest hidden cost for a small environment. The API will reach AWS services through VPC endpoints in a later step.
- **Internet gateway:** the database and API do not need public addresses.
- **Public subnets:** added only if an internet-facing load balancer is needed.

## Open items before apply

- The test account has a KMS key in `ap-southeast-2` (`f56e17d1...`) from the earlier signing stack. Its region and state need checking before any apply here.
- `infra/parmana-test-signing/test.tfvars` still names `parmana-test-runner` as the secret key admin. That user has been deleted, so that stack needs updating before it is applied again.
