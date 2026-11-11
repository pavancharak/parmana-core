# 2.40 Self Hosted Deployment: One Command Start, Enforcement With No Internet Route (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1352-1386.

## Exact claim text

## 2.40 Self Hosted Deployment: One Command Start, Enforcement With No Internet Route (Scoped)

A customer can run Parmana on its own infrastructure with one command, `docker compose up -d --build --wait`, and that deployment authorizes, refuses, executes and signs evidence with no route to the internet and no call to the hosted service. Decisions, signatures, the audit trail and the Trust Records stay in the deployment's own Postgres, and a Trust Record it produces verifies anywhere with only the public keys.

- The start needs only Docker on the host. `setup` makes the two Ed25519 key pairs and an API key inside the image and keeps them on every later start. `migrate` creates the roles the migrations expect and applies each migration once, recorded in `parmana_schema_migrations`. `seed` copies the shipped policies into the database without overwriting any version already there. `api` is the unchanged production image, run with `PARMANA_STORAGE=postgres`.
- `PARMANA_STORAGE=postgres` selects the same Postgres storage as `supabase` (G-57). `supabase` is unchanged for existing deployments.
- Every production rule is kept, none is relaxed for the self hosted path: caller authentication, the rule that a key acts only for its own principal, policy governance before a policy may authorize, the HTTPS only connector URL, Execution Intents, signing readiness and refusal recording.

Scope, stated plainly:

- **A new deployment authorizes nothing until its own people approve the policies they use** through policy governance (2.26, 2.35). `seed` does not approve them. API keys for the proposer and approver are issued inside the image (`docker/local/api-keys.mjs`). Signing the approval no longer needs the repository: the TypeScript SDK 1.3.0, published on npm on 2026-09-25, signs it (2.41, `docs/internal/VERIFICATION-GAPS.md` G-62, closed). The Python SDK 1.3.0, published on PyPI the same day, signs it too.
- An authorized action whose connector cannot be reached, times out or answers with an error returns `502 EXECUTION_OUTCOME_UNKNOWN` with the transaction's identifiers, matching the Execution Intent's `ERRORED` state (G-63, closed 2026-09-25; before, a bare `500`).
- Verified on Docker Desktop 29.8.0 on Windows 11 and on Linux in CI run 36113024609 (`.github/workflows/docker-image.yml`, job `self-hosted`, 2026-09-25, on the merge commit `a14bc5c`). CI repeats it on every change to the deployment files, and also runs every command of the quickstart page and compares the output (`docker/local/quickstart-check.sh`).
- The images were built while online. The claim is about running, not about building, with no internet.
- One API instance with one Postgres. No high availability.
- **No customer runs this deployment.** That remains a future claim in section 4.

Verification

- Clean start on 2026-09-25: every service completed or became healthy. `GET /ready` returned `{"status":"READY","authDisabled":false}`. `POST /execute` returned `401` with no key and `400` with the generated key and an empty body.
- Second start: both key files and `api-keys.json` unchanged (SHA-256 compared), `migrate` reported `0 applied, 31 already applied`, `seed` reported `0 added, 14 already present and kept`, and the caller audit rows written before the restart were still there.
- Offline check, `bash docker/local/offline-check/run.sh`, on a Docker network created with `internal: true`: 12 of 12 checks on each clean run (G-60 lists them). **Update (2026-09-30, 2.47):** the check now adds a refund manager through maker checker and signs the refund's approval, 14 checks. Run on 2026-09-30 with Docker: 14 of 14 passed, including the manager key added by one human and approved by another, and the refund with that manager's signed approval executed once. They include: no internet route; a policy approved by a second human with a signed step up authorization after the proposer was refused as approver; an authorized refund executed and reaching the downstream stand in, which verified the gateway's signature with only the public key; a refund over the policy threshold refused with `403 POLICY_DENIED` and never reaching it; the Trust Record verified with only the public keys; and a changed copy failing.
- The Trust Record saved by that run was verified again on the host, outside Docker, with `scripts/verify-trust-record.ts`: `valid: true`.
- Unit tests for the `postgres` storage name: 57 of 57 in the four affected files.

Evidence

- `docker-compose.yml`, `docker/local/setup.mjs`, `docker/local/migrate.sh`, `docker/local/postgres-roles.sql`, `docker/local/seed-policies.mjs`
- `packages/shared/src/config/StorageProviders.ts` (`isPostgresStorage`), `packages/storage/src/StorageFactory.ts`, `packages/api/src/bootstrap/assertStorageConfigured.ts`, `packages/api/src/routes/ready.ts`
- `packages/storage/tests/unit/storage-factory.test.ts`, `packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts`, `packages/api/tests/unit/routes/ready.test.ts`, `packages/shared/tests/unit/config-validation.test.ts`
- `.github/workflows/docker-image.yml`, job `self-hosted`
- `docs/site/self-hosted/` (the operator guide: overview, quickstart, policy approval, API keys, connectors, offline verification, operations, configuration, troubleshooting), `docker/local/api-keys.mjs`, `docker/local/examples/refund-request.mjs`, `docker/local/quickstart-check.sh`; `docs/internal/VERIFICATION-GAPS.md` G-56 to G-63

---

## Cited evidence paths

- `.github/workflows/docker-image.yml`: EXISTS
- `api`: EXISTS
- `api-keys.json`: MISSING
- `docker-compose.yml`: EXISTS
- `docker/local/api-keys.mjs`: EXISTS
- `docker/local/examples/refund-request.mjs`: EXISTS
- `docker/local/migrate.sh`: EXISTS
- `docker/local/postgres-roles.sql`: EXISTS
- `docker/local/quickstart-check.sh`: EXISTS
- `docker/local/seed-policies.mjs`: EXISTS
- `docker/local/setup.mjs`: EXISTS
- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/site/self-hosted/`: EXISTS
- `packages/api/src/bootstrap/assertStorageConfigured.ts`: EXISTS
- `packages/api/src/routes/ready.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts`: EXISTS
- `packages/api/tests/unit/routes/ready.test.ts`: EXISTS
- `packages/shared/src/config/StorageProviders.ts`: EXISTS
- `packages/shared/tests/unit/config-validation.test.ts`: EXISTS
- `packages/storage/src/StorageFactory.ts`: EXISTS
- `packages/storage/tests/unit/storage-factory.test.ts`: EXISTS
- `scripts/verify-trust-record.ts`: EXISTS
- `supabase`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                             | Status | Tests | Passed | Skipped |
| --------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/bootstrap/assert-storage-configured.test.ts` | passed | 6     | 6      | 0       |
| `packages/api/tests/unit/routes/ready.test.ts`                        | passed | 10    | 10     | 0       |
| `packages/shared/tests/unit/config-validation.test.ts`                | passed | 49    | 49     | 0       |
| `packages/storage/tests/unit/storage-factory.test.ts`                 | passed | 7     | 7      | 0       |
