# Doctor: the configuration and connection check for parmana-core

This is the single reference for the doctor. It covers what the doctor checks, how to run it on your machine and in CI, how to read and fix its results, how it is kept current, and what it has and has not been verified against.

The doctor reads the same settings the server reads, and reports every problem at once, with a fix for each. It never prints a secret value.

## Contents

1. [Quick start](#quick-start)
2. [The three stages](#the-three-stages)
3. [Running it](#running-it)
4. [Reading the output](#reading-the-output)
5. [Settings the doctor reads](#settings-the-doctor-reads)
6. [Stage 1: local checks](#stage-1-local-checks)
7. [Stage 2: production rules](#stage-2-production-rules---production)
8. [Stage 3: online checks](#stage-3-online-checks---online)
9. [Database TLS and the CA certificate](#database-tls-and-the-ca-certificate)
10. [Running in CI and on commits](#running-in-ci-and-on-commits)
11. [Common mistakes](#common-mistakes)
12. [Troubleshooting](#troubleshooting)
13. [What the doctor does not check](#what-the-doctor-does-not-check)
14. [Keeping it current](#keeping-it-current)
15. [Where everything lives](#where-everything-lives)
16. [Status and verification](#status-and-verification)

## Quick start

From the repository root, on your PC:

```powershell
npm run doctor:production
echo $LASTEXITCODE
```

`doctor:production` runs the production rules and the online checks in one command. Exit code `0` means no check failed. `1` means at least one did, and the output says which and how to fix it.

Before running it, make sure `NODE_ENV` is not set in your shell (see [Common mistakes](#common-mistakes)):

```powershell
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
```

## The three stages

The doctor is built in three stages. Each adds to the one before.

| Stage               | Adds                                                                                                                                                                           | Command                          | Network calls |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------- |
| 1. Local checks     | The settings for a local deployment: storage, keys, policy folder, API keys, trust profile, numeric settings, and typos                                                        | `npm run doctor`                 | No            |
| 2. Production rules | The refusals the server makes when `NODE_ENV=production`, and the production providers: AWS KMS keys, Postgres and Supabase storage, the kill switch, and the secrets provider | `npm run doctor -- --production` | No            |
| 3. Online checks    | The database query behind `GET /ready`, the tables the storage uses, the default KMS key, and the Supabase REST endpoint. Nothing is written                                   | `npm run doctor -- --online`     | Yes           |

Stages 2 and 3 combine: `npm run doctor:production` is `npm run doctor -- --production --online`.

## Running it

| You want to                                     | Command                          |
| ----------------------------------------------- | -------------------------------- |
| Check the local settings                        | `npm run doctor`                 |
| Check the production settings                   | `npm run doctor -- --production` |
| Check the database, KMS and Supabase too        | `npm run doctor -- --online`     |
| Do all of the above, before a production deploy | `npm run doctor:production`      |

The doctor reads `.env` from the directory you run it in. Run it from the repository root, not from a subfolder. The server itself searches upward for `.env`, so a subfolder run can miss settings the server would see. Set `PARMANA_SKIP_DOTENV=1` to skip the file. The tests do this.

Exit status:

- `0`: no check failed. Warnings may remain. Read them.
- `1`: at least one check failed. Do not start the server until it is fixed.

### Setting variables for one run only

Set a variable for the one command that needs it, and clear it afterwards:

```powershell
$env:NODE_ENV = "production"
node --env-file-if-exists=.env --import tsx scripts/doctor.ts --production --online
echo $LASTEXITCODE
Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue
```

`npm run doctor:production` does not need this, because it does not depend on `NODE_ENV`.

## Reading the output

Each line is `[LEVEL] name: message`. A `fix:` line follows where there is something to do.

- **PASS:** the setting is valid.
- **WARN:** the server runs, but the setting needs attention, or the check is not covered in this mode.
- **FAIL:** the server refuses to start, or refuses requests, until this is fixed.

The last line counts the failures and warnings.

Messages never print a secret. A database URL is described by its scheme and `sslmode` only. A key is described by its fingerprint, which is public. An API key entry is counted, not shown. The CA certificate text is never printed.

## Settings the doctor reads

Every setting the doctor reads, and what it does. Settings marked _service_ are read by the server too. Settings marked _doctor_ are only compared by the doctor.

| Setting                                                          | Read by | Required                                | Default             | Meaning                                                                                                            |
| ---------------------------------------------------------------- | ------- | --------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `PARMANA_STORAGE`                                                | service | no                                      | `memory`            | `memory`, `postgres` or `supabase`. Memory loses state on restart                                                  |
| `DATABASE_URL`                                                   | service | with postgres or supabase               | none                | The database. Holds a password: never print or share it                                                            |
| `PARMANA_DATABASE_CA_FILE`                                       | service | one CA setting, for TLS                 | unset               | Path to a PEM file holding the database's CA certificate. See [Database TLS](#database-tls-and-the-ca-certificate) |
| `PARMANA_DATABASE_CA`                                            | service | one CA setting, for TLS                 | unset               | The CA certificate text itself, with literal `\n` as line breaks. For hosts that take only environment variables   |
| `PARMANA_DB_SCHEMA`                                              | service | no                                      | default search path | A plain Postgres schema name, such as `parmana_sandbox`                                                            |
| `CRYPTO_MODE`                                                    | service | no                                      | `single`            | `single` or `hybrid`                                                                                               |
| `HASH_PROVIDER`                                                  | service | no                                      | `sha256`            | The hash algorithm                                                                                                 |
| `PRIMARY_SIGNATURE_PROVIDER`                                     | service | no                                      | `ed25519`           | `ed25519`, or `dilithium3` (also `ml-dsa-65`)                                                                      |
| `SECONDARY_SIGNATURE_PROVIDER`                                   | service | no                                      | unset               | The second signature in hybrid mode                                                                                |
| `HYBRID_SCHEMA_VERSION`                                          | service | no                                      | `2`                 | `2`, or `3` with `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`                                                              |
| `HYBRID_REQUIRED_FROM`                                           | service | no                                      | unset               | A UTC timestamp ending in `Z` after which hybrid signing is required                                               |
| `HYBRID_SIGNATURE_REQUIRED`                                      | service | no                                      | `false`             | `true` requires both signatures. Has effect only with `CRYPTO_MODE=hybrid`                                         |
| `KEY_PROVIDER`                                                   | service | no                                      | `local`             | `local` (key files) or `aws-kms`                                                                                   |
| `PARMANA_KEY_DIR`                                                | service | yes                                     | none                | The folder that holds the key files                                                                                |
| `PARMANA_KEY_MATERIAL_JSON`                                      | service | no                                      | unset               | Keys written at startup from an environment variable. A fallback for platforms without a secret mount              |
| `AWS_REGION`                                                     | service | with `aws-kms` or `aws-secrets-manager` | none                | The AWS region                                                                                                     |
| `AWS_ROLE_ARN`                                                   | service | no                                      | unset               | Role for short-lived KMS credentials                                                                               |
| `PARMANA_SECRETS_PROVIDER`                                       | service | no                                      | `env`               | `env` or `aws-secrets-manager`                                                                                     |
| `PARMANA_POLICY_DIR`                                             | service | yes                                     | none                | A folder that exists. Policies are held in parmana-core, and the folder is required to start                       |
| `PARMANA_API_KEYS`                                               | service | yes, unless auth is disabled            | none                | A JSON array of `{ "callerId", "keyHash" }` entries                                                                |
| `PARMANA_AUTH_DISABLED`                                          | service | no                                      | `false`             | `true` disables authentication. Refused in production                                                              |
| `PARMANA_SANDBOX`                                                | service | no                                      | unset               | Refused in production                                                                                              |
| `TRUST_PROFILE`                                                  | service | no                                      | `v1`                | The trust profile                                                                                                  |
| `KILL_SWITCH_ENABLED`                                            | service | no                                      | off                 | `true` makes the kill switch available (ADR-0017). Enabling it does not stop traffic by itself                     |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR`                        | service | with the kill switch on                 | none                | `true` or `false`. `true` needs a second operator to reset                                                         |
| `NODE_ENV`                                                       | service | no                                      | unset               | `production` enables the production refusals in the server                                                         |
| `PORT` and `RATE_LIMIT_*`, `EXECUTION_AUTHORIZATION_TTL_SECONDS` | service | no                                      | defaults            | Whole numbers of at least 1                                                                                        |
| `SUPABASE_URL`                                                   | service | with `supabase`                         | none                | The Supabase project URL                                                                                           |
| `PARMANA_CORE_URL`                                               | doctor  | for `--online`                          | unset               | Not read by the server. Used by the doctor only                                                                    |

Other `PARMANA_` names are read by the MCP server, the sandbox, or the tests. The doctor accepts them without a warning. Any other `PARMANA_` name is reported as a probable typo, with the closest real name.

## Stage 1: local checks

These run with `npm run doctor`, and make no network calls.

| Check                                                                                        | Fails when                                                                                              | Warns when                                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DATABASE_PROVIDER`                                                                          | It is set. The server no longer reads it                                                                | —                                                                                                                                                      |
| `PARMANA_STORAGE`                                                                            | The value is not memory, postgres or supabase                                                           | It is memory, outside the test environment (state is lost on restart). In the test environment, memory passes                                          |
| `DATABASE_URL` (postgres or supabase)                                                        | It is missing, or does not start with `postgres://` or `postgresql://`                                  | `sslmode` is not `require`, `verify-ca` or `verify-full`                                                                                               |
| `PARMANA_DATABASE_CA_FILE` / `PARMANA_DATABASE_CA`                                           | The file cannot be read, the value holds no certificate, the value holds a private key, or both are set | —                                                                                                                                                      |
| `CRYPTO_MODE`, `HASH_PROVIDER`, `PRIMARY_SIGNATURE_PROVIDER`, `SECONDARY_SIGNATURE_PROVIDER` | The value is not one the build implements                                                               | —                                                                                                                                                      |
| `KEY_PROVIDER`                                                                               | The value is not implemented                                                                            | `aws-kms` without `--production` (run with it to check)                                                                                                |
| `HYBRID_SCHEMA_VERSION`                                                                      | Not 2 or 3, or 3 without `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`                                           | —                                                                                                                                                      |
| `HYBRID_REQUIRED_FROM`                                                                       | Set, but not a UTC timestamp ending in `Z`                                                              | —                                                                                                                                                      |
| `HYBRID_SIGNATURE_REQUIRED`                                                                  | —                                                                                                       | It is `true` but `CRYPTO_MODE` is not `hybrid`                                                                                                         |
| `PARMANA_KEY_DIR`                                                                            | Not set                                                                                                 | —                                                                                                                                                      |
| `PARMANA_KEY_MATERIAL_JSON`                                                                  | Set, but not a JSON object. Its contents are never printed                                              | —                                                                                                                                                      |
| `default key pair`                                                                           | Neither the key files nor `PARMANA_KEY_MATERIAL_JSON` provide them                                      | The files are absent but will be written at startup from `PARMANA_KEY_MATERIAL_JSON`. With `CRYPTO_MODE=hybrid`, the hybrid pairs are not checked here |
| `default public key`                                                                         | The file cannot be read, holds a private key, or is not a PEM public key                                | —                                                                                                                                                      |
| `PARMANA_POLICY_DIR`                                                                         | Not set, or the folder does not exist                                                                   | —                                                                                                                                                      |
| `PARMANA_AUTH_DISABLED`                                                                      | —                                                                                                       | It is `true`. Acceptable only on a local machine                                                                                                       |
| `PARMANA_API_KEYS`                                                                           | Malformed JSON, or no keys while authentication is enabled                                              | —                                                                                                                                                      |
| `TRUST_PROFILE`                                                                              | Not `v1`                                                                                                | —                                                                                                                                                      |
| `PORT`, `EXECUTION_AUTHORIZATION_TTL_SECONDS`, `RATE_LIMIT_*`                                | Not a whole number of at least 1                                                                        | —                                                                                                                                                      |
| Unknown `PARMANA_` name                                                                      | —                                                                                                       | The name is not read by any component. The closest real name is suggested                                                                              |

The server's own parsers produce these results, so a check that passes here passes at startup. The doctor does not reuse their error text, because some of it echoes the value it rejected.

## Stage 2: production rules (`--production`)

These apply only with `--production`. Each one mirrors a refusal the server makes, or a setting production needs.

| Check                                     | Fails when                                                               | Warns when                                                                        |
| ----------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                | —                                                                        | It is not `production` in this environment. The production deployment must set it |
| `production: PARMANA_AUTH_DISABLED`       | It is `true`. The server refuses authentication disabled in production   | —                                                                                 |
| `PARMANA_SANDBOX`                         | It is `true`. The sandbox is refused in production                       | —                                                                                 |
| `PARMANA_STORAGE`                         | It is memory. Nothing is durable                                         | —                                                                                 |
| `KILL_SWITCH_ENABLED`                     | It is set to a value other than `true` or `false`                        | It is off. Production sets it to `true` (ADR-0017)                                |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | The kill switch is on, and this is not `true` or `false`                 | —                                                                                 |
| `AWS_REGION`                              | `KEY_PROVIDER=aws-kms` and it is not set                                 | —                                                                                 |
| `KEY_PROVIDER`                            | `aws-kms` with `CRYPTO_MODE=hybrid`. The server refuses that in any mode | —                                                                                 |
| `PARMANA_SECRETS_PROVIDER`                | `aws-secrets-manager` without `AWS_REGION`                               | —                                                                                 |
| `production: PARMANA_KEY_MATERIAL_JSON`   | —                                                                        | It is set. Keys are then written from an environment variable at startup          |
| `production: KEY_PROVIDER`                | —                                                                        | It is `local`. Production is designed for `aws-kms`                               |

With `KEY_PROVIDER=aws-kms`, the default key stays in KMS, so the doctor does not look for local key files. It checks that the key folder is set. KMS reachability is checked with `--online`.

## Stage 3: online checks (`--online`)

`--online` makes network calls and reads the database. It writes nothing. Each check uses the probe the server uses.

| Check                       | What it does                                                                                                                                                  | Fails when                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`                  | Runs `SELECT 1`, the query behind `GET /ready`                                                                                                                | The query fails. The error code is shown, never the connection string                                                                          |
| `database tables`           | Checks that `consumed_nonces`, `consumed_approval_nonces`, `executions` and `caller_audit_events` exist, plus `execution_intents` when the server enforces it | A table is missing. Apply the migrations in `supabase/migrations`                                                                              |
| `KMS key` (`aws-kms`)       | Looks up the default key, as the server does at startup                                                                                                       | The key is not reachable, or AWS refuses the request. The error code is shown, never the ARN                                                   |
| `SUPABASE_URL` (`supabase`) | Requests the REST endpoint with no key                                                                                                                        | HTTP 500 or more, or the host cannot be reached. Any status below 500 counts as reachable, because a keyless request is expected to be refused |

If `DATABASE_URL` is not set, the database check warns. If the settings the KMS signer needs (`PARMANA_POLICY_DIR`, `PARMANA_KEY_DIR`) are missing, the KMS check warns and does not run, so a missing setting is not reported as an unreachable key.

The `execution_intents` table is checked only when the server enforces it. The rule is the one in `executionIntentsEnforced()`: it is relaxed under `NODE_ENV=test` or `development`, unless `EXECUTION_INTENTS_CHECK=true`.

## Database TLS and the CA certificate

Supabase requires TLS, and a Node process must be able to verify the database's certificate. Without a CA, the connection fails with `SELF_SIGNED_CERT_IN_CHAIN` or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

**The permanent setting:** give the server the database's root CA, using exactly one of:

- `PARMANA_DATABASE_CA_FILE`: the path to a PEM file. Use this on a PC.
- `PARMANA_DATABASE_CA`: the PEM text, with literal `\n` as line breaks. Use this where only environment variables are available, such as Vercel.

With either set, the pool verifies the certificate with `rejectUnauthorized: true`, and refuses any connection that does not verify. The SSL parameters in `DATABASE_URL` are removed, because otherwise `sslmode=disable` would send the connection unencrypted, and `sslmode=require` would ignore the CA.

Fails closed: a missing or unreadable file, text with no certificate, a private key in either setting, or both settings set, all stop the pool from starting.

**Getting the certificate:** in the Supabase dashboard, open the database settings for the project and download the root certificate under SSL Configuration.

**What not to do:** do not disable verification (`sslmode=no-verify`, or `rejectUnauthorized: false`). The connection stays encrypted, but anyone on the network path can impersonate the database.

**Setting it up:**

- On a PC, add one line to `.env`:
  ```powershell
  Add-Content .env "PARMANA_DATABASE_CA_FILE=C:\Users\$env:USERNAME\.parmana\supabase-ca.pem" -Encoding ascii
  ```
- On Vercel, make the value from the file and paste it as `PARMANA_DATABASE_CA`:
  ```powershell
  (Get-Content "$HOME\.parmana\supabase-ca.pem" -Raw) -replace "`r?`n", '\n' | Set-Clipboard
  ```
  Then remove any `NODE_EXTRA_CA_CERTS` workaround, and redeploy.

Tested against a real PostgreSQL 16 server with TLS on and a private CA: the correct CA connects with TLS on; a wrong CA is refused; `sslmode=disable` with the correct CA connects with TLS on; both settings set is refused; a missing file is refused.

## Running in CI and on commits

| Where                                     | What runs                                                                                                            | Needs production secrets |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Every commit (pre-commit hook)            | Secret scan, then `npm run preflight`: typecheck, lint, format, the full test suite, the build and the examples      | No                       |
| Every pull request (CI, `build-and-test`) | Build, `npm run doctor` against a fresh generated key pair and API key entry, then lint, typecheck, format and tests | No                       |
| Before a production deploy (manual)       | `npm run doctor:production` with the real `.env`                                                                     | Yes                      |

The CI doctor step generates an Ed25519 key pair and a random API key entry on each run. Nothing secret is committed, and the generated keys are deleted afterwards. The CI job sets `NODE_ENV=test`, so memory storage passes.

The doctor does not run on every commit. It reads each machine's settings, so one person's `.env` would block everyone's commits. The production check needs production settings and network access, so it stays a manual step.

## Common mistakes

- **Setting `NODE_ENV=production` in your shell.** npm then skips development dependencies, and `npm ci` and `npm run build` fail with "typescript not found". Clear it with `Remove-Item Env:NODE_ENV -ErrorAction SilentlyContinue`, or use `npm run doctor:production`.
- **Adding the same setting to `.env` more than once.** The last value wins, so the file looks right but can hide a stale value. Keep one line per setting.
- **Running from a subfolder.** The doctor reads `.env` from the current directory, so it can miss settings the server would see. Run it from the repository root.
- **Copying a key from parmana-core into your key file to make the key check pass.** Confirm which key is current with the operator, through a second channel, first.
- **Setting `PARMANA_AUTH_DISABLED=true` on a live database.** It is a local-only setting. Production refuses it.
- **Setting both `PARMANA_DATABASE_CA` and `PARMANA_DATABASE_CA_FILE`.** The server refuses to start. Keep one.
- **Expecting the kill switch to stop traffic when enabled.** It is available once enabled, and only refuses requests after someone trips it (ADR-0017).

## Troubleshooting

**Database errors (from `database`):**

- `SSL` or `SELF_SIGNED_CERT_IN_CHAIN`, or `UNABLE_TO_VERIFY_LEAF_SIGNATURE`: the database's certificate is not verified. Set `PARMANA_DATABASE_CA_FILE` or `PARMANA_DATABASE_CA` (see [Database TLS](#database-tls-and-the-ca-certificate)). Do not disable verification.
- `SSL` with `sslmode=require`: the database does not accept TLS. Enable TLS on the database, or, for a local database only, use `sslmode=disable` and accept the production warning.
- `28P01`: the password was rejected. Check the user and password in `DATABASE_URL`.
- `3D000`: the database named in `DATABASE_URL` does not exist.
- `ECONNREFUSED`: nothing is listening on the host and port in `DATABASE_URL`.

**KMS (from `KMS key`):**

- `CredentialsProviderError`: this machine has no AWS credentials that can reach the key. Set up credentials for the key's account.
- `AccessDeniedException`: the credentials lack permission on the key.
- A warning that `PARMANA_POLICY_DIR` or `PARMANA_KEY_DIR` must be set: fix the offline check first.

**Supabase (from `SUPABASE_URL`):**

- `ENOTFOUND`: the project host does not exist. Check the project URL in the Supabase dashboard.

**Other:**

- `dist/ is stale` before the tests: run `npm run build`, then the tests again.
- A setting you set is reported as a typo: check the spelling. The doctor suggests the real name.
- A setting you expected is reported missing: you are probably running from a subfolder.
- The output does not match this document: your `dist/` folder is old. Run `git pull`, `npm ci`, `npm run build`.
- `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` after the results: the build predates the exit-code fix. Rebuild.
- `Missing script: "doctor"`: you are on a branch without the doctor. Check out the branch that has it.

## What the doctor does not check

- Database grants. The table check confirms the tables exist, not that the database user can read or write them.
- Tables outside the list in Stage 3. Each storage path needs its own migrations.
- Whether the server starts. Use the server's own startup for that.
- Hybrid key pairs beyond the default pair. The server checks them at startup.
- Production settings beyond the list in Stage 2. The server enforces the rest at startup.
- Whether a policy in parmana-core allows an action. Check that in parmana-core.
- The clock. The connect service checks it against parmana-core; this doctor does not.

## Keeping it current

- **A new setting** read anywhere in the repository must be added to `KNOWN_PARMANA_SETTINGS` in `packages/shared/src/config/Doctor.ts`, or the doctor reports it as a typo. Add it to the settings table above.
- **A new check** goes in `packages/shared/src/config/Doctor.ts`, with a test in `packages/shared/tests/unit/doctor.test.ts`. Add its row to the stage table above.
- **A new online check** goes in `scripts/doctor-online.ts`, with a test in `tests/scripts/doctor-online.test.ts`.
- **The default key ID** is repeated in `Doctor.ts`, because the shared package cannot import `@parmana/crypto` without a cycle. If `DEFAULT_KEY_ID` in `@parmana/crypto` changes, change it there too.
- **The execution intents rule** is copied into `scripts/doctor-online.ts` from `executionIntentsEnforced()` in the API package. If the server rule changes, change the copy too.
- **Changing a rule** means changing the server as well, when the doctor mirrors a server refusal. The doctor should never disagree with the server.

## Where everything lives

| What                            | Where                                                  |
| ------------------------------- | ------------------------------------------------------ |
| Local, production and CA checks | `packages/shared/src/config/Doctor.ts`                 |
| Their tests                     | `packages/shared/tests/unit/doctor.test.ts`            |
| Online checks                   | `scripts/doctor-online.ts`                             |
| Their tests                     | `tests/scripts/doctor-online.test.ts`                  |
| Command-line entry point        | `scripts/doctor.ts`                                    |
| npm scripts                     | `doctor`, `doctor:production` in `package.json`        |
| Database pool, CA handling      | `packages/storage/src/postgres/PostgresPoolFactory.ts` |
| Its tests                       | `packages/storage/tests/unit/postgres-ca-file.test.ts` |
| CI doctor step                  | `.github/workflows/ci.yml`, job `build-and-test`       |
| Pre-commit hook                 | `scripts/git-hooks/pre-commit`                         |
| Install-script approvals        | `allowScripts` in `package.json`                       |
| Plan and design record          | `docs/runbooks/DOCTOR-PLAN.md`                         |
| The connect service's doctor    | Its own guide, `docs/DOCTOR.md`, in parmana-connect    |

The connect service (`parmana-connect`) has its own doctor, with its own settings. It checks the signed releases and the connector's key and clock. Its guide is separate because it is a separate service.

## Status and verification

| Piece                                             | Pull request      | Status                              |
| ------------------------------------------------- | ----------------- | ----------------------------------- |
| Stage 1: local checks                             | parmana-core #319 | Merged                              |
| Stage 2: production rules                         | parmana-core #321 | Merged                              |
| Stage 3: online checks                            | parmana-core #322 | Merged                              |
| CA certificate setting (file and text)            | parmana-core #323 | Merged                              |
| Install-script approvals (`re2`, `esbuild`)       | parmana-core #325 | Merged                              |
| One-step production command (`doctor:production`) | parmana-core #324 | Check GitHub for the current status |
| CI doctor step and memory-storage fix             | parmana-core #326 | Check GitHub for the current status |

Verified against real systems:

- **PostgreSQL 16, local with TLS:** the database and table checks; the TLS cases (no CA, correct CA, wrong CA, `sslmode=disable`, text setting, both settings, missing file); the wrong-password and missing-database errors.
- **Supabase, the project's pooler and REST endpoint:** the database checks, the migrations applied, and the REST endpoint answering HTTP 401.
- **AWS, with no credentials:** the real `CredentialsProviderError` from the KMS check.
- **A nonexistent Supabase host, and a real HTTPS host:** the `ENOTFOUND` error, and a pass.

Not yet verified:

- A real KMS key. The success path has only been tested with fakes. Needs AWS credentials for the key's account.
- A real Supabase project's REST API. The success path has only been tested with fakes.
- The database user's grants.

To verify these on your own system, run `npm run doctor:production` with your real `.env`, and check the `[PASS]` and `[FAIL]` lines for the KMS and database checks.
