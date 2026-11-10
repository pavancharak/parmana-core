# Doctor: open items

This records what is still open for the doctor, what each item needs, and who owns it. It is kept current when an item closes. The reference for the doctor itself is `DOCTOR.md` in this folder.

Last updated: 2026-11-04.

## Pull requests to merge

| Item                                       | Pull request      | Status                                 | Owner      |
| ------------------------------------------ | ----------------- | -------------------------------------- | ---------- |
| CI doctor step, and the memory-storage fix | parmana-core #326 | Open. Check the Checks tab, then merge | Maintainer |
| Complete doctor guide                      | parmana-core #327 | Open. Documentation only               | Maintainer |

The `doctor:production` command (#324) is not in the list of open pull requests, so it appears to be merged. Confirm this on GitHub.

## Production deployment

| Item                                         | What is needed                                                                                                                       | Owner    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Set `PARMANA_DATABASE_CA` on Vercel          | Paste the certificate text, made from the saved PEM file with `\n` line breaks. Use the command in `DOCTOR.md`, under "Database TLS" | Operator |
| Remove `NODE_EXTRA_CA_CERTS` from production | Delete the variable in the Vercel dashboard, if it was added as a workaround                                                         | Operator |
| Redeploy production                          | Redeploy after the variables change                                                                                                  | Operator |
| Run the production check                     | `npm run doctor:production` with the real `.env`. Expect exit code `0`                                                               | Operator |
| Delete the backup of `.env`                  | `.env.bak` holds the same secrets as `.env`. Delete it once the production check is clean                                            | Operator |
| Check `.env` for duplicates                  | Each setting should appear once. Duplicates make the file look right but can hide a stale value                                      | Operator |

## Clients

| Item                                  | What is needed                                                                                                               | Owner                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| Confirm every caller sends an API key | Authentication is on in production. A caller without a key is refused. Test with a request that has no key, and expect `401` | Operator, with the clients' owners |

## Decisions

| Item                                             | Decision needed                                                                                                                                              | Owner                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| Move signing keys from local files to AWS KMS    | The production design is `aws-kms`. The current setup uses local key files, with a protected volume. This is a project in its own right, not a doctor change | Maintainer, with the operator |
| Remove `PARMANA_KEY_MATERIAL_JSON` in production | Keys are written at startup from an environment variable. Use a mounted secret file, or KMS                                                                  | Operator                      |

## Not yet verified

| Item                       | What is needed                                                                                                | Owner    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------- |
| A real KMS key             | AWS credentials for the key's account. Run `npm run doctor:production` and check the `KMS key` line is `PASS` | Operator |
| The database user's grants | Confirm the user can read and write the tables. The table check does not test this                            | Operator |

## Closed

- Database TLS verification against a CA: parmana-core #323, merged.
- Online checks for the database and KMS: parmana-core #322, merged. The Supabase REST check was removed afterwards, because the server does not use the REST API.
- Install-script approvals for `re2` and `esbuild`: parmana-core #325, merged.
- Temporary verification branch `verify-stage3-with-ca`: deleted.
