# Deployment and operations

[Portal home](../README.md) · [Security](../security/README.md) · [Environment variables](../reference/environment-variables.md) · [Self-hosted guide](../../../docs/site/self-hosted/overview.mdx)

This page covers running Parmana: local development, Docker, PostgreSQL, cloud, and on-premises. For each option it says whether it is **Implemented** (in the code, and run here), **Implemented, not run here** (in the code, but not run in this verification), or **Planned / recommended** (a practice this portal recommends, which the code does not enforce, or which is not in the code at all).

## Options at a glance

| Option                                                                                             | Status                                                                        | Run in this verification?                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Local development from source (`npm run dev`, configured by the setup script)                      | **Implemented**                                                               | Yes: the server ran, served every route checked, and executed transactions                                                   |
| `npm run dev:setup` (a one-command local server)                                                   | **Implemented**                                                               | Yes: it starts, but its policy directory does not contain the fixture policies, so the fixture flows are refused (see below) |
| Docker Compose (`docker-compose.yml`: postgres, migrate, seed, setup, api)                         | **Implemented**                                                               | **No.** The file validated with `docker compose config`. The Docker daemon was not reachable, so the stack was not started.  |
| Dockerfile image (`Dockerfile`, `Dockerfile.cli`)                                                  | **Implemented**                                                               | **No.** Not built.                                                                                                           |
| PostgreSQL storage (`PARMANA_STORAGE=postgres`, `DATABASE_URL`)                                    | **Implemented**                                                               | **No.** The sandbox had a hosted database URL in its environment, which this verification deliberately did not use.          |
| Cloud hosting (the OpenAPI document lists a production server; `vercel.json` is in the repository) | **Implemented as configuration**                                              | **No.** Not deployed or contacted.                                                                                           |
| On-premises (Docker Compose, or the Node process on your own hosts)                                | **Implemented**                                                               | **No** for the container path. Process path: see local.                                                                      |
| Scaling out to several API replicas                                                                | **Planned / recommended**                                                     | No                                                                                                                           |
| High availability and failover                                                                     | **Planned / recommended**                                                     | No                                                                                                                           |
| Backup and recovery procedures                                                                     | **Planned / recommended**                                                     | No                                                                                                                           |
| Monitoring, dashboards, and alerting                                                               | **Planned / recommended**; structured logs and an alert webhook setting exist | No                                                                                                                           |

## Local development

The server runs from a checkout. It needs the packages built, a policy directory, a key directory and, for tests, `NODE_ENV=test`.

```bash
npm ci
npm run build
```

Start it with the setup that the [getting-started guide](../getting-started.md) uses. It writes the keys, the policies and the caller keys outside the repository, prints the exact command, and does not overwrite an existing directory:

```bash
node docs/developer-portal/examples/governed-quickstart/setup.mjs
bash ~/.parmana/governed-quickstart/start-server.sh
```

`npm run dev:setup` starts a local server in one command, with local keys in `keys/` and `.parmana-dev/`. It sets `NODE_ENV=test` and `PARMANA_POLICY_DIR=./policies`. Verified: the server started and `GET /health` returned `UP`. Its policy directory holds `payment-refund`, not `vendor-payment`, so a request for `vendor-payment@2.1.0` is refused with `404 Policy … was not found`. Use the governed setup for the fixture flows.

The server refuses to start with missing configuration, and says what is missing:

```text
Error: PARMANA_POLICY_DIR is not set. Refusing to start without a configured policy directory…
Error: PARMANA_KEY_DIR is not configured.
```

## Docker Compose

`docker-compose.yml` defines five services. Their order and their roles, from the file:

| Service    | Role                                                                              | Depends on (from `docker-compose.yml`)           |
| ---------- | --------------------------------------------------------------------------------- | ------------------------------------------------ |
| `setup`    | Creates the signing keys and the caller key in `./parmana-local/` on first start. | Nothing.                                         |
| `postgres` | The PostgreSQL database, with the data volume `postgres-data`.                    | Nothing.                                         |
| `migrate`  | Applies the database migrations.                                                  | `postgres`.                                      |
| `seed`     | Seeds the shipped policies.                                                       | `migrate`.                                       |
| `api`      | The Parmana API, in `NODE_ENV=production`, with `PARMANA_STORAGE=postgres`.       | `setup` and `seed`, both completed successfully. |

```bash
docker compose up -d
docker compose ps                          # wait until api is healthy
curl -i http://127.0.0.1:3000/health       # expect 200 once it is up
docker compose down                        # stop; the database is kept
docker compose down -v                     # stop and delete the database too
```

Defaults from the file:

- The API binds to `127.0.0.1` (`PARMANA_BIND`), on host port `3000` (`PARMANA_PORT`). It is not exposed to the network unless you change `PARMANA_BIND`.
- The container runs as the `node` user (`USER node` in the Dockerfile) on the `node:24-slim` base, pinned by digest.
- The API's health check calls `/ready` and expects `READY`.
- `POLICY_CHANGE_CHECKERS` is passed through from your environment. An empty value approves nothing, so set it before you approve a policy.

**Not run in this verification:** the Docker daemon was not reachable from the sandbox, so the stack was not started. The compose file was validated with `docker compose config -q`, which lists the five services. Run `docker compose up` on a host with Docker before you rely on it.

## PostgreSQL

Production storage is PostgreSQL. Set `PARMANA_STORAGE=postgres` (or `supabase`, an alias for the same implementation) and `DATABASE_URL`.

- The server checks `DATABASE_URL` at start-up when storage is PostgreSQL, and refuses to start without it.
- `GET /ready` runs `SELECT 1` against the database when storage is PostgreSQL. A failing query makes the service not ready.
- Apply migrations before the first start, with the `migrate` service or `npm run db:migrate` (`scripts/migrate-database.ts`). Not run in this verification.
- Use TLS to the database in production. The environment variable `PARMANA_DATABASE_CA_FILE` takes a CA file (see the `.env.test.example` comments and [Environment variables](../reference/environment-variables.md)).

Memory storage (`PARMANA_STORAGE=memory`) keeps everything in the process. It is for development and tests only. Verified: after a server restart, a transaction created before the restart returned `404 Business Transaction not found.`, and the trust-record list was empty. Do not run a deployment on memory storage.

## Cloud and on-premises

- The OpenAPI document lists `https://parmana-api-real.vercel.app` as a production server, and the repository has a `vercel.json`. This portal did not deploy, contact or test that server.
- For your own cloud or on-premises hosts, run the server as a Node.js 24 process or as the Docker image, behind a TLS-terminating reverse proxy, with PostgreSQL and a key directory or KMS. The self-hosted guide in the repository's documentation site covers the steps: [`docs/site/self-hosted/overview.mdx`](../../../docs/site/self-hosted/overview.mdx).
- Keep the database, the key material, and the policy directory on storage that only the service can write. The policy directory must match the approval records (see the policies page).
- `KEY_PROVIDER=aws-kms` stores signing in a KMS (Ed25519 only). Its reachability is checked at start-up. The `npm run verify:kms` script was not run here.

## Environment variables

The complete list, with what each one does and where it is read, is in [Environment variables](../reference/environment-variables.md). The variables a deployment must set are:

| Variable                                                               | Why                          | Notes                                                               |
| ---------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------- |
| `NODE_ENV=production`                                                  | Production behaviour.        | The test approver setting is refused outside `NODE_ENV=test`.       |
| `PARMANA_STORAGE=postgres`                                             | Durable storage.             | `supabase` is an alias.                                             |
| `DATABASE_URL`                                                         | The database.                | Required with PostgreSQL storage.                                   |
| `PARMANA_POLICY_DIR`                                                   | The policy files.            | Required. The server will not start without it.                     |
| `PARMANA_KEY_DIR` or `KEY_PROVIDER=aws-kms`                            | The signing keys.            | Required.                                                           |
| `PARMANA_API_KEYS`                                                     | The caller entries (hashes). | JSON array.                                                         |
| `POLICY_CHANGE_CHECKERS`                                               | Who may approve each policy. | JSON object. An empty value approves nothing.                       |
| `CRYPTO_MODE`, `SECONDARY_SIGNATURE_PROVIDER`, `HYBRID_SCHEMA_VERSION` | Evidence strength.           | See [Security](../security/README.md#schema-versions-and-coverage). |

Do not set `PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE`, `PARMANA_AUTH_DISABLED=true` or `NODE_ENV=test` in production. The server refuses the first outside `NODE_ENV=test`. The second makes `/ready` report `authDisabled: true` and accept requests without authentication.

## Secrets management

- **Signing keys:** in the key directory (readable by the service only) or in a KMS. Never in a repository.
- **Caller keys:** in the caller's own secret store. The server holds only the hash.
- **Approver and checker private keys:** on their owners' machines.
- **`PARMANA_KEY_MATERIAL_JSON` and `PARMANA_KEY_MATERIAL_SECRET`:** key material the server writes into the key directory at boot, per the repository's `.env.example`. Treat them as secrets, and do not log them.
- **`PARMANA_SECRETS_PROVIDER`:** selects a secrets provider. Read the environment reference for the values it accepts.
- **`DATABASE_URL`:** a secret. It appears in the environment, so restrict who can read the process environment.

## Network requirements

| Direction                             | Port and protocol                                 | Purpose                                                                                       |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Clients → Parmana API                 | 443 (through your reverse proxy), or 3000 locally | SDK and REST calls, over HTTPS.                                                               |
| Parmana API → PostgreSQL              | 5432, TLS                                         | Storage.                                                                                      |
| Parmana API → connectors              | Your network, HTTPS                               | Signed releases.                                                                              |
| Parmana API → business signal sources | HTTPS                                             | Sourced facts (for example the payment provider's signal service). Each source is registered. |
| Operators → Parmana API               | HTTPS                                             | Policy and governance changes.                                                                |

The SDKs refuse non-HTTPS endpoints except on loopback, so a client cannot send its key in clear text by accident.

## Scaling, availability and recovery

These are **planned or recommended**. The code does not enforce them, and this verification did not test them.

- **Scaling.** Run more than one API instance against the same PostgreSQL database, behind a load balancer. Each request is independent apart from the database. Test this before you rely on it: the repository's `npm run loadtest` script exists and was not run here.
- **Availability.** Use the health (`/health`) for liveness and `/ready` for readiness in your orchestrator. Readiness depends on the database.
- **Backup.** Back up the PostgreSQL database. The records, the approval records and the transactions are there. Back up the key directory or KMS configuration separately and securely; without the signing key you cannot sign new records, and without the old public keys you cannot verify old ones.
- **Recovery.** Restore the database, then the key material. Verify a sample of records afterwards with the pinned keys. Restore the policy directory to match the approval records, or the server will refuse the mismatched policies.
- **Key rotation.** `npm run rotate:verification-key` exists; keep old public keys in your trust set. See [Security](../security/README.md#key-management).

## Monitoring and logging

- **Health and readiness.** `GET /health` returns `{"status":"UP"}`. `GET /ready` returns `{"status":"READY", "storage": …, "authDisabled": …}`. Use these in your monitor.
- **Logs.** The server writes one JSON object per line on standard output, with an `event` field. Observed events include `runtime`, `runtime_engine_constructed`, `policy_governance_integrity_check_passed`, and `caller_audit_write_failed` (seen in the examples' test output). Ship them to your log store.
- **Alerts.** `ALERT_WEBHOOK_URL` and `ALERT_WEBHOOK_SECRET` configure an alert webhook. The sink is in the server's code. Its delivery was not tested here.
- **Rate limits.** The server returns `429` with `Retry-After` when limits are reached. Watch for it; a sudden rise can mean a client is retrying an execution it should not.
- **What to watch for:** `409` on executions (repeated ids), `502` and `500 EXECUTION_RECORD_INCOMPLETE` (actions that may need reconciling), `caller_audit_write_failed`, and `policy_governance_integrity_check` failures.

## Performance and latency

No latency or throughput figure is published in this portal, because none was measured here. The load-test script (`npm run loadtest -- --connections 20 --duration 15`) measures `POST /execute` on your hardware. Expect the database write and the signature to dominate; the policy evaluation is local and small. Measure against your own traffic before you set capacity.

## Operational checklist

- [ ] `/ready` is healthy, and reports `authDisabled: false` and the storage you expect.
- [ ] PostgreSQL migrations applied, backups configured, restore tested.
- [ ] Signing keys in a KMS or a key directory only the service reads; the public keys published and pinned by the verifiers.
- [ ] Policy directory matches the approval records at start-up (no integrity failures in the logs).
- [ ] `POLICY_CHANGE_CHECKERS` names the checkers for each policy.
- [ ] Caller keys scoped; a rotation runbook exists.
- [ ] Logs shipped; alerts for `5xx`, `429` spikes and audit write failures.
- [ ] A TLS-terminating reverse proxy in front of the API, and the API not reachable except through it.
