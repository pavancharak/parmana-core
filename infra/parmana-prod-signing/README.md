# Parmana production signing infrastructure

This folder holds the AWS configuration for signing keys in one environment. It is a set of reviewed drafts. Nothing here is applied automatically.

## Files

- `create-signing-key.ps1`: creates the KMS key for the ed25519 signing key. Terraform cannot create this key spec, so the script does.
- `main.tf`: the alias and the runtime permissions for the signing key, and the secret stack for the dilithium3 secondary key (PARMANA_SECONDARY_KEY_SECRET_ID). The secret stack adds a KMS key for the secret, the secret, and a resource policy that denies `GetSecretValue` to every principal except the server role.
- `prod.tfvars`: the values for the production environment.

## Order

1. Run `create-signing-key.ps1` and record the key ARN.
2. Set the variables in `prod.tfvars`, including `secondary_key_secret_name`, `secret_key_admin_arn`, and optionally `rotation_role_arn`.
3. `terraform init`, then `terraform validate`, then `terraform plan`. Check the resource policy and the KMS key policy name only the intended roles.
4. Apply only after the plan is reviewed.
5. Store the dilithium3 PEM as the secret's value, out of band. See `docs/internal/runbooks/SECRETS-MANAGER-KEYS.md`, "The secondary key secret".

## Status

- `terraform validate` and `fmt` pass (terraform 1.9.8).
- The original alias and runtime policy were applied to production from this folder on 2026-11-13 (state serial 3, three resources: `alias/parmana-prod`, the `parmana-vercel-kms-signer` policy, and its data source). The secret stack has not been applied to production. Do not apply here until open item PROD-1 is resolved.
- The same file was applied to the test account in `infra/parmana-test-signing`. See `docs/internal/runbooks/TEST-ACCOUNT-SECRET-CHECK.md`.
- Each stack refuses to run in an account other than the one named in its variable file (`expected_account_id`). That check was confirmed against AWS on 2026-11-21.
- The secret's value is never written to Terraform or to state.
- CloudTrail alerting on `GetSecretValue` is an operator step, not in this code.

See `docs/developer-portal/security/key-management.md` for the full picture.
