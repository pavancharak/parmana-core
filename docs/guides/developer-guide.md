# Developer guide: Parmana repositories

For a new developer. It covers setup, each command and what it does, the daily workflow, and troubleshooting. Each command is taken from the repository's `package.json` or its documentation. Check the repository if a script has changed since this was written.

Sources: `parmana-core/package.json`, `parmana-core/CONTRIBUTING.md`, `parmana-core/docs/internal/runbooks/NODE-VERSION.md`, `parmana-connectors/package.json`, `parmana-connectors/README.md`.

---

## 1. Requirements

| Tool               | Version                    | Why                                                                                                                     |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Node.js            | **24.x** (CI uses 24.22.2) | Both repos require it. On Node 22 the build passes but tests fail.                                                      |
| npm                | Ships with Node 24         | Installs dependencies and runs scripts                                                                                  |
| Git                | Any recent version         | Branches, commits, hooks                                                                                                |
| gitleaks or Docker | Either one                 | The pre-commit hook in `parmana-core` scans for secrets with one of them. The commit is refused if neither is available |
| Docker             | Optional                   | Starts the local Postgres for database tests                                                                            |
| PostgreSQL         | Optional, through Docker   | Only the database tests need it                                                                                         |

On **Windows**, use PowerShell. Command lines below use `\` at the end of a line for readability. In PowerShell, use a backtick `` ` `` instead, or put the command on one line.

## 2. The two main repositories

| Repository           | What you change there                                                            |
| -------------------- | -------------------------------------------------------------------------------- |
| `parmana-core`       | The decision engine: policies, approvals, governance, SDKs, signed records, API  |
| `parmana-connectors` | The services that perform approved actions in business systems, such as Razorpay |

Clone each one into its own folder:

```bash
git clone https://github.com/pavancharak/parmana-core.git
git clone https://github.com/pavancharak/parmana-connectors.git
```

## 3. First-time setup: `parmana-core`

Follow `CONTRIBUTING.md`, "Set up".

```bash
cd parmana-core
node -v                 # must print v24.x
npm ci                  # install dependencies, then run the prepare script
npm run build           # compile everything
npm test                # run the full test suite (several minutes)
```

**What each command does**

- `node -v` confirms the Node version. Anything other than 24 is a common cause of failures (section 9).
- `npm ci` installs exactly the versions in `package-lock.json`. It also runs the `prepare` script, which runs `git config core.hooksPath scripts/git-hooks`. That makes Git use this repository's hooks: the secret scan, the sign-off check, and the push-to-`main` block.
- `npm run build` compiles the TypeScript packages, regenerates the OpenAPI bundle, and builds the TypeScript SDK. Tests load the compiled output, so run this before the tests.
- `npm test` runs the test suite. Its first step checks that the compiled output is up to date, so a stale build fails here.

**Optional: database tests.** Start the local Postgres and apply the migrations:

```bash
docker compose up -d postgres
docker compose run --rm migrate
```

Supabase tests are skipped unless you have Supabase credentials.

## 4. First-time setup: `parmana-connectors`

From `parmana-connectors/README.md`, "Commands":

```bash
cd parmana-connectors
node -v                 # must print v24.x or later
npm ci
npm run build           # compile to dist/
npm run typecheck       # type-check without writing output
npm test                # run the Vitest suite
```

Tests that need PostgreSQL run only when `PARMANA_TEST_DATABASE_URL` is set.

To run the service locally, copy `.env.example` to `.env`, fill in the settings from the environment guide, and run:

```bash
npm start               # runs dist/main.js and reads .env
```

`.env` is git-ignored. Never commit it, and never deploy it. Hosted deployments set the same values in the host's environment.

## 5. Every command in `parmana-core`

Run these from the repository root with `npm run <name>`.

### Build and check

| Command         | What it does                                                                                    | When to use it                                                   |
| --------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `build`         | Regenerates the OpenAPI bundle, compiles all packages (`tsc -b`), and builds the TypeScript SDK | After any source change, and before tests                        |
| `build:verbose` | Same as `build`, with a line for each package                                                   | When a build fails and you need the detail                       |
| `build:force`   | Rebuilds everything, ignoring what is up to date                                                | When output looks stale                                          |
| `clean`         | Deletes the compiled output (`tsc -b --clean`)                                                  | Before a clean rebuild                                           |
| `rebuild`       | `clean`, then `build:force`                                                                     | When the build seems inconsistent                                |
| `typecheck`     | Type-checks without writing output                                                              | Fast check of types                                              |
| `lint`          | Runs ESLint on all TypeScript files                                                             | Before committing                                                |
| `lint:fix`      | Runs ESLint and fixes what it can                                                               | To fix simple lint errors automatically                          |
| `format`        | Formats every file with Prettier, in place                                                      | To fix formatting                                                |
| `format:check`  | Reports unformatted files without changing them                                                 | This is what CI runs                                             |
| `check`         | `typecheck`, `lint`, `format:check`, `check:python-models`, `test`, then `build`                | The full local check before a pull request                       |
| `preflight`     | `check`, then `examples`                                                                        | The most complete check. The pre-commit hook runs the same steps |

### Test

| Command      | What it does                                                                                    | When to use it                             |
| ------------ | ----------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `test`       | Runs the whole suite (`vitest run`). Its `pretest` step rebuilds and checks the output is fresh | Before a commit                            |
| `test:watch` | Runs tests and reruns them when files change                                                    | While working on one area                  |
| `coverage`   | Runs the suite and reports coverage                                                             | When you need coverage numbers             |
| `mutation`   | Runs mutation testing (`scripts/mutation.ts`)                                                   | To check that tests catch real faults      |
| `examples`   | Runs the examples in `examples/` (`scripts/run-examples.ts`)                                    | To confirm the examples still work         |
| `loadtest`   | Runs the load test (`scripts/load-test.ts`)                                                     | Before changing performance-sensitive code |

To run one test file, pass its path to Vitest, for example:

```bash
npx vitest run packages/runtime/tests/unit/trust-record-window-export.test.ts
```

### Run and diagnose

| Command             | What it does                                                                                | When to use it                             |
| ------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `dev`               | Runs the API server from source (`packages/api/src/server.ts`)                              | Local API development                      |
| `doctor`            | Checks the local configuration (`scripts/doctor.ts`) and reports pass, fail or review items | First step when the service will not start |
| `doctor:production` | Same, with production checks and online checks                                              | Before a production deployment             |
| `verify:kms`        | Checks the KMS signing setup (`scripts/verify-kms-signing.ts`)                              | When KMS signing is configured             |

### Keys, database and migrations

| Command                         | What it does                                                    | When to use it                        |
| ------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| `generate:gateway-keys`         | Makes an Ed25519 key pair with the key id `gateway`             | Local key setup                       |
| `generate:hybrid-secondary-key` | Makes a Dilithium3 key pair with the key id `default-secondary` | Hybrid signing setup                  |
| `generate:api-key`              | Makes an API key for a caller                                   | Local testing of authenticated routes |
| `db:migrate`                    | Applies database migrations (`scripts/migrate-database.ts`)     | After pulling schema changes          |
| `generate:migration-bundle`     | Builds a single migration file                                  | When packaging migrations             |
| `rotate:verification-key`       | Rotates the verification key                                    | Only as a planned key rotation        |

The key-generating commands write files. Keep them out of Git. Never paste a key into chat or a document.

### Generated documents

| Command                                                                 | What it does                                                  | When to use it                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------- |
| `openapi`                                                               | Lints the OpenAPI document, bundles it, and adds code samples | After changing `openapi/openapi.yaml`                |
| `lint:openapi`                                                          | Lints the OpenAPI document only                               | Quick check of the API description                   |
| `bundle:openapi`                                                        | Bundles the OpenAPI document without linting                  | Rarely needed directly                               |
| `generate:llms-txt`                                                     | Regenerates `docs/site/llms.txt` and `llms-full.txt`          | After changing docs. A test fails if these are stale |
| `generate:postman`                                                      | Regenerates the Postman collection                            | After API changes                                    |
| `generate:endpoint-pages`                                               | Regenerates the endpoint reference pages                      | After API changes                                    |
| `generate:typescript-sdk-reference` and `generate:python-sdk-reference` | Regenerate SDK reference pages                                | After SDK changes                                    |
| `check:sdk-docs`                                                        | Checks SDK documentation matches the code                     | Before a pull request that touches an SDK            |
| `generate:python-models` and `check:python-models`                      | Generate, or check, the Python models                         | After changing a model used by the Python SDK        |
| `record:published-sdk`                                                  | Records the published SDK versions                            | Release work                                         |
| `generate:build-book-reference` and `generate:build-book-pdf`           | Generate the build book                                       | Documentation release                                |

### Policy log and evaluation

| Command                     | What it does                                      | When to use it       |
| --------------------------- | ------------------------------------------------- | -------------------- |
| `policy-log:verify`         | Verifies the policy approval log                  | Audit checks         |
| `policy-log:export`         | Exports the policy approval log                   | Audit reports        |
| `policy-log:check-db`       | Compares the log with the database                | Audit checks         |
| `evaluate`                  | Runs the evaluation suite (`scripts/evaluate.ts`) | Evaluating decisions |
| `evaluate:agentrust-refund` | Runs the refund evaluation                        | Refund-policy review |

### Installation hook

`prepare` runs after `npm ci` and `npm install`. It sets `core.hooksPath` to `scripts/git-hooks`. You do not run it yourself.

## 6. Every command in `parmana-connectors`

| Command                  | What it does                                                                                                                       | When to use it                                                   |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `npm ci`                 | Installs exact dependency versions                                                                                                 | First setup, and after `package-lock.json` changes               |
| `npm run build`          | Compiles to `dist/` (`tsc -p tsconfig.json`)                                                                                       | Required before `npm start` and the test-mode run                |
| `npm run typecheck`      | Type-checks without writing output                                                                                                 | Fast check                                                       |
| `npm test`               | Runs Vitest. Database tests run only with `PARMANA_TEST_DATABASE_URL` set                                                          | Before a commit                                                  |
| `npm start`              | Runs `dist/main.js`, reading `.env` if it exists                                                                                   | Running the service locally                                      |
| `npm run check:config`   | Builds, then checks the configuration in `.env` with `dist/service/check-config-cli.js`                                            | Before starting the service, to catch missing or unsafe settings |
| `npm run ledger:archive` | Moves finished releases from the replay ledger to an archive, keeping their ids blocked (`dist/service/archive-release-ledger.js`) | Maintenance, with the owner's agreement. It never deletes rows   |

**Razorpay test-mode run** (not an npm script): see section 7.

## 7. Razorpay test-mode run (`parmana-connectors`)

This checks the Razorpay connector against Razorpay's test API. It refunds in test mode, so no money moves.

```bash
export RAZORPAY_KEY_PAIR="rzp_test_...:<secret>"
export RAZORPAY_TEST_PAYMENT_ID="pay_..."
npm ci && npm run build
node --env-file-if-exists=.env src/connectors/razorpay/test-run.mjs
```

On PowerShell, set the variables with `$env:RAZORPAY_KEY_PAIR = "rzp_test_...:<secret>"`, and the same for the payment id.

- `RAZORPAY_KEY_PAIR` is the test key pair. The script refuses any key that does not start with `rzp_test_`, and it never prints the key.
- `RAZORPAY_TEST_PAYMENT_ID` must be a captured test payment, `pay_` followed by letters or digits.
- `RAZORPAY_TEST_AMOUNT` is optional, in paise. The default is `100`, which is ₹1.

The script makes one refund, checks that a repeat returns the same refund, and checks two refusals.

## 8. Git workflow

**Branch.** Branch from an up-to-date `main`. Name the branch for its purpose:

```bash
git checkout main
git pull origin main
git checkout -b fix/policy-refusal-message
```

**Commit with a sign-off.** Every commit needs a `Signed-off-by` line, which the DCO check looks for:

```bash
git commit -s -m "Fix the refusal message for an unknown capability"
```

If the commit is missing the sign-off, the `commit-msg` hook refuses it and prints the fix. To add the sign-off to commits you already made on a branch:

```bash
git rebase --signoff origin/main
```

Only do this on your own feature branch, then push with `--force-with-lease`. Never force-push `main`.

**Signing.** `main` accepts only GPG-signed commits. See `docs/internal/runbooks/SIGNING-COMMITS.md` in `parmana-core` for the setup.

**Pushing.** The pre-push hook refuses any push that changes `main`. Push your branch and open a pull request.

```bash
git push -u origin fix/policy-refusal-message
```

**Pull requests.** Fill in the template. Do not open one unless you intend it for review.

## 9. Troubleshooting

| Symptom                                                       | Cause                                                                               | Fix                                                                                                   |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Tests fail on Node 22, or the build passes but tests fail     | Both repos need Node 24. Some tests expect Node 24's root certificates              | Install Node 24, then run `npm rebuild re2`                                                           |
| `re2` native module will not load after a Node version change | The module was built for another Node version                                       | `npm rebuild re2`                                                                                     |
| `npm test` says `dist/` is stale                              | Output is older than the source it was built from                                   | `npm run build`, then run the tests again                                                             |
| A commit is refused by the pre-commit hook for a secret       | The staged files contain something that looks like a secret                         | Remove it from the files. Do not use `--no-verify` unless you have reviewed the staged files yourself |
| The pre-commit hook says gitleaks is not available            | Neither gitleaks nor Docker is installed                                            | Install gitleaks or Docker                                                                            |
| A commit is refused for a missing sign-off                    | No `Signed-off-by` line                                                             | Commit with `git commit -s`, or rebase with `--signoff` (section 8)                                   |
| `format:check` fails                                          | A file is not formatted                                                             | `npm run format`, then `npm run format:check`                                                         |
| `lint` fails                                                  | Code breaks an ESLint rule                                                          | `npm run lint:fix`, then fix what remains                                                             |
| A test fails with `llms-txt` or `llms-full.txt` stale         | Docs changed, and the generated files were not regenerated                          | `npm run generate:llms-txt`, then commit the result                                                   |
| The OpenAPI check fails                                       | The description has an error                                                        | `npm run lint:openapi` reports the problem. Fix it in `openapi/openapi.yaml`, then `npm run openapi`  |
| The database tests are skipped                                | `PARMANA_TEST_DATABASE_URL` is not set                                              | Start Postgres (section 3), and set the variable to its URL                                           |
| `npm start` refuses to start in `parmana-connectors`          | A required setting is missing or unsafe. The error names the setting, not its value | Run `npm run check:config`, and fix the setting it names                                              |
| `doctor` reports a failure                                    | The local configuration is incomplete                                               | Read the failing line, and fix that setting                                                           |
| `npm ci` fails on the lockfile                                | `package-lock.json` is out of step with `package.json`                              | Run `npm install` on a branch, review the lockfile change, and commit it with the sign-off            |
| Vercel and local Node versions differ                         | The Vercel project may use a different Node version from `engines`                  | See `docs/internal/runbooks/NODE-VERSION.md`. The project setting can override `engines`              |
| `RAZORPAY_KEY_PAIR` is refused as not a test key              | The key starts with something other than `rzp_test_`                                | Use a test-mode key. The script refuses live keys by design                                           |
| A release is recorded but not confirmed (connectors)          | The service stopped after recording the release and before storing the answer       | Do not resend. Follow `RUNBOOK.md`, "Recovering a release that was recorded but not confirmed"        |

If something is not listed here, run `npm run doctor` in `parmana-core`, or `npm run check:config` in `parmana-connectors`. Their output names the setting or file at fault.

## 10. Where to read more

- `parmana-core/CONTRIBUTING.md`: setup, the change process, and the records to update in each pull request.
- `parmana-core/docs/internal/runbooks/`: local development, signing commits, the Node version, kill switch operations, key rotation, and production deploy and rollback.
- `parmana-connectors/README.md`: the service, its checks, the connector list, and deployment.
- `parmana-connectors/RUNBOOK.md`: deployment steps and recovery.
- `docs/internal/CLAIMS.md`: what Parmana claims, and the evidence for each claim.
- `docs/internal/VERIFICATION-GAPS.md`: what is not yet verified.
