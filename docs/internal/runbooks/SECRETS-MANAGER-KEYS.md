# Signing keys from AWS Secrets Manager (option A): operator runbook

Status as of 2026-11-07. Owner: the maintainer. The code is on `main` (parmana-core #493). Nothing is enabled in any environment yet. Production moves on 10 November 2026 (see `KEY-DELIVERY.md`).

## What this does

The server reads its signing keys from one AWS Secrets Manager secret at startup, instead of from the environment variable `PARMANA_KEY_MATERIAL_JSON`. The environment holds only a reference to the secret, `PARMANA_KEY_MATERIAL_SECRET`. The server writes any key file that is missing from `PARMANA_KEY_DIR`, and never overwrites a file that exists.

## What you need

1. **An AWS account** with Secrets Manager in the region you choose.
2. **A secret** whose value is a JSON object, with the same shape as `PARMANA_KEY_MATERIAL_JSON`:

   ```json
   {
     "default": {
       "privateKeyPem": "<the PEM text of the private key, from key generation>",
       "publicKeyPem": "<the PEM text of the matching public key>"
     }
   }
   ```

   Add one entry for each key id the server uses, for example `default` and `gateway`.

3. **An IAM role** that the Vercel project can assume through its OIDC provider, with `secretsmanager:GetSecretValue` on that one secret only. Use the secret's ARN in the policy.
4. **Platform variables** on the Vercel project (these are not secrets): `AWS_REGION` and `AWS_ROLE_ARN`.

## Variables to set

| Variable                      | Value                    | Where                                 |
| ----------------------------- | ------------------------ | ------------------------------------- |
| `PARMANA_SECRETS_PROVIDER`    | `aws-secrets-manager`    | Each environment that uses the secret |
| `PARMANA_KEY_MATERIAL_SECRET` | The secret's name or ARN | Each environment that uses the secret |
| `AWS_REGION`                  | e.g. `ap-south-1`        | Each environment that uses the secret |
| `AWS_ROLE_ARN`                | The role's ARN           | Each environment that uses the secret |

Do not set `PARMANA_KEY_MATERIAL_JSON` in an environment that uses the secret. The loader does not read it there, and leaving it set keeps the key in the environment.

## Steps

### Create the secret (once)

1. Generate the key pairs on a machine you control. Do not commit them or paste them into a chat.
2. Build the JSON in a local file, and store it as the secret's value in Secrets Manager, using the console or the AWS CLI. Remove the local file afterwards.
3. Note the secret's name or ARN.

### Set up the identity (once)

1. Create the IAM role with the trust policy for the Vercel OIDC provider, and the one-secret policy above.
2. Set `AWS_REGION` and `AWS_ROLE_ARN` on the Vercel project.

### Preview (test first)

1. In the Vercel Preview environment, set the four variables above. Set nothing else for keys.
2. Redeploy the Preview branch.
3. Check that the deployment starts and `/health` responds.
4. Check that the server wrote the key files: a signing request succeeds, and no `PARMANA_KEY_MATERIAL_JSON` value is involved.

If the server refuses to start with `AWS_ROLE_ARN` or `Secrets Manager` errors, the role or the trust policy is wrong. Fix it in AWS, not by putting the key in the environment.

### Production (by 10 November 2026)

1. Set the same four variables on the Production environment.
2. Redeploy `main`. Check `/health`.
3. Remove `PARMANA_KEY_MATERIAL_JSON` from Production.
4. Rotate the keys. The old keys have been in an environment variable, so treat them as exposed. Follow the rotation steps in `KEY-DELIVERY.md`.

## Rollback

- If the server will not start after a change to these variables: remove `PARMANA_KEY_MATERIAL_SECRET`, put `PARMANA_KEY_MATERIAL_JSON` back, and redeploy. Do this only as a short-term measure, and rotate the keys afterwards.
- Never roll back by putting a key into a variable that has not been rotated.

## What this does not do

- It does not create or rotate keys. The owner does that.
- It does not change how v2 or v3 records are signed.
- It does not work on AWS KMS. ML-DSA-65 keys are not held in KMS yet (option B in `KEY-DELIVERY.md`).

## The secondary key secret (dilithium3, F26)

This is separate from option A. It holds only the secondary (dilithium3) private key, read through `PARMANA_SECONDARY_KEY_SECRET_ID`. The primary and other keys stay where they are.

Store the key with `scripts/store-secondary-key.mjs`, and only with it. The script generates a fresh key, so the origin of every stored key is known. Don't store a key from `keys/` or any other folder: such a key may be a copy of a production key, and its origin can't be checked afterwards.

1. Apply `infra/parmana-prod-signing/main.tf` (production) or `infra/parmana-test-signing/main.tf` (test) after reviewing `terraform plan`. Terraform creates the secret and its policies. It does not create the key value.
2. Store a fresh key (Node 24 or later, from the repository root):

   ```bash
   node scripts/store-secondary-key.mjs --secret-id <secret-name> --region <region>
   ```

   To check the key is generated and valid without storing it, add `--dry-run`. The script never prints key material. It prints the secret's ARN and the new version id.

3. Set `PARMANA_SECONDARY_KEY_SECRET_ID` and `AWS_REGION`. The server refuses to start if the secret cannot be read or does not hold an ML-DSA-65 key.
4. Confirm the server starts, and that CloudTrail shows `GetSecretValue` only from the server role.

Rotation: run step 2 again. The server picks up the new value after the five-minute cache expires, or on restart. Once the new key is trusted everywhere it is needed, retire the old one.

The test account run is recorded in `TEST-ACCOUNT-SECRET-CHECK.md`.

Not done: this has not been run against AWS production. Step 4's CloudTrail alert is an operator step.

## Open checks

- Whether Vercel's OIDC role can read the secret has **not been verified**. Verify it on Preview before production.
- The loader is tested with a fake secrets provider. It has not run against AWS Secrets Manager.
