# Doctor: configuration check for parmana-core

`npm run doctor` checks the configuration the server would start with, and prints every problem at once, with a fix for each one. It never prints a setting's value.

Stage 1 covers the **local deployment**: memory storage, local key files, and a configuration with no production providers. Production settings (AWS KMS keys, Postgres or Supabase storage) and online checks against the database or the network are not yet covered. They are reported as "not yet checked" where they apply, so a clean run is not a claim that production is ready.

## Running it

From the repository root:

```bash
npm run doctor
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
| `PARMANA_STORAGE`                                                                            | The value is not memory, postgres or supabase                            | It is memory (state is lost on restart), or postgres or supabase (not yet checked)                                                                   |
| `CRYPTO_MODE`, `HASH_PROVIDER`, `PRIMARY_SIGNATURE_PROVIDER`, `SECONDARY_SIGNATURE_PROVIDER` | The value is not one the build implements                                | —                                                                                                                                                    |
| `KEY_PROVIDER`                                                                               | The value is not implemented (only `local` and `aws-kms` are)            | `aws-kms` (not yet checked)                                                                                                                          |
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

## Fixing the common failures

- **`PARMANA_KEY_DIR` is not set, or the default key pair is missing.** Set `PARMANA_KEY_DIR` to a folder, then generate the pair into it:

  ```bash
  npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default
  ```

  The script writes `default.private.pem` and `default.public.pem` to `PARMANA_KEY_DIR`, or to `./keys` when it is unset. It does not overwrite existing files unless you add `--force`. Overwriting a key that is in use breaks every signature made with it, so do not add `--force` on an existing deployment.

- **`PARMANA_POLICY_DIR` does not exist.** Create the folder, and add the policy files. A missing folder stops the server. An empty one warns, and requests naming a policy fail.
- **`PARMANA_API_KEYS` is missing.** Either configure at least one entry, a JSON array of `{ "callerId", "keyHash" }`, or set `PARMANA_AUTH_DISABLED=true` for a local machine only.
- **A typo warning.** Rename the setting to the name the doctor suggests. The server ignores the misspelt name without any message.

## What the doctor does not check

- Production settings: `KEY_PROVIDER=aws-kms` keys, and Postgres or Supabase storage, including whether `DATABASE_URL` is set and reachable. These come in stage 2.
- Anything over the network: the database, storage, and the key provider. These come in stage 3, opt-in with `--online`.
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

- **"dist/ is stale" before the tests.** Run `npm run build`, then the tests again. The tests import the packages from `dist/`.
- **Doctor reports settings you expected to be set.** You are probably running from a subfolder, so `.env` is not found. Run it from the repository root.
- **Doctor reports nothing for a setting you set in the shell.** Check the spelling. A misspelt name is reported as a typo, so look for that warning.
