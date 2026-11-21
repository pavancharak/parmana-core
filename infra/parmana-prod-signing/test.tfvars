# TEST ENVIRONMENT ONLY. Account 703759331191 (not production 013659367671).
# Use with: terraform plan -var-file=test.tfvars
# Never use prod.tfvars against this account, and never this file against production.

environment               = "test"
region                    = "ap-southeast-2"
signing_key_arn           = "arn:aws:kms:ap-southeast-2:703759331191:key/f56e17d1-0ac4-4c3c-924b-8e01d4f3124b"
server_role_name          = "parmana-test-server"
secondary_key_secret_name = "parmana-test/secondary-key"
secret_key_admin_arn      = "arn:aws:iam::703759331191:user/parmana-test-runner"
