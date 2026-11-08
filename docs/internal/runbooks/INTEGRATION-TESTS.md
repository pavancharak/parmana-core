# Running the integration tests

Status as of 2026-11-08. Covers how the integration tests are gated, how to run them against a local PostgreSQL
database, what was run and what passed, and what is not yet covered.

## 1. Two kinds of test

- **Unit tests** need nothing outside the repository. `npm test` runs them, with the integration tests skipped where
  their settings are absent.
- **Integration tests** use real components: a PostgreSQL database, key files, and the crypto settings. Each one is
  gated, so it is skipped unless its settings are present.

## 2. The gates

| Setting                                                    | What it enables                               | Notes                                                                             |
| ---------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL`                                        | Tests that write to a test database           | Must differ from `DATABASE_URL`, or the test refuses to run                       |
| `DATABASE_URL`                                             | Suites that use the application's database    | Without `ALLOW_LIVE_SUPABASE=1`, these suites are skipped on purpose              |
| `ALLOW_LIVE_SUPABASE=1`                                    | Runs the suites gated on `DATABASE_URL`       | Only for a database you intend the suite to use. Do not set it against production |
| `TEST_DATABASE_IS_DISPOSABLE=1`                            | Allows destructive tests on a hosted database | Not needed for a local database                                                   |
| `PARMANA_STORAGE=postgres`                                 | Uses Postgres storage                         | Required by several suites                                                        |
| `PARMANA_KEY_DIR`                                          | Directory of key files                        | Set by `vitest.setup.ts` for the test run; see section 6                          |
| `CRYPTO_MODE`                                              | `single` or `hybrid`                          | `pq` is not implemented in this build (section 7)                                 |
| `KEY_PROVIDER=local`, `PRIMARY_SIGNATURE_PROVIDER=ed25519` | Local key provider and primary algorithm      | Set in the test environment                                                       |

`CRYPTO_MODE=classical` is not a valid value. The valid values are `single`, `hybrid` and `pq`.

## 3. Preparing a local database

Use PostgreSQL 16, with the migrations applied from the repository's bundle.

```bash
# Create the databases (names are examples)
psql -h <host> -p <port> -U <user> -c "create database parmana_test;"
psql -h <host> -p <port> -U <user> -c "create database parmana_app;"

# Apply every migration to each database
psql -h <host> -p <port> -U <user> -d parmana_test -f scripts/apply-all-migrations.sql
psql -h <host> -p <port> -U <user> -d parmana_app -f scripts/apply-all-migrations.sql
```

On a plain PostgreSQL server, the bundle reports `role "anon" does not exist` for two Supabase grants. Those errors
are harmless for local testing. On Supabase, the bundle runs without them.

Do not point these settings at production or at a shared Supabase project.

## 4. Running the tests

```bash
export PATH=...        # Node 24, as in CONTRIBUTING.md
export TEST_DATABASE_URL="postgresql://<user>@<host>:<port>/parmana_test"
export DATABASE_URL="postgresql://<user>@<host>:<port>/parmana_app"
export ALLOW_LIVE_SUPABASE=1
export PARMANA_STORAGE=postgres
export PARMANA_KEY_DIR=<a directory with the key files, see section 6>
export KEY_PROVIDER=local
export PRIMARY_SIGNATURE_PROVIDER=ed25519
export CRYPTO_MODE=single

npx vitest run integration
```

On PowerShell, set each variable with `$env:NAME = "value"`.

To run one file:

```bash
npx vitest run packages/storage/tests/integration/supabase-inbound-check-consumption.integration.test.ts
```

## 5. What was run, and the results

| Run                                          | Settings                                                                  | Result                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Integration tests, database tests only       | `TEST_DATABASE_URL` set, `DATABASE_URL` unset                             | 41 files passed, 19 skipped (314 tests passed, 67 skipped)   |
| Integration tests, all gates open, `single`  | `DATABASE_URL`, `ALLOW_LIVE_SUPABASE=1`, `CRYPTO_MODE=single`             | **60 files, 381 tests: all passed. None skipped**            |
| Integration tests, `hybrid`                  | As above, `CRYPTO_MODE=hybrid`, `SECONDARY_SIGNATURE_PROVIDER=dilithium3` | 28 files failed, 56 tests failed (325 passed). See section 7 |
| Integration tests, `pq`                      | As above, `CRYPTO_MODE=pq`                                                | Not run. `pq` is not implemented in this build               |
| Full unit and integration suite, no database | `TEST_DATABASE_URL` unset                                                 | 362 files, 3,647 tests passed; 22 files and 85 tests skipped |

The databases used were throwaway local PostgreSQL 16 databases, created for these runs and then dropped. No test
rows remained afterwards. Nothing was run against Supabase.

## 6. Key files for a run

`vitest.setup.ts` creates a temporary key directory for each run and writes the Ed25519 keys the tests need. It
overrides `PARMANA_KEY_DIR` with that directory. Settings you export for a key directory are therefore replaced for
the test process.

For a manual key directory, generate the keys with the repository scripts:

```bash
npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default
npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id gateway
npx tsx scripts/generate-keypair.ts --algorithm dilithium3 --key-id default-secondary   # hybrid only
```

Keep generated keys out of Git. Delete them after a test run.

## 7. Known gaps

- **Hybrid mode fails in the test setup, not in the code under test.** The setup never creates the post-quantum key
  (`default-secondary`), so every signing request that needs it returns HTTP 500 with
  `Private key not found: default-secondary`. Fixing this means adding the secondary key to `vitest.setup.ts`. Not done.
- **`pq` mode is not implemented.** The build reports `CRYPTO_MODE=pq is not implemented in this build` and accepts only
  `single` and `hybrid`.
- **Supabase is not tested.** The local PostgreSQL 16 runs use the same migrations and SQL, but a Supabase project has
  its own roles, extensions and network setup. Run the suites once against a non-production Supabase project before
  relying on them.
- **Two tests depend on the database having been migrated.** If the bundle has not been applied, they fail on a missing
  table rather than skipping.
- **Test data is left in non-empty databases.** Several suites write rows and clean up only some of them. Use a
  database created for testing and drop it afterwards.

## 8. Cleaning up after a run

```bash
psql -h <host> -p <port> -U <user> -c "drop database parmana_test;"
psql -h <host> -p <port> -U <user> -c "drop database parmana_app;"
rm -rf <the key directory you created>
```
