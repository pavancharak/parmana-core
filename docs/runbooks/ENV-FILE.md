# Creating the `.env` file

How to create `.env` for local development, which settings are required, the values each setting accepts, and what the production values mean. Every claim here was checked against the code. Where a claim could not be checked, the section says so.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

---

## 1. Rules for the file

**Where it is read.** Three places load it, and they differ:

| Loader | Reads | Turned off by `PARMANA_SKIP_DOTENV=1`? |
|---|---|---|
| `packages/api/src/server.ts` (`import "dotenv/config"`) | `.env` in the working directory | **No.** It always reads it |
| `packages/api/src/application.ts` | `../../.env`, relative to the working directory | Yes |
| `packages/shared/src/config/Config.ts` | The first `.env` found, searching upward from the working directory. Loaded once, on the first config read | Yes |

So for a local server started from the repository root, `server.ts` reads `./.env`. The test suite sets `PARMANA_SKIP_DOTENV=1` so a local `.env` cannot change test results. Because `server.ts` ignores that variable, the server still reads `.env` even when it is set.

**Format.** Each line is `NAME=value`, with no spaces around `=`. The loader is `dotenv` 18.0.8. We tested it on these cases:

| Line | Value the server reads |
|---|---|
| `A=foo # comment` | `foo`. A space then `#` starts a comment |
| `D=abc#def` | `abc`. A `#` with no space before it starts a comment |
| `B='{"x":"y#z"}'` | `{"x":"y#z"}`. Single quotes keep everything |
| `C={"x":"y"}` | `{"x":"y"}`. Works unquoted, but quote it anyway |
| `E=  spaced value  ` | `spaced value`. Surrounding spaces are trimmed |
| `F="multi\nline"` | A real newline. Double quotes expand `\n` |
| `G=` | An empty string |

**Rules that follow from the test:**

1. Put comments on their own lines, starting with `#`.
2. Wrap any value that contains `#`, JSON, or a PEM key in single quotes.
3. Use double quotes only when you need `\n` turned into a line break, which is how a PEM key can sit on one line.
4. Never commit `.env`. Check `.gitignore` before you create it.

**Create it** from the repository root:

```powershell
Copy-Item .env.example .env
notepad .env
```

Save the file as UTF-8. If your editor offers a choice, pick UTF-8 without a byte-order mark. I have not checked how each Windows editor saves by default.

---

## 2. What must be set at startup

Checks run before the port opens. A failed check stops the server, and the message names the variable. These are the checks for `NODE_ENV` other than `test`, which is every real environment.

| Setting | Required when | If missing or wrong |
|---|---|---|
| `PARMANA_POLICY_DIR` | Always | Refuses to start: "PARMANA_POLICY_DIR is not set" (`Config.ts`) |
| `PARMANA_API_KEYS` | Unless `PARMANA_AUTH_DISABLED=true` | Refuses to start if empty or unset (`createCallerAuthenticator.ts`) |
| `PARMANA_KEY_DIR` | Always | Refuses to start: "PARMANA_KEY_DIR is not set" (`assertSigningKeyMaterialConfigured.ts`) |
| Gateway key pair | Always | Startup creates the execution gateway, which reads the gateway key. Missing files throw (`createGatewayKeyPair.ts`, called from `createExecutionGateway.ts`) |
| Default signing key pair | `KEY_PROVIDER=local` only | Refuses to start if `default.private.pem` or `default.public.pem` is missing from `PARMANA_KEY_DIR` |
| `DATABASE_URL` | When `NODE_ENV` is not `test` | The nonce store refuses to start without it (`createNonceStore.ts`, `assertDatabaseUrlConfigured`) |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | When `KILL_SWITCH_ENABLED=true` | Refuses to start unless set to exactly `true` or `false` (`createKillSwitch.ts`) |

**Gateway key files and `PARMANA_KEY_MATERIAL_JSON`.** `assertSigningKeyMaterialConfigured` first runs `materializeFromEnvIfConfigured`. That writes each key in `PARMANA_KEY_MATERIAL_JSON` to `PARMANA_KEY_DIR`, but only for files that do not already exist. An existing file wins over the variable.

**Under `KEY_PROVIDER=aws-kms`,** the default signing key lives in KMS, so the check for its local files is skipped. The gateway key is still local, so its files (or the variable) are still required.

**Under `KEY_PROVIDER=local`,** both the default key and the gateway key are read from `PARMANA_KEY_DIR`.

---

## 3. Settings by group

Each entry gives the allowed values, the default when unset, and what the setting does. A default marked "per docs" comes from `docs/site/llms-full.txt`, which documents it but whose code I did not check line by line.

### Runtime

**`NODE_ENV`**: `production`, `development`, `test`, or any other string.
- Default: `development` (`Config.ts`).
- `production` turns on the safety gates.
- `development` and `test` relax some gates. `test` also switches the stores to memory.

**`PORT`**: a port number. Default `3000` (per docs).

**`HOST`**: an address to bind to. Default `0.0.0.0` (`server.ts`). Use `127.0.0.1` to accept only local connections.

**`SHUTDOWN_TIMEOUT_MS`**: milliseconds. Default `10000` (`server.ts`). After a stop signal the server stops taking new connections and waits this long for in-flight requests.

**`LOG_LEVEL`**: `debug`, `info`, `warn`, `error`. Default `info` (`Config.ts`). Values are per docs; the Logger reads the level from config.

### Policies

**`PARMANA_POLICY_DIR`**: a folder containing `policies/<name>/<version>/policy.json`. Required (see section 2).
- Local: `./policies`, which is in the repository.
- Production: `vercel.json` includes `policies/**` in the API function, so the folder is deployed. The runtime path has not been tested live.

**`POLICY_CHANGE_CHECKERS`**: a JSON object keyed by policy name. Each value is a list of checker caller IDs.

```
POLICY_CHANGE_CHECKERS={"checker-wiring-check":["pavancharak"]}
```

- Unset or empty: no one can approve or reject a policy change. Approval fails with `CHECKER_NOT_IN_SCOPE`.
- Only the listed callers may approve changes to that policy.

**`POLICY_EXECUTION_VERIFICATION_ENFORCED`**: `true` or `false`.

This flag matters only in one case. Governance is relaxed only when all of these hold: `NODE_ENV` is `test` or `development`, `PARMANA_ALLOW_UNGOVERNED_POLICY=true`, and this flag is not `true` (`policyGovernanceRelaxed.ts`). In every other case, governance is enforced.
- In production, leave this unset. Governance is enforced regardless.
- The detection and prevention descriptions in older template comments are not in the code. Remove them from any template you keep.

### Callers

**`PARMANA_API_KEYS`**: a one-line JSON array. Each element is one caller. The parser is `parseApiKeys` in `ConfigValidation.ts`.

| Field | Required | Allowed values |
|---|---|---|
| `callerId` | Yes | A non-empty string |
| `keyHash` | Yes | 64 lowercase hex characters: the SHA-256 of the raw key |
| `allowedCapabilities` | No | An array of action names. `"*"` allows every action. Unset means none |
| `allowedPrincipalIds` | No | An array of names. Unset means the caller may only act as itself |
| `allowedTenantIds` | No | An array of names. Unset means none |
| `credentialHolderType` | No | `USER`, `ROLE`, `SERVICE`, `ORGANIZATION` (the `AuthorityType` enum). Only `USER` may approve policy changes |
| `stepUpPublicKey` | Required for a `USER` checker | A PEM Ed25519 public key |

A caller with `"allowedCapabilities": ["*"]` may use every action. A caller with no `allowedCapabilities` can use none.

Generate an entry without writing the raw key to disk:

```powershell
npx tsx scripts/generate-api-key.ts --caller-id <name> --credential-holder-type USER
```

The command prints the raw key once. Save it in your password manager, then put the printed JSON entry into the array.

**`PARMANA_AUTH_DISABLED`**: only the exact string `true` turns it on (per docs). Turns off caller authentication. `GET /ready` reports `authDisabled: true` (`ready.ts`) so monitoring can alert on it. Local development only.

### Storage

**`PARMANA_STORAGE`**: `memory`, `postgres`, `supabase`.
- Default: `memory` (`ConfigValidation.ts`). If you leave it unset, business and trust records are kept in memory and lost on restart.
- `postgres` and `supabase` both use `DATABASE_URL` (`isPostgresStorage`).
- Production uses `supabase`.

**`DATABASE_URL`**: `postgresql://user:password@host:port/database`.
- Required when `NODE_ENV` is not `test`, even with `memory` storage, because the nonce store uses it.
- On serverless hosts, use the transaction pooler string.
- The password is a secret. Store it in the password manager.

**`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`**: the server's runtime code does not read them. The runtime uses `DATABASE_URL` (`createNonceStore.ts`, `StorageFactory.ts`). Scripts name them: `scripts/generate-fly-secrets.mjs`, `scripts/policy-approval-log.ts`, `scripts/verify-policy-changes-approved.ts`. Don't set them on a production server.

### Keys and signing

**`KEY_PROVIDER`**: `local`, `aws-kms`, `azure-key-vault`, `gcp-kms`, `hsm` (the `KeyProviders` enum).
- Default: `local`.
- `local`: keys are files in `PARMANA_KEY_DIR`.
- `aws-kms`: the default signing key is in AWS KMS. Production uses this.
- `azure-key-vault`, `gcp-kms` and `hsm` are refused at startup. The code says "is not implemented" (`SignerBootstrap.ts`).

**`PARMANA_KEY_DIR`**: a writable folder. Required (section 2).
- Local: `./keys`.
- Vercel: `/tmp/parmana-keys`. Only `/tmp` is writable there.

**`PARMANA_KEY_MATERIAL_JSON`**: a one-line JSON object holding the gateway key pair.

```
PARMANA_KEY_MATERIAL_JSON={"gateway":{"privateKeyPem":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n","publicKeyPem":"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----\n"}}
```

- The top level is keyed by key ID. The gateway key's ID is `gateway`.
- Each entry needs both `privateKeyPem` and `publicKeyPem`.
- It is used where you cannot mount key files, such as Vercel.
- Keys are written only if the file does not already exist (section 2).
- Wrap the whole value in single quotes if it contains any `#`.

**`PARMANA_GATEWAY_KEY_ID`**: the ID of the gateway key. Production uses `gateway`.

**`AWS_REGION`**: an AWS region, for example `ap-south-1`. Read by the secrets provider and the KMS code (`AwsSecretsManagerProvider.ts`, `assertSigningKeyMaterialConfigured.ts`). Production sets it.

**`AWS_ROLE_ARN`**: `arn:aws:iam::<account-id>:role/<role-name>`. Optional in the code. When it is set, `AwsSecretsManagerProvider.ts` exchanges credentials for that role through Vercel's OIDC provider. When it is unset, no role is assumed. Production sets it.

**`CRYPTO_MODE`**: `single`, `hybrid`, `pq`. Default `single`.
- `hybrid` is refused with `KEY_PROVIDER=aws-kms` (`assertSigningKeyMaterialConfigured.ts`).
- `pq` is reserved, and no production code reads it today.
- Production uses `single`. Use `hybrid` only with a specific requirement; see the crypto notes in section 3 of this file.

**`PRIMARY_SIGNATURE_PROVIDER`**: the values the code accepts are `ed25519` and `dilithium3`. Production uses `ed25519`.
- `ecdsa-p256`, `dilithium5` and `sphincs-plus` are in the enum, but no provider is registered for them. Choosing one fails at startup with "Unknown signature provider" (`CryptoBootstrap.ts`, `SignatureRegistry.get`).

**`SECONDARY_SIGNATURE_PROVIDER`**: the same two values. Set only with `CRYPTO_MODE=hybrid`. Leave empty otherwise.

**`HASH_PROVIDER`**: the only value the code accepts is `sha256`. Default `sha256`.
- `sha3-512` and `blake3` are in the enum, but no provider is registered. Choosing one fails at startup with "Unknown hash provider" (`HashRegistry.get`).
- Changing the hash changes every new record's hash. Only `sha256` is available today.

### Trust and receipts

**`EXECUTION_AUTHORIZATION_TTL_SECONDS`**: whole seconds. Default `120` (`Config.ts`). How long an authorization is valid.

**`TRUST_PROFILE`**: `v1`. The only value in the code (`TrustProfiles`). Default `v1`.

**`RECEIPT_VERSION`**: default `"1"` (`Config.ts`).

### Rate limits

**`RATE_LIMIT_EXECUTE_PER_MINUTE`**: a whole number. Default `30` (`Config.ts`).

**`RATE_LIMIT_HEALTH_PER_MINUTE`**: a whole number. Default `300` (`Config.ts`).

### Kill switch

**`KILL_SWITCH_ENABLED`**: `true` turns it on. Any other value, or unset, leaves it off. A value that is neither `true` nor `false` is refused (`createKillSwitch.ts`).

**`KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR`**: `true` or `false`. Required when the switch is on. Production uses `true`.

The kill switch stores its state in the database, so it also needs `DATABASE_URL`.

### Optional connectors

Each connector is registered only when its settings are present. Otherwise nothing else fails.

- **Paytm**: `PAYTM_CONNECTOR_URL` and `PAYTM_CONNECTOR_SHARED_SECRET`. Set both or neither. The URL must start with `https://` in production. Details: `docs/runbooks/PAYTM-CONNECTOR.md`.
- **HubSpot**: `HUBSPOT_PRIVATE_APP_TOKEN`. `HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT` is an ISO 8601 date. The server logs a warning when the token is stale (`warnIfHubSpotTokenStale.ts`).
- **Razorpay**: `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. The demo endpoint refuses a live key. Details: `docs/runbooks/RAZORPAY-REFUND.md`.
- **GitHub App**: `GITHUB_APP_ID` and `GITHUB_INSTALLATION_ID` are numbers. `GITHUB_APP_PRIVATE_KEY` is the app's PEM private key as text, not base64. The value is passed unchanged to `crypto.sign` in `GitHubAppJwt.ts`, which needs a PEM key. Base64 text fails there. Use the PEM with `\n` for line breaks, in double quotes.

---

## 4. A local development file

```
NODE_ENV=development
HOST=127.0.0.1
PORT=3000
LOG_LEVEL=info

PARMANA_POLICY_DIR=./policies
PARMANA_KEY_DIR=./keys
PARMANA_GATEWAY_KEY_ID=gateway
KEY_PROVIDER=local

PARMANA_STORAGE=memory
DATABASE_URL='<your connection string>'

PARMANA_API_KEYS='<one-line JSON array>'
POLICY_CHANGE_CHECKERS={"checker-wiring-check":["<your checker callerId>"]}

CRYPTO_MODE=single
PRIMARY_SIGNATURE_PROVIDER=ed25519
HASH_PROVIDER=sha256
EXECUTION_AUTHORIZATION_TTL_SECONDS=120
RATE_LIMIT_EXECUTE_PER_MINUTE=30
RATE_LIMIT_HEALTH_PER_MINUTE=300
```

Local rules:

- `HOST=127.0.0.1` keeps the server reachable only from your machine.
- Generate local keys with `npm run generate:gateway-keys`. The command writes its files into `PARMANA_KEY_DIR`. Do not copy production key material into a local file.
- `PARMANA_AUTH_DISABLED=true` is for quick local tests only. Never leave it in a file you might deploy.

---

## 5. Production values

Production values go in Vercel's environment settings, not in a `.env` file. Vercel applies a change only to new deployments, so redeploy after each change ([PRODUCTION-DEPLOY-AND-ROLLBACK.md](PRODUCTION-DEPLOY-AND-ROLLBACK.md)).

| Variable | Value | Meaning |
|---|---|---|
| `NODE_ENV` | `production` | Safety gates on |
| `PARMANA_STORAGE` | `supabase` | Records kept in the database |
| `DATABASE_URL` | transaction pooler string | Connects to the database |
| `PARMANA_API_KEYS` | one-line JSON array | Who may call the API |
| `POLICY_CHANGE_CHECKERS` | JSON object by policy | Who may approve each policy |
| `PARMANA_POLICY_DIR` | `./policies` (confirm on Vercel) | Where policies are read |
| `PARMANA_KEY_DIR` | `/tmp/parmana-keys` | The writable folder on Vercel |
| `PARMANA_KEY_MATERIAL_JSON` | gateway key pair JSON | The gateway key |
| `PARMANA_GATEWAY_KEY_ID` | `gateway` | Which key is the gateway |
| `KEY_PROVIDER` | `aws-kms` | The default signing key is in KMS |
| `AWS_REGION` | `ap-south-1` | KMS region |
| `AWS_ROLE_ARN` | the signer role ARN | Role used for KMS |
| `KILL_SWITCH_ENABLED` | `true` | Kill switch on |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | `true` | A reset needs a second operator |
| `CRYPTO_MODE` | `single` | One signature per record |
| `PRIMARY_SIGNATURE_PROVIDER` | `ed25519` | Signature algorithm |
| `HASH_PROVIDER` | `sha256` | Hash algorithm |
| `LOG_LEVEL` | `info` | Normal logging |
| `RATE_LIMIT_EXECUTE_PER_MINUTE` | `30` | Calls per minute to execute |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | `300` | Calls per minute to health |

Never set in production: `PARMANA_AUTH_DISABLED`, `NODE_ENV=test`, `NODE_ENV=development`, `PARMANA_ALLOW_UNGOVERNED_POLICY`, `DATABASE_PROVIDER`, `SUPABASE_*`.
- `DATABASE_PROVIDER` is refused at startup: "DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead." (`ConfigValidation.ts`).

---

## 6. Checks

1. Each line is `NAME=value` with no spaces around `=`.
2. Values containing `#`, JSON or PEM are in single quotes.
3. Every setting in section 2 that applies to you is present.
4. Start the server and read the startup output for the components it lists.
5. `GET /ready` returns `200` with `"status":"READY"` and `"authDisabled":false`.
6. A request with no key returns `401`.

---

## 7. Common mistakes

| Symptom | Cause | Fix |
|---|---|---|
| "PARMANA_POLICY_DIR is not set" | Not set | Set it to the folder containing `policies/` |
| "No caller authentication keys are configured" | `PARMANA_API_KEYS` empty or unset | Set it to a valid one-line array |
| "PARMANA_KEY_DIR is not set" | Not set | Set it to a writable folder |
| Startup names the gateway key files | No gateway key from a file or `PARMANA_KEY_MATERIAL_JSON` | Provide the gateway key pair |
| "KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR must be..." | Kill switch on, value not `true` or `false` | Set it to `true` or `false` |
| Data gone after restart | `PARMANA_STORAGE` unset or `memory` | Set `PARMANA_STORAGE=supabase` |
| Approvals refused with `CHECKER_NOT_IN_SCOPE` | `POLICY_CHANGE_CHECKERS` unset, or the checker is not listed for that policy | Add the checker under the policy name |
| A value is cut short | A `#` in an unquoted value | Quote the value in single quotes |
| The server reads `.env` even with `PARMANA_SKIP_DOTENV=1` | `server.ts` ignores that variable | Remove `.env` from the folder, or rename it |

---

## 8. What was verified, and what was not

**Verified against the code:**
- The loaders and dotenv parsing (tested with the installed dotenv 18.0.8).
- Every startup refusal named in section 2.
- Defaults: `NODE_ENV`, `PARMANA_STORAGE`, `LOG_LEVEL`, `HOST`, `SHUTDOWN_TIMEOUT_MS`, the rate limits, `EXECUTION_AUTHORIZATION_TTL_SECONDS`, `RECEIPT_VERSION`.
- The allowed values of `KEY_PROVIDER`, `CRYPTO_MODE`, `PRIMARY_SIGNATURE_PROVIDER`, `HASH_PROVIDER`, `TRUST_PROFILE`, `credentialHolderType`.
- The registered algorithms, and the refusals for the others.
- The policy-enforcement rule.
- The GitHub key format.
- The `vercel.json` inclusion of `policies/**`.

**Not verified:**
- Startup on Vercel with these exact values. The code is verified; a live deployment is not.
- The `LOG_LEVEL` values beyond `info`. The docs list `debug`, `info`, `warn`, `error`; the Logger's accepted set was not traced line by line.
