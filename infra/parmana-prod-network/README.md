# Parmana production network (step 1 of the production build)

Creates the VPC, two private subnets in two availability zones, a route table with no internet route,
a locked-down default security group, and a database security group that only allows PostgreSQL from inside the VPC.

Account <ACCOUNT_ID>. Not applied yet. Apply only after review of the plan.

## Before plan or apply

Sign in once per day with `aws sso login --profile parmana-prod`. The profile is set in `main.tf`, so no environment variable is needed.

1. Confirm the signed-in account is <ACCOUNT_ID> (`aws sts get-caller-identity --query Account --output text`).
   The stack also checks this at plan time and stops if it is wrong.
2. `terraform init`, then `terraform plan "-var-file=prod.tfvars"`.
3. Review the plan. Do not apply until reviewed.

## Notes

- The VPC CIDR is 10.30.0.0/16, different from the test stack (10.20.0.0/16), so the two can be peered later without overlap.
- No NAT gateway and no internet gateway, for cost. Outbound AWS access will use VPC endpoints in a later step.
