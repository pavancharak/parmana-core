# Parmana: status, remaining work and how to finish it

Status as of 2026-11-07. Repository: `pavancharak/parmana-core`. Companion repositories: `parmana-verifier` and `parmana-connect`.

This page replaces the 2026-11-05 version. The gap table now lives in `VERIFICATION-GAPS.md` and `REMAINING-WORK.md`.

## 1. Where things stand

### Merged to `main` on 2026-11-07

| PR               | What it does                                                                                                                                                                                   |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #483             | A request that omits a fact the decision depends on is refused. The evaluation method version is now `"2"`.                                                                                    |
| #484, #486, #488 | Docs: claims, gaps, runbooks, the Node 24.22.2 pin and the startup check.                                                                                                                      |
| #485             | CI pinned to Node 24.22.2, the version the Docker production images run.                                                                                                                       |
| #487             | The server refuses to start when its bundled certificate store holds none of the four listed distrusted roots.                                                                                 |
| #489             | `engines.node` is `24.x`. A test fails if the Node major version disagrees across `package.json`, CI and the Dockerfile.                                                                       |
| #490             | Generator for schema v3 verifier fixtures, signed by the server's own signing code.                                                                                                            |
| #491             | The Python and TypeScript SDKs verify schema v3 hybrid records (Ed25519 and ML-DSA-65). Python needs `cryptography` 47 or later; TypeScript needs Node 24 or later. Schema v3 rollout runbook. |
| #492             | Key-delivery design, and the gate on the schema v3 Preview test.                                                                                                                               |

### Open

- **parmana-core #493:** option A, which loads key material from Secrets Manager at startup, and the removal of Fly. Ready for review. The preflight passed on Node 24.22.1 (3,560 tests).

### Verifier and connect

- `parmana-verifier`: PRs #33 and #34 are merged. Two commits are on the branch but not in `main`: a server-signed schema v3 vector with its test, and Python tests for the server-signed hybrid record. They need a new PR.
- `parmana-connect`: PR #48 is merged.

### Closed on 2026-11-07

- parmana-core #451 (decided: refusal names the missing facts, no separate outcome) and #279 (duplicate of #421).
- parmana-verifier #28 (ML-DSA-65 checks, merged in PR #31).

### Still open on purpose

- parmana-core #291: turn schema v3 on in the server. The SDK readers are done.
- parmana-verifier #27: waits on #291.

## 2. Decisions

- **Production moves its signing keys to option A on 10 November 2026.** Recorded in `runbooks/KEY-DELIVERY.md`.
- **Secret manager for option A: AWS Secrets Manager.**
- **Production runs on Vercel.** Fly is removed.
- **Node version: 24.x everywhere.** The Vercel project currently shows 26.x through a dashboard override, which must be changed.
- **Schema v3 is turned on Preview first, production later, as separate decisions.** The gate is in `runbooks/SCHEMA-V3-ROLLOUT.md`.
- **No ML-DSA-65 private key goes into an environment variable** for the schema v3 Preview test, unless the owner accepts that exposure in writing.

## 3. What remains, in order

### 3.1 Merge the open pull requests (owner)

1. Review and merge parmana-core #493.
2. Open and merge a PR for the two verifier commits on `claude/new-session-ml5hdm`.

### 3.2 Set Vercel's Node version to 24.x (owner, dashboard)

1. In the Vercel dashboard, open the production project, then Settings, then Build and Deployment, then Node.js Version.
2. Select `24.x` and click Save.
3. Redeploy `main`. The Hobby plan's daily deploy limit may block this until it resets.
4. Check the new production deployment's Runtime Settings, and confirm `/health` responds.
5. Check that the build log's first lines show `Using Node.js 24.x.y`.

### 3.3 Let Vercel read the key secret (owner, then verify)

Option A authenticates with the server's Vercel OIDC identity. This is not set up yet.

1. In AWS, create an IAM role that trusts Vercel's OIDC provider for this project. Allow `secretsmanager:GetSecretValue` on one secret only.
2. On the Vercel project's environment, set `AWS_REGION` and `AWS_ROLE_ARN`. These are not secrets.
3. Create the secret in Secrets Manager, with the JSON shape that `PARMANA_KEY_MATERIAL_JSON` uses: `{ "<keyId>": { "privateKeyPem": "...", "publicKeyPem": "..." } }`.
4. On Preview only, set `PARMANA_KEY_MATERIAL_SECRET` to the secret's name or ARN, and `PARMANA_SECRETS_PROVIDER` to `aws-secrets-manager`. Redeploy Preview. Check that `/health` responds. Never read the secret's value into a chat or a log.

### 3.4 Option A: Preview, then production by 10 November 2026 (owner decides, then verify)

1. Preview: the steps in 3.3 step 4. Check that the server starts, writes the key files, and signs.
2. Production, by 10 November 2026: set the same two variables on Production, redeploy `main`, and check `/health`.
3. After the secret path has run cleanly on Production, remove `PARMANA_KEY_MATERIAL_JSON` from Production.
4. Rotate the keys, since they have been in an environment variable. Follow the steps in `runbooks/KEY-DELIVERY.md`.

### 3.5 Schema v3 on Preview (owner sets the values, then verify records)

This starts only after 3.3 and 3.4 have run on Preview, or once the owner has accepted the exposure in writing. See the gate in `runbooks/SCHEMA-V3-ROLLOUT.md`.

1. Load the ML-DSA-65 key through option A, not an environment variable.
2. On Preview only, set `CRYPTO_MODE=hybrid`, `PRIMARY_SIGNATURE_PROVIDER=ed25519`, `SECONDARY_SIGNATURE_PROVIDER=ml-dsa-65`, `PARMANA_VERIFICATION_SECONDARY_KEY_ID`, `HYBRID_SCHEMA_VERSION=3` and `HYBRID_SCHEMA_V3_ACKNOWLEDGED=true`.
3. Redeploy Preview. Create one trust record. Check that it has `schemaVersion: 3` and two signatures.
4. Verify it with the TypeScript and Python SDKs. Expect `valid: true` and `coverage: "full"`. Add a field to a copy: both must report `valid: false`.
5. Watch Preview's logs for signing errors over a day.

### 3.6 Schema v3 on Production (separate decision, owner)

Only after 3.5 has run cleanly. Follow the Production steps in `runbooks/SCHEMA-V3-ROLLOUT.md`.

Rollback: unset `HYBRID_SCHEMA_VERSION` and `CRYPTO_MODE`, then redeploy.

### 3.7 Older review decisions (owner)

These are tracked outside this repository. Each needs an owner decision:

- The periodic policy-integrity check logs a mismatch but lets execution continue. Recommended: fail closed.
- Row-level security is enabled on many tables, but most have no policy. Recommended: first confirm where the service credential is held, then write policies.
- The leads table stores email with no stated retention. Needs the retention period and purpose.
- One shared bearer token is used for all MCP clients. Recommended: per-client tokens.
- The signed authorization does not name the connector. Recommended: a planned, coordinated upgrade.

### 3.8 Outside these repositories

- Security reports are with the maintainers.
- G-133: there has been no live run between parmana-core and parmana-connect. Needs a public HTTPS endpoint for the connector.
- G-134: the production connector key is not pinned. Needs its fingerprint confirmed through a second channel.

## 4. Checking the repository

```bash
npm ci
npm run build
npx vitest run
```

- Run the tests under the official Node 24.22.x build, with it first on `PATH`. After switching Node versions, rebuild native modules: `npm rebuild re2`.
- Python SDK, from `python/`: `pytest` (skip the live-server tests unless a server is running), `ruff check .`, `black --check .`, `mypy`.
- Before each commit, the pre-commit hook runs the full preflight. If it fails, fix the cause. Do not bypass the hook.

## 5. Known limits

- The Python live-server tests and the quickstart example need a running server, so they are not run here.
- Three TypeScript test files are empty placeholders (`HealthApi`, `ParmanaClient`, `PolicyApi`). This predates today's work.
- Option A is tested with a fake secrets provider. It has not been run against AWS Secrets Manager.
- Whether Vercel's OIDC role can read the secret is not yet verified.
