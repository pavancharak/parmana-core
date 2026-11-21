# Test account signing stack

This folder is the **test account** copy of `infra/parmana-prod-signing/main.tf`. It is kept separate so that its state never mixes with production's. Do not copy the state between folders, and do not apply `test.tfvars` from the production folder.

- Account: `703759331191` (test). Set in `test.tfvars` as `expected_account_id`. Plan and apply fail in any other account.
- Region: `ap-southeast-2`.
- Local state: `terraform.tfstate` in this folder. It is gitignored, and it must never be committed.

## Use

```powershell
cd infra\parmana-test-signing
terraform init -backend=false
terraform plan -out test.tfplan "-var-file=test.tfvars"
terraform apply test.tfplan
```

Store the secondary key with `scripts/store-secondary-key.mjs`. Don't store keys from any `keys/` folder.

## Record

The run that created and checked this stack is in `docs/internal/runbooks/TEST-ACCOUNT-SECRET-CHECK.md`. Keep this folder and `infra/parmana-prod-signing/main.tf` in step: when one changes, make the same change to the other.
