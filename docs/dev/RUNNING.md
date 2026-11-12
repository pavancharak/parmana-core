# Running Parmana

[Back to the README](../../README.md) · [Developer docs index](README.md)

## Quick start

On Node.js 24 or later, with no `.env` file and no credentials:

```bash
npm ci
npm run build
npm test
npm run examples
npm run evaluate
```

- `npm run evaluate` runs the 16 attack scenarios in [evaluations/scenarios.json](../../evaluations/scenarios.json) and reports whether each was blocked. [EVALUATION.md](../../EVALUATION.md) explains the result.
- To see the whole chain against a local mock connector, with no network access or credentials:

  ```bash
  npx tsx examples/tutorials/60-end-to-end-enterprise-execution/run.ts
  ```

- For the step-by-step evaluation guide, see [EVALUATION.md](../../EVALUATION.md).
- `npm run dev:setup` starts a local server with test keys, for building against the API. It is for local development only. See [Run a local server in one command](https://docs.parmanasystems.com/guides/local-development).

## Run it locally

Pick the path that matches what you want to see. All three run on your own machine and send nothing to a hosted service.

| Path                 | Command                                                   | What you get                                                                  | Needs               |
| -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------- |
| 1. Check the code    | `npm ci && npm run build && npm test && npm run evaluate` | Build, tests and the 16 attack scenarios. No server.                          | Node.js 24          |
| 2. Local API server  | `npm run dev:setup`                                       | API at `http://localhost:3000`, with local signing and caller keys generated. | Node.js 24          |
| 3. Self-hosted stack | `docker compose up -d`                                    | API and its own Postgres, started together, on `127.0.0.1:3000`.              | Docker with Compose |

**Before you start.** Use Node.js 24 or later. The repo pins 24.22.2 in `.nvmrc`, so `nvm use` picks it up if you use nvm. Clone the repo and run everything from its root.

**Path 2 in detail.** The first run creates the keys in `.parmana-dev/` and `keys/`. Later runs reuse them. The script stops if `NODE_ENV=production` is set, because it is for local development only. Stop the server with Ctrl+C. The generated folders are gitignored, so they are not committed, but treat them as local secrets and do not share them.

**Path 3 in detail.** `docker compose up -d` creates the signing keys and an API key in `./parmana-local/` the first time, applies the migrations, and seeds the shipped policies. Then:

```bash
docker compose ps                          # wait until the api service is healthy
curl -i http://127.0.0.1:3000/health       # expect HTTP 200 once it is up
docker compose down                        # stop; the database is kept
docker compose down -v                     # stop and delete the local database too
```

The Compose file's header explains each startup step. Use `PARMANA_PORT` to change the host port.

**Check it works.** Paths 1 and 2 are the quickest way to confirm a working setup: `npm test` should pass, and `npm run evaluate` reports, for each scenario, whether it was blocked. For the full walkthrough, see [Quickstart](https://docs.parmanasystems.com/quickstart) and [Local development](https://docs.parmanasystems.com/guides/local-development).

**Common problems.**

- _Port 3000 is in use._ Stop the other process, or for Path 3 set `PARMANA_PORT` to another port.
- _Node version errors._ Check `node -v` shows 24 or later. Use `nvm use` or install Node 24.
- _Docker stack stops at migrate or seed._ Run `docker compose logs migrate seed` to see the failing step.

**Windows.** Path 3 needs Docker Desktop. The setup script checks for Windows shells, so Paths 1 and 2 may work natively with Node.js 24, but this has not been tested. If you hit a problem, running the repo inside WSL 2 is the safer option, and an issue with the output helps us fix the native path.

**Technical guide.** A 20-page PDF covers how a request moves through Parmana, how policies and human approvals work, how to verify signed records offline, and the security model with its limits: [docs/site/parmana-technical-guide.pdf](../site/parmana-technical-guide.pdf).

## Running it

- **Production:** [Deploy to production](https://docs.parmanasystems.com/deployment/production) covers the required configuration, the fail-closed startup checks, and how to confirm a deployment.
- **Your own infrastructure:** [Self hosted](https://docs.parmanasystems.com/self-hosted/overview) covers running it with Docker Compose.
- **The hosted instance:** [Live API and demos](https://docs.parmanasystems.com/guides/live-api-and-demos) covers authentication, the request shape, the deployed policies and offline verification.
- **Connecting an agent:** [docs/internal/connectors/CONNECTING_AN_AGENT.md](../internal/connectors/CONNECTING_AN_AGENT.md).

Integration tests against live external APIs are opt-in and skipped by default, so `npm test` never needs live credentials. The environment variables that enable them are named in the test files. A separate throughput script measures `POST /execute`:

```bash
npm run loadtest -- --connections 20 --duration 15
```
