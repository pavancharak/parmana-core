# Environment variable reference

For each variable: what it is, whether it is required and when, where the code uses it, what happens if it is missing, and what each value means.

Every claim is taken from the code, unless marked **(not tested)**. Read [ENV-FILE.md](ENV-FILE.md) first for how the file is loaded, and section 2 there for when each refusal happens. Two terms used below:

- **Module load**: when the Vercel function starts. A refusal here fails every request.
- **First request**: when the app is built, on the first request. A refusal here fails that request, and the message is in the Runtime Logs.

---

## Runtime

### NODE_ENV

- **What it is:** the environment. It turns safety gates on or off.
- **Required:** no. Defaults to `development` (`Config.ts`). Set it explicitly.
- **Used:** by most startup checks. The check is skipped when the value is `test`, and some gates are relaxed when it is `development`.
- **If missing:** the value is `development`. Gates relaxed in `development` are then relaxed on your server. For a real deployment this is wrong.
- **Values:**
  - `production`: every gate on. Use it for any real deployment.
  - `development`: relaxes some gates (for example `PARMANA_ALLOW_UNGOVERNED_POLICY` is honored, and `EXECUTION_INTENTS_CHECK` and `SIGNING_READINESS_CHECK` can be turned off).
  - `test`: skips most startup checks and uses in-memory stores. Never in production.
  - Any other string: treated as not `test` or `development`, so gates stay on.

### PORT

- **What it is:** the port the Node server listens on.
- **Required:** no. Defaults to `3000` (`Config.ts`).
- **Used:** by the Node entry (`server.ts`). The Vercel entry (`api/index.ts`) does not listen on a port, so `PORT` has no effect there.
- **If missing:** the server listens on `3000`.
- **Values:** a port number. Pick one that nothing else on the host uses.

### HOST

- **What it is:** the network address the Node server binds to.
- **Required:** no. Defaults to `0.0.0.0` (`server.ts`), which accepts connections on every interface.
- **Used:** by the Node entry only. Ignored on Vercel.
- **Values:**
  - `0.0.0.0`: every interface. Use it when other machines must reach the server.
  - `127.0.0.1`: only this machine. Use it for local testing.

### SHUTDOWN_TIMEOUT_MS

- **What it is:** how long the Node server waits for in-flight requests after a stop signal.
- **Required:** no. Defaults to `10000` (`server.ts`).
- **Used:** by the Node entry only, during shutdown.
- **If missing:** 10 seconds.
- **Values:** milliseconds. After this time the server exits even if requests are still running.

### LOG_LEVEL

- **What it is:** the minimum severity written to the logs.
- **Required:** no. Defaults to `info` (`Config.ts`).
- **Used:** by the logger on every log line.
- **Values:**
  - `debug`: everything, including detailed diagnostics.
  - `info`: normal operation.
  - `warn`: problems that did not stop a request.
  - `error`: failures only.
  - Any other value falls back to `info`, with no error (`Logger.ts`, tested by reading the code).

---

## Storage

### PARMANA_STORAGE

- **What it is:** where business records, trust records and policies are kept.
- **Required:** no. Defaults to `memory` (`ConfigValidation.ts`). A default of `memory` means nothing is kept after a restart.
- **Used:** at startup, to decide whether `DATABASE_URL` is required. Also decides where policies are read from (`application.ts`).
- **If missing:** `memory`. Records and policies are lost when the process restarts. Policies are read from `PARMANA_POLICY_DIR`.
- **Values:**
  - `memory`: in-memory only. Use it only for quick local tests.
  - `postgres`: a Postgres database at `DATABASE_URL`. Policies are read from the `policies` table.
  - `supabase`: the same as `postgres`, against a Supabase project. Production uses this.

### DATABASE_URL

- **What it is:** the connection string for the database.
- **Required:** yes, when `NODE_ENV` is not `test`, even with `PARMANA_STORAGE=memory`. The nonce store uses it. Required at module load when `PARMANA_STORAGE` is `supabase` or `postgres`.
- **Used:** the nonce stores (single-use protection for envelopes), the rate-limit store, and, with a database storage setting, business and trust records. The kill switch's comment says it is durable through `DATABASE_URL`.
- **If missing with `PARMANA_STORAGE=memory`:** the first request fails: "Durable NonceStore requires DATABASE_URL". Tested.
- **If missing with `PARMANA_STORAGE=supabase`:** the module fails to load: "Durable Storage ... requires DATABASE_URL". Tested.
- **If missing for rate limits only:** not refused. Rate limits apply per process, and a warning is logged (`createRateLimitStore.ts`).
- **Values:** `postgresql://user:password@host:port/database`. On serverless hosts, use the transaction pooler address. The password is a secret.

---

## Policies

### PARMANA_POLICY_DIR

- **What it is:** the folder that holds policy files, in the form `policies/<name>/<version>/policy.json`.
- **Required:** yes, always. Refused at module load if unset: "PARMANA_POLICY_DIR is not set" (`Config.ts`). Tested.
- **Used:** policies are read from here when `PARMANA_STORAGE=memory`. With a database storage setting, live policies come from the `policies` table instead. The setting is still required at startup.
- **Values:** a folder path. Local: `./policies`. On Vercel, `vercel.json` includes `policies/**` in the API function, so the folder is deployed.

### POLICY_CHANGE_CHECKERS

- **What it is:** a list of who may approve or reject changes to each policy.
- **Required:** only if you approve policy changes. Unset means nobody may approve.
- **Used:** when a policy change is approved or rejected (`pending-policy-changes.ts`). Parsed at the first request.
- **If missing:** every approval is refused with `403 CHECKER_NOT_IN_SCOPE`.
- **If not a JSON object** (for example `pavancharak`): the first request fails: "POLICY_CHANGE_CHECKERS is not valid JSON". Tested.
- **Values:** `{"<policy-name>":["<checker-callerId>", ...]}`. Each name must match a policy; each caller ID must match a `callerId` in `PARMANA_API_KEYS`.

### POLICY_EXECUTION_VERIFICATION_ENFORCED

- **What it is:** an override that matters only in one narrow case.
- **Required:** no.
- **Used:** only in `policyGovernanceRelaxed.ts`. Governance is relaxed only when all three hold: `NODE_ENV` is `test` or `development`, `PARMANA_ALLOW_UNGOVERNED_POLICY=true`, and this variable is not `true`.
- **If missing:** governance is enforced. In production it is always enforced.
- **Values:**
  - `true`: governance is enforced, even when relaxation would otherwise apply.
  - `false`, or unset: the relaxation rule applies, if the other two conditions also hold.
  - The older template comments that describe "detection" and "prevention" modes are not in the code.

### PARMANA_ALLOW_UNGOVERNED_POLICY

- **What it is:** lets unapproved policies run, in `test` or `development` only.
- **Required:** no.
- **Used:** in `policyGovernanceRelaxed.ts`.
- **If missing:** governance is enforced.
- **Values:** `true` relaxes governance in `test` or `development`. Any other value does not. Never set it in production.

---

## Callers

### PARMANA_API_KEYS

- **What it is:** the list of callers allowed to use the API, one entry per caller.
- **Required:** yes, unless `PARMANA_AUTH_DISABLED=true`.
- **Used:** on every request, to identify the caller.
- **If missing or empty:** the first request fails: "No caller authentication keys are configured". Tested.
- **If not a JSON array:** refused, with a message that names `PARMANA_API_KEYS`.
- **Values:** a one-line JSON array. Each entry: `callerId` (name), `keyHash` (SHA-256 of the raw key, 64 hex characters), and optionally `allowedCapabilities` (`["*"]` for all actions), `allowedPrincipalIds`, `allowedTenantIds`, `credentialHolderType` (`USER`, `ROLE`, `SERVICE`, `ORGANIZATION`), and `stepUpPublicKey` (required for a `USER` checker).

### PARMANA_AUTH_DISABLED

- **What it is:** turns caller authentication off.
- **Required:** no.
- **Used:** at startup, to decide whether `PARMANA_API_KEYS` is required.
- **If missing:** authentication is on.
- **Values:** only the exact string `true` turns it on. `GET /ready` reports `authDisabled: true`. Never set it in production.

---

## Keys and signing

### PARMANA_KEY_DIR

- **What it is:** the folder for key files.
- **Required:** yes, always (except in `test`). Refused at module load if unset: "PARMANA_KEY_DIR is not set" (`assertSigningKeyMaterialConfigured.ts`). Tested.
- **Used:** the gateway key is read from here. Under `KEY_PROVIDER=local`, the default key is too.
- **Values:** a writable folder. Local: `./keys`. On Vercel: `/tmp/parmana-keys` (the only writable folder).

### PARMANA_KEY_MATERIAL_JSON

- **What it is:** the key pair, in one line of JSON, for when files cannot be mounted.
- **Required:** only when the key files are not already in `PARMANA_KEY_DIR`.
- **Used:** at module load. Each key is written to `PARMANA_KEY_DIR` only if its file does not already exist.
- **If missing and no key files:** the gateway is created on the first request, and it fails because the files are absent (`createGatewayKeyPair.ts`, from code reading; not tested).
- **Values:** `{"gateway":{"privateKeyPem":"...","publicKeyPem":"..."}}`. The top level is keyed by key ID. Wrap the value in single quotes.

### PARMANA_GATEWAY_KEY_ID

- **What it is:** the name of the gateway key.
- **Required:** no. Defaults to `gateway` (`createGatewayKeyPair.ts`).
- **Used:** to find the gateway key files and entries.
- **Values:** the key ID. Production uses `gateway`. It must match the key in `PARMANA_KEY_MATERIAL_JSON` or the file names in `PARMANA_KEY_DIR`.

### KEY_PROVIDER

- **What it is:** where the default signing key is kept.
- **Required:** no. Defaults to `local` (`ConfigValidation.ts`).
- **Used:** at module load, to decide which key checks apply.
- **Values:**
  - `local`: the default key is a file in `PARMANA_KEY_DIR`, and its files are checked at module load. The gateway key is read on the first request.
  - `aws-kms`: the default key is in AWS KMS. The local-file check for the default key is skipped. The gateway is still local.
  - `azure-key-vault`, `gcp-kms`, `hsm`: refused on the first request, "is not implemented" (`SignerBootstrap.ts`). Tested.

### AWS_REGION

- **What it is:** the AWS region for KMS and the secrets manager.
- **Required:** when `KEY_PROVIDER=aws-kms`. Used by `KmsSigner.ts` and `AwsSecretsManagerProvider.ts`.
- **If missing with `aws-kms`:** the KMS calls cannot be made, and signing fails on the first request. From code reading; not tested here, because the sandbox has no AWS credentials.
- **Values:** an AWS region name, for example `ap-south-1`.

### AWS_ROLE_ARN

- **What it is:** the IAM role the server assumes to call AWS.
- **Required:** no in the code. It is set in production.
- **Used:** `KmsSigner.ts` and `AwsSecretsManagerProvider.ts`. When set, the server exchanges its Vercel OIDC token for credentials for this role. When unset, no role is assumed.
- **Values:** `arn:aws:iam::<account-id>:role/<role-name>`.

---

## Crypto

### CRYPTO_MODE

- **What it is:** how many signatures each record carries.
- **Required:** no. Defaults to `single` (`ConfigValidation.ts`).
- **Used:** read into config (`Config.ts`). `hybrid` changes the record format, so the signing code path depends on it.
- **Values:**
  - `single`: one signature, by the primary provider. Production.
  - `hybrid`: two signatures, by the primary and the secondary. Needs a key pair for each. Refused with `KEY_PROVIDER=aws-kms`.
  - `pq`: reserved. No production code reads it.

### PRIMARY_SIGNATURE_PROVIDER

- **What it is:** the algorithm that signs records.
- **Required:** no. Defaults to `ed25519`.
- **Used:** when the crypto builder starts (`CryptoBootstrap.ts`), at the first request.
- **Values:**
  - `ed25519`: the Ed25519 signer. Production.
  - `dilithium3`: a post-quantum signer, registered in the code.
  - `ecdsa-p256`, `dilithium5`, `sphincs-plus`: in the enum but not registered. Fail with "Unknown signature provider" on the first request. Tested with `ecdsa-p256`.

### SECONDARY_SIGNATURE_PROVIDER

- **What it is:** the second signer, used only in `hybrid` mode.
- **Required:** only with `CRYPTO_MODE=hybrid`.
- **Used:** in `hybrid` mode only.
- **Values:** the same two registered values as the primary. Use a different algorithm from the primary.

### HASH_PROVIDER

- **What it is:** the hash function for records.
- **Required:** no. Defaults to `sha256`.
- **Used:** when the crypto builder starts, at the first request.
- **Values:**
  - `sha256`: the only registered hash. Production.
  - `sha3-512` and `blake3`: in the enum but not registered. Fail with "Unknown hash provider" on the first request. Tested with `blake3`.
- **Warning:** changing the hash changes every new record's hash.

### TRUST_PROFILE

- **What it is:** the version of the trust-record rules.
- **Required:** no. Defaults to `v1`.
- **Used:** read into config (`Config.ts`).
- **Values:** `v1`, the only value in the code.

### RECEIPT_VERSION

- **What it is:** the version of the receipt format.
- **Required:** no. Defaults to `"1"`.
- **Used:** read into config (`Config.ts`).
- **Values:** `1`, the default.

### EXECUTION_AUTHORIZATION_TTL_SECONDS

- **What it is:** how long an execution authorization stays valid.
- **Required:** no. Defaults to `120` (`Config.ts`).
- **Used:** read into config (`Config.ts`).
- **Values:** whole seconds. A longer value gives callers more time to use an authorization, and a larger window for misuse.

---

## Limits and switches

### RATE_LIMIT_EXECUTE_PER_MINUTE

- **What it is:** how many `POST /execute` calls one caller may make per minute.
- **Required:** no. Defaults to `30` (`Config.ts`).
- **Used:** on every execute request.
- **Values:** a whole number. Without `DATABASE_URL` the limit applies per process, not across instances.

### RATE_LIMIT_HEALTH_PER_MINUTE

- **What it is:** the same limit for the health and readiness endpoints.
- **Required:** no. Defaults to `300` (`Config.ts`).
- **Values:** a whole number.

### KILL_SWITCH_ENABLED

- **What it is:** the switch that stops all actions at once.
- **Required:** no. Off by default (`createKillSwitch.ts`).
- **Used:** on every request.
- **If missing:** the switch is off.
- **Values:** `true` turns it on. Any other value, or unset, leaves it off. A value that is neither `true` nor `false`, for example `yes`, is refused on the first request (`createKillSwitch.ts`, tested with the reset variable).

### KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR

- **What it is:** whether resetting the kill switch needs a second operator.
- **Required:** yes, when `KILL_SWITCH_ENABLED=true`. Refused on the first request if not exactly `true` or `false` (`createKillSwitch.ts`, tested).
- **Values:**
  - `true`: a second operator must approve a reset. Production.
  - `false`: one operator can reset.

### EXECUTION_INTENTS_CHECK

- **What it is:** an override that can turn off the execution-intent check.
- **Required:** no.
- **Used:** only in `createExecutionIntents.ts`. The check can be turned off only when `NODE_ENV` is `test` or `development` and this is not `true`.
- **In production:** the check is always on, and this variable has no effect.

### SIGNING_READINESS_CHECK

- **What it is:** an override for the signing check that runs before each release.
- **Required:** no.
- **Used:** only in `createSigningReadiness.ts`. The check can be turned off only in `test` or `development`, when this is not `true`.
- **In production:** the check is always on, and this variable has no effect.

---

## Optional connectors

A connector is registered only when its settings are present. An unset connector does not stop the server. The CI log shows the messages, for example `paytm_connector_unavailable: PAYTM_CONNECTOR_URL / PAYTM_CONNECTOR_SHARED_SECRET are not configured`.

### PAYTM_CONNECTOR_URL and PAYTM_CONNECTOR_SHARED_SECRET

- **Required:** both or neither. Setting one alone is refused at module load: "Partial Paytm connector configuration detected".
- **Used:** to call the Paytm connector service.
- **Values:** the URL must start with `https://` in production. The secret is read from the environment and never printed.

### PAYTM_CONNECTOR_TIMEOUT_MS

- **Required:** no.
- **Used:** the timeout for Paytm calls.
- **Values:** a positive number of milliseconds. Zero, negative or non-numeric values are refused at module load.

### HUBSPOT_PRIVATE_APP_TOKEN and HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT

- **HUBSPOT_PRIVATE_APP_TOKEN:** unset means the HubSpot connector is not registered.
- **HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT:** an ISO 8601 date. When the token is older than the expected rotation, the server logs a warning (`warnIfHubSpotTokenStale.ts`). Not required.

### GITHUB_APP_ID, GITHUB_INSTALLATION_ID and GITHUB_APP_PRIVATE_KEY

- **Required:** all three, or the GitHub connector is not registered (`createGitHubCredentialProvider.ts`).
- **GITHUB_APP_PRIVATE_KEY:** the app's PEM private key as text. It is passed unchanged to `crypto.sign`, so base64 text is refused. Use the PEM with `\n` line breaks, in double quotes.

### SLACK_BOT_TOKEN

- **Required:** no. Unset means the Slack connector is not registered. The CI log shows `slack_connector_unavailable: SLACK_BOT_TOKEN is not configured`.

---

## Not read by the API server

These names may appear in a development file. The API server does not read them.

| Name                                                                                                              | Where it is read                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_TEST_KEY_ID`, `RAZORPAY_TEST_KEY_SECRET`, `RAZORPAY_BASE_URL` | The Razorpay demo in `examples/razorpay-refund/`                                                                                 |
| `KMS_REGION`, `KMS_KEY_ALIAS`                                                                                     | Nothing in the repository. Use `AWS_REGION` and the key settings in the KMS code                                                 |
| `ALLOW_LIVE_SUPABASE`, `ALLOW_LIVE_RAZORPAY`, `ALLOW_LIVE_HUBSPOT`                                                | Scripts, to stop a test script from touching a live system                                                                       |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`                                                  | Scripts only (`scripts/generate-fly-secrets.mjs`, `scripts/policy-approval-log.ts`, `scripts/verify-policy-changes-approved.ts`) |
| `TEST_*`                                                                                                          | Tests only                                                                                                                       |

---

## Never set in production

| Name                                   | Why                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PARMANA_AUTH_DISABLED=true`           | Turns off caller authentication                                                                              |
| `NODE_ENV=test` or `development`       | Turns off safety gates                                                                                       |
| `PARMANA_ALLOW_UNGOVERNED_POLICY=true` | Lets unapproved policies run (only honored in `test` or `development`)                                       |
| `DATABASE_PROVIDER` (any value)        | Retired. Refused at module load: "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead" (tested) |

---

## What was tested and what was not

- **Tested by running `api/index.ts`** with fake values, one setting changed at a time: the module-load and first-request refusals above marked "Tested".
- **Tested by reading the code:** every default and value list above.
- **Not tested:** a deployment on Vercel with real secrets; KMS calls (no AWS credentials in the sandbox); the Node entry (`server.ts`); a database connection (the sandbox has none).
