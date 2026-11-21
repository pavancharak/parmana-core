# Key management

[Portal home](../README.md) · [Security](README.md) · [Schema version 3](schema-v3.md) · [Verifier](../sdk/verifier.md) · [Environment variables](../reference/environment-variables.md)

This page describes how the keys that sign Execution Trust Records are held, started, rotated and retired. It describes what the code does on this branch. Where something is not verified against a real cloud account, the page says so.

## The two signing modes

- **Single mode** (`CRYPTO_MODE=single`, the default). One signature, from `PRIMARY_SIGNATURE_PROVIDER` (`ed25519` by default). The key is either a file in `PARMANA_KEY_DIR` (`KEY_PROVIDER=local`) or a KMS key (`KEY_PROVIDER=aws-kms`).
- **Hybrid mode** (`CRYPTO_MODE=hybrid`). Two signatures on every record: the primary (ed25519) and the secondary (`SECONDARY_SIGNATURE_PROVIDER`, `dilithium3` in production). The record is schema version 3 by default. A verifier that accepts it must have both keys pinned.

## Where each key can live

| Key                                 | Option          | Settings                                                                | Status                                                                                                             |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Primary (ed25519), single mode      | KMS             | `KEY_PROVIDER=aws-kms`, `AWS_REGION`                                    | Supported. The server signs through `KmsSigner`; the private key never leaves KMS.                                 |
| Primary (ed25519), hybrid mode      | KMS             | `KEY_PROVIDER=aws-kms`, `CRYPTO_MODE=hybrid`, `PARMANA_HYBRID_KMS=true` | Built, not verified against a real KMS key. Off by default. Without the flag, the server refuses this combination. |
| Primary (ed25519), any mode         | File            | `KEY_PROVIDER=local`, `PARMANA_KEY_DIR`                                 | Supported.                                                                                                         |
| Secondary (dilithium3), hybrid mode | Secrets Manager | `PARMANA_SECONDARY_KEY_SECRET_ID`, `AWS_REGION`                         | Built, not verified against a real Secrets Manager secret. The key is never written to disk.                       |
| Secondary (dilithium3), hybrid mode | File            | `PARMANA_KEY_DIR` (`default-secondary.private.pem`, `.public.pem`)      | Supported.                                                                                                         |

The secrets manager configured by `PARMANA_SECRETS_PROVIDER` resolves connector credentials, not signing keys. It is not the source of the primary key. The secondary key is read from a secret only when `PARMANA_SECONDARY_KEY_SECRET_ID` is set.

## Starting the server

**Single mode with KMS.** The KMS key must be an `ECC_NIST_EDWARDS25519` key, with the `SIGN_VERIFY` usage, and the server's role must be allowed `kms:Sign`, `kms:GetPublicKey` and `kms:DescribeKey` on it. The key is referred to by the alias `alias/<keyId>` with dots turned into slashes; the default key is `alias/default`. The signer uses the `ED25519_SHA_512` algorithm with the `RAW` message type. Messages over 4096 bytes are signed as a fixed-size commitment, which the verifier accepts.

**Hybrid mode with KMS for the primary key.** Set `CRYPTO_MODE=hybrid`, `KEY_PROVIDER=aws-kms`, `PARMANA_HYBRID_KMS=true`, `SECONDARY_SIGNATURE_PROVIDER=dilithium3`, and either a secondary key file or `PARMANA_SECONDARY_KEY_SECRET_ID`. The primary signature is then made through KMS, and the primary private key is never read into the process. Without `PARMANA_HYBRID_KMS=true`, the server refuses `CRYPTO_MODE=hybrid` with `KEY_PROVIDER=aws-kms`, and the Doctor check says so.

**Hybrid mode with the secondary key in a secret.** Set `PARMANA_SECONDARY_KEY_SECRET_ID` to the name or ARN of the secret. The secret's value must be the dilithium3 private key as PEM (PKCS#8). The server:

- reads and parses the secret at start-up, and stops if it cannot;
- does not require `default-secondary.*.pem` files in `PARMANA_KEY_DIR`;
- reads the secret on first use and again after five minutes, so a rotated secret is picked up without a restart.

The secret is read in `AWS_REGION`. If `AWS_REGION` is not set, start-up stops with a message that says so.

## Permissions a deployment needs

These are the actions the code calls. Grant only these.

- `kms:Sign`, `kms:GetPublicKey`, `kms:DescribeKey` on the signing key (single mode, and hybrid mode with `PARMANA_HYBRID_KMS=true`).
- `secretsmanager:GetSecretValue` on the secondary key secret only (when `PARMANA_SECONDARY_KEY_SECRET_ID` is set).

Restrict who may read or change the secret. Anyone who can read it can sign records under the secondary key.

## Putting the key files in place

When the secondary key is a file, the deployment writes it into `PARMANA_KEY_DIR` before the server starts. The server does not fetch files. Make the directory readable only by the server's user, and do not commit the files.

## Infrastructure for the secondary key secret

The Terraform stack in `infra/parmana-prod-signing/main.tf` creates the secret, its own KMS key, and the policies that limit who can read the secret. It is a reviewed draft. It has been applied to a separate test account (`infra/parmana-test-signing`, a copy of the same file) and checked there, as recorded in `docs/internal/runbooks/TEST-ACCOUNT-SECRET-CHECK.md`. The secret stack has not been applied to production. The original alias and runtime policy were applied to production from the same folder on 2026-11-13, and the owner check is open (PROD-1). Each stack refuses to run in any account except the one its variable file names.

What it creates:

- A KMS key used only for the secret. The server role may decrypt with it. Key administration goes to `secret_key_admin_arn`, which must not be the server role.
- The secret named `secondary_key_secret_name`, encrypted with that key.
- A resource policy on the secret that **denies** `GetSecretValue` to every principal except the server role. The deny covers the account root, so a broad IAM grant elsewhere does not allow a read.
- A rotation writer, only if `rotation_role_arn` is set. That role can write a new value and describe the secret. It cannot read the value.
- An inline policy on the server role that allows reading that one secret and decrypting with its key.

What it does not create, and why:

- **The secret's value.** It is the dilithium3 private key as PEM. Create it outside Terraform, with a command that reads the PEM from a file that is then deleted, so the key never appears in Terraform state or in this repository. The file must not be in a shared folder.
- **The CloudTrail alert.** Reads of the secret are logged only if a trail records Secrets Manager data events. Add an alert on `GetSecretValue` from any principal other than the server role. This is an operator step.

Before applying, run `terraform plan` and check that the resource policy and the KMS key policy name only the intended roles.

## Verifying a key

Obtain a key's fingerprint with `parmana-verify key-fingerprint <public-key.pem>`, and check it out of band before pinning it in a trust file. A verifier accepts a record only under a key it has pinned.

## Rotation

1. Create the new key with a new `keyId`. Never reuse an old `keyId`. For KMS, create the new key and point the alias `alias/<keyId>` at it.
2. Add the new key to each verifier's trust file, with its fingerprint and a `validFrom` at or before the first record it will sign.
3. Point the server at the new key. For a secret, update the secret's value; the server picks it up within five minutes.
4. Keep the old key in every trust file until no record signed under it still needs to be checked.

## Retirement

- **Routine retirement:** set the key's `validUntil` in the trust file. The window excludes that instant, so records at or after it are not accepted under that key.
- **Compromise:** set `compromised: true` in the trust file. Verifiers then refuse that key for every record, including records signed before the compromise. Decide before doing this whether those records need to be signed again.

## Failure modes

| Condition                                                       | What happens                                                                                |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `CRYPTO_MODE=hybrid` with `aws-kms` and no `PARMANA_HYBRID_KMS` | Refused at start-up.                                                                        |
| Secret named but not readable or not a PEM key                  | Refused at start-up.                                                                        |
| `AWS_REGION` unset with a secret or KMS                         | Refused at start-up.                                                                        |
| Secret becomes unreadable after start-up                        | Signing fails for that record, and the failure is not cached; the next request tries again. |
| Verifier does not pin the secondary key                         | The record is refused with "no trusted key".                                                |

## What is not covered

- Not run against real AWS KMS. The code paths are tested with fakes and with the verifier.
- Secrets Manager: run once in a test account on 2026-11-21. The server role read the secret from an EC2 instance, and the stored key was ML-DSA-65. Not run against production. The record is in `TEST-ACCOUNT-SECRET-CHECK.md`.
- The server does not check the trust file. Each verifier is updated by hand.
- Rotation is not automated.
- The startup check that reads the secret has unit tests with an injected reader. The same read and the same key-type test were run by hand on the test account (see above). The check function itself was not run inside the API server.
- The classical key is not read from a secret. Only the secondary key can be.

Decisions for the owner: lifting the refusal of hybrid with KMS by default (after a real KMS run), who may read the secondary key's secret, and whether the classical key should also move to a secret store.
