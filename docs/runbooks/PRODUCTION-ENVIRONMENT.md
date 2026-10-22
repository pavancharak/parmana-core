# Production environment variables

The variables the production API reads, and the mistakes that cost us time. The full reference is `docs/site/deployment/environment-variables.mdx` (the table in `docs/site/llms-full.txt` is generated from it). This page covers what we use on Vercel (`parmana-api-real`) and what to check. Every name here is confirmed against the code; values are never written in this file.

---

## 1. Required for production

| Variable                    | Value                                                         | Why                                                                                                                                     | Confirmed in                                                              |
| --------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                  | Turns on every gate. `test` and `development` relax them.                                                                               | `packages/api/src/bootstrap/*`                                            |
| `PARMANA_STORAGE`           | `supabase`                                                    | **Must be set.** If unset, it defaults to `memory`, and business transactions and trust records are kept in memory and lost on restart. | `packages/shared/src/config/ConfigValidation.ts` (`parseStorageProvider`) |
| `DATABASE_URL`              | Postgres connection string (transaction pooler on serverless) | Required when `PARMANA_STORAGE` is `supabase` or `postgres`. Also used for the nonce stores and the readiness check.                    | `assertStorageConfigured.ts`, `createPolicyChangeStepUpNonceStore.ts`     |
| `PARMANA_API_KEYS`          | One-line JSON array of caller entries                         | The server refuses to start if it is empty or invalid.                                                                                  | `createCallerAuthenticator.ts`, `ConfigValidation.ts`                     |
| `PARMANA_POLICY_DIR`        | Directory containing `policies/<name>/<version>/policy.json`  | The process refuses to start without it.                                                                                                | `packages/api/README.md`                                                  |
| `PARMANA_KEY_DIR`           | Writable directory for key files                              | Vercel's filesystem is read-only except `/tmp`, so we use `/tmp/parmana-keys`.                                                          | `assertSigningKeyMaterialConfigured.ts`                                   |
| `PARMANA_KEY_MATERIAL_JSON` | `{"gateway":{"privateKeyPem":"...","publicKeyPem":"..."}}`    | Writes the gateway key files into `PARMANA_KEY_DIR` at startup, when no file is mounted.                                                | `assertSigningKeyMaterialConfigured.ts`                                   |
| `POLICY_CHANGE_CHECKERS`    | JSON object: policy name → caller IDs (see section 3)         | Without it, every approval is refused with `CHECKER_NOT_IN_SCOPE`.                                                                      | `policyChangeCheckers.ts`                                                 |

## 2. Set on Vercel for our deployment

| Variable       | Value               | Why                                                                                |
| -------------- | ------------------- | ---------------------------------------------------------------------------------- |
| `KEY_PROVIDER` | `aws-kms`           | Signing goes to AWS KMS. `local` is the default and reads key files from disk.     |
| `AWS_REGION`   | `ap-south-1`        | KMS region.                                                                        |
| `AWS_ROLE_ARN` | The signer role ARN | The role trusts only the production environment of the `parmana-api-real` project. |

## 3. `POLICY_CHANGE_CHECKERS`: format

A JSON **object**, keyed by policy name. Each value is an array of caller IDs:

```json
{ "checker-wiring-check": ["pavancharak"] }
```

Mistakes we or the template made:

- `pavancharak` on its own (not JSON) is refused at startup.
- An array instead of an object is refused.
- An empty array or an unset variable lists nobody, so every approval is refused.

## 4. Optional

| Variable                                                               | Notes                                                                                  |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `KILL_SWITCH_ENABLED`                                                  | `true` turns on the operator kill switch. Probe it with `POST /kill-switch/probes`.    |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR`                              | `true` requires a second operator to reset the kill switch.                            |
| `PAYTM_CONNECTOR_URL` and `PAYTM_CONNECTOR_SHARED_SECRET`              | Set both or neither. Setting only one stops startup.                                   |
| `HUBSPOT_PRIVATE_APP_TOKEN` and `HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT` | The rotated-at date (ISO 8601) lets the server warn when the token is stale.           |
| `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY`    | GitHub App credentials, if the GitHub connector is used.                               |
| `PARMANA_GATEWAY_ID`, `PARMANA_GATEWAY_KEY_ID`                         | Gateway identity. `PARMANA_GATEWAY_KEY_ID` defaults to `gateway` for our key material. |
| `LOG_LEVEL`                                                            | `debug`, `info`, `warn` or `error`. Defaults to `info`.                                |

## 5. Must never be set in production

| Variable or value                               | Why                                                                                                              |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `PARMANA_AUTH_DISABLED` (set to `true`)         | Accepts every request with no authentication. `GET /ready` reports `authDisabled` so monitoring can alert on it. |
| `NODE_ENV` set to `test` or `development`       | Turns off the durable stores, key checks and connector requirements.                                             |
| `PARMANA_ALLOW_UNGOVERNED_POLICY`               | Lets unapproved policies run. Honored only in `test` or `development`.                                           |
| `SUPABASE_URL` and other `SUPABASE_*` variables | The server does not read them. Only `DATABASE_URL` is used.                                                      |

## 6. Not read by this repository

- **`RESEND_API_KEY`.** No code in this repository reads it, so setting it does nothing for the API. It was set on `parmana-api-real` from earlier work. Keep it only if another service in that project uses it, and do not count it as a production requirement.

## 7. Corrections to the earlier starter template

The `production-values.txt` template we made earlier had these errors:

- It did not set `PARMANA_STORAGE=supabase`. Without it, storage defaults to memory.
- It set `POLICY_CHANGE_CHECKERS=pavancharak`. That is not valid; use the object form in section 3.
- It listed `RESEND_API_KEY` as required. This repository never reads it.

## 8. Checks

**Names only (never values):**

```powershell
vercel env ls production --cwd $link
```

Confirm `PARMANA_STORAGE` is present. If it isn't, add it and redeploy:

```powershell
"supabase" | vercel env add PARMANA_STORAGE production --cwd $link
vercel redeploy <current-production-url> --target production --cwd $link
```

**Behavior:** `GET /ready` should return `200` with `"status":"READY"` and `"authDisabled":false`. It runs `SELECT 1` against the database and checks that the `execution_intents` table exists.

**Not:** `GET /health` tells you the process is alive, not that it is configured.

## 9. Changing a value

1. Edit the value at the password manager or the source file.
2. `vercel env rm <NAME> production --yes --cwd $link`, then add it again with `--sensitive` for secrets.
3. Redeploy. Changes apply only to new deployments.
4. Check with `GET /ready`, then the approval flow (`docs/runbooks/POLICY-CHANGE-APPROVAL.md`).
