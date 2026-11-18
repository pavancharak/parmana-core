# Where Parmana uses AWS, and how

**Purpose:** a map of every place the code calls AWS, what each call does, how it authenticates, which settings control it, and what happens when it fails.

**Scope:** the code in this repository, as read on 18 November 2026. It shows what the software can do. It does not show what is switched on in a given environment. For that, check the environment variables in the host (Vercel) and in the AWS account.

**Companion documents:**
- `AWS-ARCHITECTURE-AND-USAGE.md`: why AWS, where things run, which services, when they started, and cost.
- `AWS-COST-OPTIMISATION.md`: the cost and hardening work and its record.

---

## 1. Summary

| # | AWS service | Used for | Turned on by | Code |
|---|---|---|---|---|
| 1 | KMS | Signing with the default Ed25519 key | `KEY_PROVIDER=aws-kms` | `packages/crypto/src/providers/signer/KmsSigner.ts` |
| 2 | KMS | Choosing the signer at startup | `KEY_PROVIDER` | `packages/crypto/src/SignerBootstrap.ts` |
| 3 | Secrets Manager | Loading secret configuration | `PARMANA_SECRETS_PROVIDER=aws-secrets-manager` | `packages/api/src/bootstrap/secrets/AwsSecretsManagerProvider.ts` |
| 4 | Secrets Manager | Loading gateway key material | `PARMANA_KEY_MATERIAL_SECRET` set | `packages/api/src/bootstrap/loadKeyMaterialFromSecretsManager.ts` |
| 5 | SES | Sending policy alert email | `PARMANA_POLICY_V2_EMAIL_FROM` set | `packages/api/src/policyV2/sesEmailChannel.ts` |
| 6 | SNS (from SES) | Receiving bounce and complaint notices | `PARMANA_POLICY_V2_SNS_EVENTS=true` | `packages/api/src/routes/policy-v2-bounces.ts`, `packages/api/src/policyV2/policyV2Bounces.ts` |
| 7 | KMS, Secrets Manager | Health checks on AWS settings | Run by `doctor` and `doctor-online` | `packages/shared/src/config/Doctor.ts`, `scripts/doctor-online.ts` |
| 8 | KMS | Manual verification of the signing key | Run by hand | `scripts/verify-kms-signing.ts` |

Packages that depend on AWS SDKs (from `package.json`):
- `packages/crypto`: `@aws-sdk/client-kms`
- `packages/api`: `@aws-sdk/client-secrets-manager` and `@aws-sdk/client-ses`

The Python SDK, the connector SDK, and the CI workflow do not call AWS. CI sets `KEY_PROVIDER=local`.

---

## 2. Each use in detail

### 2.1 KMS signing (`KEY_PROVIDER=aws-kms`)

**What it does.** Parmana signs execution trust records, execution intents, refusal records, audit events, execution authorizations, receipts, policy-change approval records and the execution chain with the KMS key under the alias `default`. The private key is created in KMS and never leaves it. The server sends the bytes to sign and receives a signature back.

**Key spec.** Only `ECC_NIST_EDWARDS25519` (Ed25519) is accepted. Any other key spec stops the server with `KmsSigner only supports ECC_NIST_EDWARDS25519 keys`.

**Scope of KMS.** Only the `default` key is in KMS. The gateway attestation key stays a file (`gateway.private.pem`), from `PARMANA_KEY_DIR` or `PARMANA_KEY_MATERIAL_JSON`.

**Limits enforced at startup:**
- `PRIMARY_SIGNATURE_PROVIDER` other than Ed25519 is refused. ML-DSA-65 is not supported under KMS.
- `CRYPTO_MODE=hybrid` is refused. Use `CRYPTO_MODE=single` with KMS, or `KEY_PROVIDER=local`.
- Other `KEY_PROVIDER` values (`azure-key-vault`, `gcp-kms`, `hsm`) pass validation but have no implementation, so the server refuses to start with them.

**Region.** `AWS_REGION` must match the region of the key. The production docs use `ap-south-1`.

**Authentication.**
- On Vercel: if `AWS_ROLE_ARN` is set, the server exchanges the project's OIDC token for short-lived credentials by assuming that role. No static keys.
- Locally: if `AWS_ROLE_ARN` is not set, the standard AWS credential chain is used (for example `AWS_PROFILE`).

**Failure behaviour.** The server does not fall back to a local key. If KMS is unreachable or the key is missing, signing fails and the server refuses to start with a message naming the key id and the settings to check (`assertSigningKeyMaterialConfigured.ts`).

**IAM needed on the signer role.** `kms:Sign`, `kms:GetPublicKey` and `kms:DescribeKey` on the production key. The trust policy should allow only the `parmana-api-real` production environment to assume the role. (Confirm the exact policy against `docs/site/deployment/aws-kms-signing.mdx`.)

**Verify.**
```bash
npm run verify:kms
```
Run it with `AWS_REGION=ap-south-1 AWS_PROFILE=<profile>`. Do not set `AWS_ROLE_ARN` for this run. The script checks the key is Ed25519, enabled, and can sign.

### 2.2 Choosing the signer (`SignerBootstrap`)

`SignerBootstrap.ts` reads `KEY_PROVIDER` and returns `KmsSigner` for `aws-kms` or `LocalFileSigner` for `local`. Any other value stops startup.

`ReceiptCrypto` and `VerificationCrypto` take the signer from here, so every signature in the system goes through the same switch.

### 2.3 Secrets Manager: configuration (`PARMANA_SECRETS_PROVIDER`)

**What it does.** When `PARMANA_SECRETS_PROVIDER=aws-secrets-manager`, `SecretsProviderBootstrap.ts` creates `AwsSecretsManagerProvider`. The provider reads named secrets through `GetSecretValue`.

**Region.** `AWS_REGION` is required. The server stops with `AwsSecretsManagerProvider requires AWS_REGION to be set.` if it is missing.

**Authentication.** Same as KMS: `AWS_ROLE_ARN` gives short-lived credentials on Vercel. Otherwise the standard chain is used.

**IAM needed.** `secretsmanager:GetSecretValue` on each secret the service reads. The `dip-api` case showed the failure mode: a new secret not in the role's policy gives `AccessDeniedException` at task start.

### 2.4 Secrets Manager: key material (`PARMANA_KEY_MATERIAL_SECRET`)

**What it does.** `loadKeyMaterialFromSecretsManager.ts` runs at startup when `PARMANA_KEY_MATERIAL_SECRET` is set. The variable holds a secret name or ARN, not the key. The secret's value has the same JSON shape as `PARMANA_KEY_MATERIAL_JSON` and is written to key files in `PARMANA_KEY_DIR`.

**Requirement.** `PARMANA_SECRETS_PROVIDER` must also be set to `aws-secrets-manager`. Setting only `PARMANA_KEY_MATERIAL_SECRET` is refused.

**When unset.** The function does nothing, and keys come from `PARMANA_KEY_MATERIAL_JSON`, a mounted file, or `PARMANA_KEY_DIR`.

**Why it matters.** The gateway private key is loaded from here in this setup, so a failure in this step stops the server before it serves requests.

### 2.5 SES: policy alert email (`PARMANA_POLICY_V2_EMAIL_FROM`)

**What it does.** `sesEmailChannel.ts` sends policy version 2 alert emails through `SendEmailCommand`. The sender is `PARMANA_POLICY_V2_EMAIL_FROM`, which must be an address in a domain verified in SES.

**Region.** `AWS_REGION` is required when the sender is set. The channel refuses to start without it, and refuses a sender that isn't an address.

**Alternative.** `smtpEmailChannel.ts` supports SMTP, including Amazon SES's SMTP interface. Choose either path; the code does not need both.

**IAM needed.** `ses:SendEmail` (or `ses:SendRawEmail`) for the sending identity.

**Suppression.** Addresses that SES reports as bouncing or complaining are suppressed and not sent to (`policyV2Notifications.ts`).

### 2.6 SNS: bounce and complaint notices (`PARMANA_POLICY_V2_SNS_EVENTS`)

**What it does.** SES publishes bounces and complaints to an SNS topic, which posts them to `policy-v2-bounces`. `policyV2Bounces.ts` verifies each SNS message and turns SES reports into neutral events.

**Switch.** Off unless `PARMANA_POLICY_V2_SNS_EVENTS=true`.

**Security.** The route is outside caller authentication, because SNS has no caller key. Each message must pass verification, so an unverified message is rejected.

**Setup needed.** An SNS topic subscribed to the endpoint, and an SES configuration set that publishes bounces and complaints to that topic.

### 2.7 Health checks (`doctor`, `doctor-online`)

- `Doctor.ts` checks offline: that `AWS_REGION` is set when `KEY_PROVIDER=aws-kms` or `PARMANA_SECRETS_PROVIDER=aws-secrets-manager`, and whether `AWS_ROLE_ARN` is set.
- `doctor-online.ts` checks the live key: that the KMS key exists and can be used, and that credentials work.

Run them before a deployment. Their messages name the setting to check and never print secret values.

### 2.8 Manual key verification (`verify-kms-signing.ts`)

A one-off script. It uses the standard AWS credential chain, so `AWS_ROLE_ARN` must not be set on a laptop, because the OIDC token exists only on Vercel. It is the safe way to confirm the key before turning on `KEY_PROVIDER=aws-kms`.

---

## 3. Settings that control AWS use

| Variable | Set to | Effect |
|---|---|---|
| `KEY_PROVIDER` | `aws-kms` | Signing goes to KMS. Default is `local` |
| `AWS_REGION` | e.g. `ap-south-1` | Region for KMS, Secrets Manager and SES. Must match the resources |
| `AWS_ROLE_ARN` | Role ARN | Short-lived credentials from Vercel OIDC. Leave unset locally |
| `PARMANA_SECRETS_PROVIDER` | `aws-secrets-manager` | Reads secrets from Secrets Manager |
| `PARMANA_KEY_MATERIAL_SECRET` | Secret name or ARN | Loads gateway key material from Secrets Manager |
| `PARMANA_KEY_MATERIAL_JSON` | JSON | Gateway keys inline (no AWS call) |
| `PARMANA_KEY_DIR` | Writable directory | Where key files are written |
| `PARMANA_POLICY_V2_EMAIL_FROM` | Verified SES address | Turns on SES email |
| `PARMANA_POLICY_V2_SNS_EVENTS` | `true` | Turns on the SNS bounce and complaint route |
| `CRYPTO_MODE` | `single` with KMS | Hybrid mode is refused with KMS |

---

## 4. What runs where

| Environment | Authentication | KMS | Secrets Manager | SES |
|---|---|---|---|---|
| Production (Vercel `parmana-api-real`) | OIDC role via `AWS_ROLE_ARN` | Yes, if `KEY_PROVIDER=aws-kms` | If `PARMANA_SECRETS_PROVIDER` is set | If the email settings are set |
| Local development | Standard AWS profile | Optional, with `verify-kms-signing` | Optional | Optional |
| CI | None | No, `KEY_PROVIDER=local` | No | No |
| Outage drill | Fake credentials to a dead endpoint | No | No | No |
| `dip-api` (ECS, us-east-1) | Task execution role | Not known from the repo | Yes (`dip/prod/*`) | Not known from the repo |

The `dip-api` row comes from the AWS account, not the repo, so it may not be part of Parmana at all. The owner should confirm.

---

## 5. Failure behaviour

| Failure | What happens | Action |
|---|---|---|
| KMS key missing or not allowed | Server refuses to start, naming the key id | Check `AWS_REGION`, `AWS_ROLE_ARN`, key existence and the role's permissions |
| Secrets Manager `AccessDenied` | Startup fails for the secret concerned | Add the secret's ARN to the role's `GetSecretValue` permission |
| SES send fails | The alert is not delivered; the error is logged | Check the sender is verified and the region is correct |
| SNS message not verified | Message rejected | Check the SNS topic and subscription, and any tampering |
| `AWS_REGION` missing | Startup fails with a clear message | Set it to the region of the resource |

Parmana never falls back to a weaker key when KMS fails. That is deliberate: a fallback would let signatures change trust domain without anyone noticing.

---

## 6. Keeping this current

- When a new AWS call is added, update section 1 and section 2 in the same change.
- When a new `KEY_PROVIDER` or secrets provider is implemented, update section 3 and the failure table.
- Re-run the greps in section 7 before each release to catch new AWS calls.

---

## 7. How this map was built

Read-only searches over the repository:

```bash
grep -rn "@aws-sdk" packages/*/src packages/*/package.json
grep -rn "AWS_REGION\|AWS_ROLE_ARN\|KEY_PROVIDER\|PARMANA_SECRETS_PROVIDER" packages/*/src scripts
```

The searches covered production code, package manifests, scripts and the CI workflow. They excluded documentation, tests and examples, which are listed in the companion documents where relevant.

---

## 8. Open questions

1. Is `PARMANA_SECRETS_PROVIDER=aws-secrets-manager` set in production, or is key material given inline?
2. Is `KEY_PROVIDER=aws-kms` set in production? The production docs say yes.
3. Are SES and the SNS bounce route switched on in production?
4. What is the `dip-api` workload, and does it call any of the code above?
