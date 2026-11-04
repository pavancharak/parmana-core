# Doctor: configuration check for parmana-core

`npm run doctor` checks the configuration the server would start with, and prints every problem at once, with a fix for each one. It never prints a setting's value.

The doctor is built in three stages. Each stage adds to the one before, and each is opt-in except stage 1.

| Stage               | Adds                                                                                                                                                                           | Command                          | Makes network calls |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- | ------------------- |
| 1. Local checks     | The settings for a local deployment: storage, keys, policy folder, API keys, trust profile, numeric settings, and typos                                                        | `npm run doctor`                 | No                  |
| 2. Production rules | The refusals the server makes when `NODE_ENV=production`, and the production providers: AWS KMS keys, Postgres and Supabase storage, the kill switch, and the secrets provider | `npm run doctor -- --production` | No                  |
| 3. Online checks    | The database query behind `/ready`, the tables the storage uses, the default KMS key, and the Supabase REST endpoint. Nothing is written                                       | `npm run doctor -- --online`     | Yes                 |

Stages 2 and 3 combine: `npm run doctor -- --production --online`.

The section for each stage is below: "What each check does" (stage 1), "Production rules" (stage 2), and "Online checks" (stage 3). The status of each stage, and what has been verified, is in "Stage status".

## Running it

From the repository root:

```bash
npm run doctor                    # local rules
npm run doctor -- --production    # local rules and production rules
```

The script reads `.env` from the directory you run it in, then the environment. It is the same file the server reads when started from the repository root. The server itself searches upward for `.env`, so run doctor from the root, not from a subfolder. Set `PARMANA_SKIP_DOTENV=1` to skip the file, as the tests do.

Exit status:

- `0`: no check failed. Warnings may remain. Read them.
- `1`: at least one check failed. Do not start the server until it is fixed.

## Reading the output

Each line is `[LEVEL] name: message`, followed by a `fix:` line where there is something to do.

- **PASS:** the setting is valid.
- **WARN:** the server runs, but the setting needs attention, or the check is not yet covered.
- **FAIL:** the server refuses to start, or refuses requests, until this is fixed.

The last line counts failures and warnings.

## What each check does

| Check                                                                                        | Fails when                                                               | Warns when                                                                                                                                           |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_PROVIDER`                                                                          | It is set. The server no longer reads it                                 | —                                                                                                                                                    |
| `PARMANA_STORAGE`                                                                            | The value is not memory, postgres or supabase                            | It is memory (state is lost on restart). With `--production`, memory fails instead. For postgres or supabase, `DATABASE_URL` is checked too          |
| `CRYPTO_MODE`, `HASH_PROVIDER`, `PRIMARY_SIGNATURE_PROVIDER`, `SECONDARY_SIGNATURE_PROVIDER` | The value is not one the build implements                                | —                                                                                                                                                    |
| `KEY_PROVIDER`                                                                               | The value is not implemented (only `local` and `aws-kms` are)            | `aws-kms` without `--production` (run with `--production` to check it)                                                                               |
| `HYBRID_SCHEMA_VERSION`                                                                      | Not 2 or 3, or 3 without `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`            | —                                                                                                                                                    |
| `HYBRID_REQUIRED_FROM`                                                                       | Set, but not an ISO-8601 UTC timestamp ending in `Z`                     | —                                                                                                                                                    |
| `HYBRID_SIGNATURE_REQUIRED`                                                                  | —                                                                        | It is `true` but `CRYPTO_MODE` is not `hybrid`, so it has no effect                                                                                  |
| `PARMANA_KEY_DIR`                                                                            | Not set                                                                  | —                                                                                                                                                    |
| `PARMANA_KEY_MATERIAL_JSON`                                                                  | Set, but not a JSON object. Its contents are never printed               | —                                                                                                                                                    |
| `default key pair`                                                                           | Neither the key files nor `PARMANA_KEY_MATERIAL_JSON` provide them       | The files are absent but will be written from `PARMANA_KEY_MATERIAL_JSON` at startup. Or `CRYPTO_MODE=hybrid`: hybrid key pairs are not checked here |
| `default public key`                                                                         | The file cannot be read, holds a private key, or is not a PEM public key | —                                                                                                                                                    |
| `PARMANA_POLICY_DIR`                                                                         | Not set, or the folder does not exist                                    | The folder is empty. A request that names a policy then fails with PolicyNotFound                                                                    |
| `PARMANA_AUTH_DISABLED`                                                                      | —                                                                        | It is `true`. Acceptable only on a local machine                                                                                                     |
| `PARMANA_API_KEYS`                                                                           | Malformed JSON, or no keys while authentication is enabled               | —                                                                                                                                                    |
| `TRUST_PROFILE`                                                                              | Not `v1`                                                                 | —                                                                                                                                                    |
| `PORT`, `EXECUTION_AUTHORIZATION_TTL_SECONDS`, `RATE_LIMIT_*`                                | Not a whole number of at least 1                                         | —                                                                                                                                                    |
| Unknown `PARMANA_` name                                                                      | —                                                                        | The name is not read by any part of the repository. The closest real name is suggested                                                               |

The server's own parsers produce these results, so a check that passes here passes at startup. The doctor does not reuse their error text, because some of it echoes the value it rejected.

## Production rules (`--production`)

These apply only with `--production`. Each one mirrors a refusal the server makes, or a setting production needs.

| Check                                     | Fails when                                                                                               | Warns when                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                | —                                                                                                        | It is not `production`. The server's production refusals depend on it                                                     |
| `production: PARMANA_AUTH_DISABLED`       | It is `true`. The server refuses to run with authentication disabled in production                       | —                                                                                                                         |
| `PARMANA_SANDBOX`                         | It is `true`. The sandbox is refused in production                                                       | —                                                                                                                         |
| `KILL_SWITCH_ENABLED`                     | It is set to a value other than `true` or `false`                                                        | It is off. Production sets it to `true` (ADR-0017)                                                                        |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | The kill switch is on, and this is not stated as `true` or `false`                                       | —                                                                                                                         |
| `AWS_REGION`                              | `KEY_PROVIDER=aws-kms` and it is not set                                                                 | —                                                                                                                         |
| `KEY_PROVIDER`                            | `aws-kms` with `CRYPTO_MODE=hybrid`. The server refuses that combination in any mode                     | —                                                                                                                         |
| `DATABASE_URL`                            | Postgres or Supabase storage, and it is missing, or does not start with `postgres://` or `postgresql://` | It has no `sslmode`. Confirm the connection is encrypted                                                                  |
| `PARMANA_SECRETS_PROVIDER`                | `aws-secrets-manager` without `AWS_REGION`, or an unsupported value                                      | —                                                                                                                         |
| `production: PARMANA_KEY_MATERIAL_JSON`   | —                                                                                                        | It is set. Keys are then written at startup from an environment variable, a fallback for platforms without a secret mount |
| `production: KEY_PROVIDER`                | —                                                                                                        | It is `local`. Production is designed for `aws-kms`                                                                       |

With `KEY_PROVIDER=aws-kms`, the default key stays in KMS, so the doctor does not look for local key files. It checks that the key folder is set. KMS reachability is checked with `--online`.

The database URL is never printed. The doctor reads its scheme and whether `sslmode` is set, and nothing else.

## Fixing the common failures

- **`PARMANA_KEY_DIR` is not set, or the default key pair is missing.** Set `PARMANA_KEY_DIR` to a folder, then generate the pair into it:

  ```bash
  npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default
  ```

  The script writes `default.private.pem` and `default.public.pem` to `PARMANA_KEY_DIR`, or to `./keys` when it is unset. It does not overwrite existing files unless you add `--force`. Overwriting a key that is in use breaks every signature made with it, so do not add `--force` on an existing deployment.

- **`PARMANA_POLICY_DIR` does not exist.** Create the folder, and add the policy files. A missing folder stops the server. An empty one warns, and requests naming a policy fail.
- **`PARMANA_API_KEYS` is missing.** Either configure at least one entry, a JSON array of `{ "callerId", "keyHash" }`, or set `PARMANA_AUTH_DISABLED=true` for a local machine only.
- **A typo warning.** Rename the setting to the name the doctor suggests. The server ignores the misspelt name without any message.

## Online checks (`--online`)

`--online` makes network calls, and reads the database. It writes nothing. Each check uses the probe the server uses:

| Check                                       | What it does                                                                                                                                                                           | Fails when                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `database`                                  | Runs `SELECT 1`, the query behind `GET /ready`                                                                                                                                         | The query fails. The error code is shown, never the connection string                                                                                      |
| `database tables`                           | Checks that these tables exist: `consumed_nonces`, `consumed_approval_nonces`, `executions`, `caller_audit_events`, and `execution_intents` when the server enforces execution intents | Any table is missing. The fix is to apply the migrations in `supabase/migrations`                                                                          |
| `KMS key` (`KEY_PROVIDER=aws-kms`)          | Looks up the default key, as the server does at startup                                                                                                                                | The key is not reachable, or AWS refuses the request. The error code is shown, never the ARN                                                               |
| `SUPABASE_URL` (`PARMANA_STORAGE=supabase`) | Requests the REST endpoint with no key                                                                                                                                                 | The endpoint answers HTTP 500 or more, or cannot be reached. Any status below 500 counts as reachable, because a keyless request is expected to be refused |

`--online` needs `DATABASE_URL` for the database checks, and AWS credentials for the KMS check. Without `DATABASE_URL`, the database check warns rather than fails.

Run it with the production rules when you check a production configuration:

```bash
npm run doctor -- --production --online
```

The `execution_intents` table is checked only when the server enforces it. The rule is the one in `executionIntentsEnforced()`: it is relaxed under `NODE_ENV=test` or `development`, unless `EXECUTION_INTENTS_CHECK=true`.

## What the doctor does not check

- The database grants. The table check confirms the tables exist, not that the database user can read or write them.
- The tables outside the list above. Each storage path needs its own migrations, and the list covers the ones the storage code reads on every request.
- Whether the server starts. Use the server's own startup for that.
- The production rules beyond the list above. The server enforces its other production settings at startup.
- Whether the server starts. Use the server's own startup for that.
- Hybrid key pairs beyond the default pair. The server checks them at startup.

## Keeping it current

- **A new setting** read anywhere in the repository must be added to `KNOWN_PARMANA_SETTINGS` in `packages/shared/src/config/Doctor.ts`, or the doctor will report it as a typo.
- **A new check** goes in `packages/shared/src/config/Doctor.ts`, with a test in `packages/shared/tests/unit/doctor.test.ts`. Add its row to the table above.
- **The default key ID** is repeated in `Doctor.ts`, because the shared package cannot import `@parmana/crypto` without a cycle. If `DEFAULT_KEY_ID` in `@parmana/crypto` changes, change it there too.

## Handling the output safely

- Doctor prints names and messages, never values.
- Do not paste `.env` anywhere. It holds the API key hashes, the database URL, and any key material.
- Before reporting a problem, you can share the doctor output. It contains no secret values.

## Troubleshooting

- **`database` fails with error `SSL`.** The server does not accept TLS, so `sslmode=require` cannot connect. Either enable TLS on the database, or, for a local database only, use `sslmode=disable` and accept the production warning.
- **`database` fails with error `28P01`.** The password was rejected. Check the user and password in `DATABASE_URL`.
- **`database` fails with error `3D000`.** The database named in `DATABASE_URL` does not exist.
- **`database` fails with error `ECONNREFUSED`.** Nothing is listening on the host and port in `DATABASE_URL`.
- **`KMS key` fails with error `CredentialsProviderError`.** This machine has no AWS credentials that can reach the key. Set up credentials for the key's account, then check again.
- **`KMS key` warns that `PARMANA_POLICY_DIR` must be set.** The KMS check does not run until the settings the signer needs are present. Fix the offline check first.
- **`SUPABASE_URL` fails with error `ENOTFOUND`.** The project host does not exist. Check the project URL in the Supabase dashboard.

- **"dist/ is stale" before the tests.** Run `npm run build`, then the tests again. The tests import the packages from `dist/`.
- **Doctor reports settings you expected to be set.** You are probably running from a subfolder, so `.env` is not found. Run it from the repository root.
- **Doctor reports nothing for a setting you set in the shell.** Check the spelling. A misspelt name is reported as a typo, so look for that warning.

## Stage status

| Stage               | Pull request      | Status                | Verified against real systems                                                                                                                                                                                                                            |
| ------------------- | ----------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Local checks     | parmana-core #319 | Merged                | Run against a checkout with no `.env`, and against a test configuration                                                                                                                                                                                  |
| 2. Production rules | parmana-core #321 | Merged                | Run with `--production` on a checkout. Not run against a production deployment                                                                                                                                                                           |
| 3. Online checks    | parmana-core #322 | Open, awaiting review | Run against a real PostgreSQL 16 server (with and without migrations, with and without TLS, with a wrong password). Run against real AWS with no credentials, which gives the real error. Run against a nonexistent Supabase host, and a real HTTPS host |

Not yet verified for stage 3:

- A real KMS key. This needs AWS credentials for the key's account, so the success path has only been tested with fakes.
- A real Supabase project's REST API. The success path has only been tested with fakes.
- The database user's grants. The table check confirms that tables exist, not that the user can use them.

To verify these on your own system, run the online command against your real `.env`, as described in "Running it". Each check then prints PASS, WARN or FAIL, with the error code if it fails.
