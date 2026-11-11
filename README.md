# Parmana

**Parmana makes sure every caller takes only the actions your business has approved, even when they could technically do more.** It checks every action, whether a person or a machine takes it, against the limits you set, and it keeps proof of what happened.

[![CI](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana-core/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15846/badge)](https://www.bestpractices.dev/projects/15846)

## The problem

Companies want AI agents to issue refunds, pay vendors, update CRM deals, merge pull requests and post to team channels. Two questions stand between that and production:

- **What may this agent do?** An instruction in a prompt ("only refund up to 500") is not a control. The agent, or any text injected into it, can ignore it.
- **Can we prove what it did?** Logs written by the same system that acted are a claim, not evidence.

## What Parmana does

Parmana sits between any caller (an AI agent, an application or a person) and the systems it calls.

- **Before an action:** the request is checked against an explicit, versioned policy, and it needs a signed approval from a person you trust. No approval, no action, reads included ([CLAIMS.md 2.47](docs/internal/CLAIMS.md)).
- **When it runs:** on the supported paths, the gateway resolves connector credentials, and an agent calling the HTTP API never receives them. Code on the same host that can read the server's environment can still read those credentials ([G-128](docs/internal/VERIFICATION-GAPS.md)). The gateway releases one approved action, once, through a connector.
- **After it runs:** a signed record of what was authorized and what happened. Anyone can verify it offline, using only the public key they choose to trust. The verifier cannot prove that the key belongs to Parmana.

Parmana does not decide what the agent should do. It decides whether the agent was allowed to do it, and it records that decision in a signed record that anyone can check with the verifier.

Parmana checks actions that leave through its gateway. It does not check an agent run by a customer or a partner that calls one of your systems directly. That path is not covered yet; see [G-129](docs/internal/VERIFICATION-GAPS.md) and [RFC-0024](docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md).

## Why the claims matter

Every statement about what Parmana does is written down in [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md). Each claim is numbered, states the scope its evidence supports, names the code and tests behind it, and lists what is not yet true. Changes to claims are tracked in [docs/internal/CLAIMS-CHANGELOG.md](docs/internal/CLAIMS-CHANGELOG.md), so a change to a claim appears in review, not silently in a README.

This matters for three reasons:

- **You check a claim instead of trusting a pitch.** Each claim points to its evidence. If the evidence covers only part of the claim, the claim says so.
- **The limits sit next to the claim.** Where a control has a known gap, the claim names it and links to the gap log, so you see the boundary before you rely on it.
- **A claim that fails can be challenged.** A challenge is recorded against the claim under [RFC-0022](docs/internal/rfcs/RFC-0022-Challenge-Record.md), so disagreement becomes a tracked item, not an argument in a comment thread.

## Find your way around

Start with the goal closest to yours. The full documentation is at [docs.parmanasystems.com](https://docs.parmanasystems.com).

| I want to                                  | Go to                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Understand the ideas behind it             | [How Parmana thinks](https://docs.parmanasystems.com/how-parmana-thinks), then the [glossary](https://docs.parmanasystems.com/glossary)                                        |
| Run it on my own machine                   | [Quickstart](https://docs.parmanasystems.com/quickstart)                                                                                                                       |
| Connect an AI agent                        | [Connect an agent](https://docs.parmanasystems.com/guides/connect-an-agent)                                                                                                    |
| Use the SDKs                               | [TypeScript quickstart](https://docs.parmanasystems.com/guides/typescript-sdk-quickstart) or [Python quickstart](https://docs.parmanasystems.com/guides/python-sdk-quickstart) |
| Run the command-line tool                  | [Command-line tool](packages/cli/README.md): install with npm or run the container image                                                                                       |
| Check a record myself, without trusting us | [Verify independently](https://docs.parmanasystems.com/guides/verify-independently)                                                                                            |
| Check a record with a standalone tool      | [Parmana Verifier](https://github.com/pavancharak/parmana-verifier), an offline checker with no network access and no account                                                  |
| Review the security model                  | [Security](https://docs.parmanasystems.com/security/overview)                                                                                                                  |
| See the evidence behind the claims         | [Reports and evidence](#reports-and-evidence)                                                                                                                                  |
| Connect a system I run                     | [Connect any external system](https://docs.parmanasystems.com/guides/connect-any-external-system), and [connecting a system you run](#connecting-a-system-you-run) below       |
| Run it on my own infrastructure            | [Self hosted](https://docs.parmanasystems.com/self-hosted/overview)                                                                                                            |
| Choose the right path for my role          | [Choose your path](https://docs.parmanasystems.com/choose-your-path)                                                                                                           |

Not sure where to begin? [Choose your path](https://docs.parmanasystems.com/choose-your-path) has one table for developers, operators, auditors and AI agents.

For AI tools, every docs page is listed in [llms.txt](https://docs.parmanasystems.com/llms.txt).

## Quick start

On Node.js 24 or later, with no `.env` file and no credentials:

```bash
npm ci
npm run build
npm test
npm run examples
npm run evaluate
```

- `npm run evaluate` runs the 16 attack scenarios in [evaluations/scenarios.json](evaluations/scenarios.json) and reports whether each was blocked. [EVALUATION.md](EVALUATION.md) explains the result.
- To see the whole chain against a local mock connector, with no network access or credentials:

  ```bash
  npx tsx examples/tutorials/60-end-to-end-enterprise-execution/run.ts
  ```

- For the step-by-step evaluation guide, see [EVALUATION.md](EVALUATION.md).

### Run a local server in one command

To build against Parmana on your own machine, run `npm run dev:setup`. The first run creates the signing keys, a local approver key and a caller key, then starts the server at `http://localhost:3000`. It is for local development only. Full details, including how to use the keys, are on the [local development page](https://docs.parmanasystems.com/guides/local-development).

## Run it locally

Pick the path that matches what you want to see. All three run on your own machine and send nothing to a hosted service.

| Path                  | Command                                                  | What you get                                                                  | Needs                 |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------- |
| 1. Check the code     | `npm ci && npm run build && npm test && npm run evaluate` | Build, tests and the 16 attack scenarios. No server.                          | Node.js 24            |
| 2. Local API server   | `npm run dev:setup`                                      | API at `http://localhost:3000`, with local signing and caller keys generated. | Node.js 24            |
| 3. Self-hosted stack  | `docker compose up -d`                                   | API and its own Postgres, started together, on `127.0.0.1:3000`.              | Docker with Compose   |

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

- *Port 3000 is in use.* Stop the other process, or for Path 3 set `PARMANA_PORT` to another port.
- *Node version errors.* Check `node -v` shows 24 or later. Use `nvm use` or install Node 24.
- *Docker stack stops at migrate or seed.* Run `docker compose logs migrate seed` to see the failing step.

**Windows.** Path 3 needs Docker Desktop. The setup script checks for Windows shells, so Paths 1 and 2 may work natively with Node.js 24, but this has not been tested. If you hit a problem, running the repo inside WSL 2 is the safer option, and an issue with the output helps us fix the native path.

## How it works

The chain is **authorize, verify, execute, confirm**. A Business Transaction carries an explicit authority, authorization and intent. A deterministic policy evaluates it and approves or rejects it. An approved transaction executes through a gateway that never gives the caller real credentials. The result is signed into an append-only Execution Trust Record, which can be verified without trusting Parmana's runtime or database.

```
Authority --> Authorization --> Intent --> Business Transaction
                                                  |
                                                  v
                                          Policy Engine (deterministic)
                                                  |
                                                  v
                                              Decision
                                                  |
                                                  v
                                          Execution Gateway
                                     (credentials are not returned to the caller)
                                                  |
                                                  v
                                        Connector -> real system
                                                  |
                                                  v
                              Execution Trust Record (signed, append-only)
                                                  |
                                                  v
                                Verification  <-->  Settlement Confirmation
```

| Package                        | Role                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@parmana/api`                 | REST API: `/execute`, `/verification`, webhooks, caller authentication                                                                   |
| `@parmana/runtime`             | Orchestrates a Business Transaction through policy, execution and evidence                                                               |
| `@parmana/policy`              | Deterministic policy evaluation, sequential rules, first-match semantics                                                                 |
| `@parmana/execution-gateway`   | The sole boundary that releases an approved request to a connector                                                                       |
| `@parmana/execution-control`   | Credential-isolating, single-use execution release                                                                                       |
| `@parmana/connector-sdk`       | Connector authoring contract: capability definitions, schemas, and the Connector and CredentialProvider interfaces                       |
| `@parmana/envelope-verifier`   | Verifies a Parmana authorization independently, with no trust in Parmana's runtime or database                                           |
| `@parmana/crypto`              | Signing and verification: Ed25519 by default; ML-DSA-65 (post-quantum) in the Node packages, which need Node 24 and OpenSSL 3.5 or later |
| `@parmana/approval`            | Verifies signed approvals issued by a business authority, independent of the caller and of Parmana's runtime                             |
| `@parmana/capability-registry` | Binds each capability to the policy that governs it, and refuses a request that names another                                            |
| `@parmana/execution-system`    | The interface approved requests are forwarded through, with an HTTP implementation                                                       |
| `@parmana/governance-ui`       | Internal UI to propose and review policy changes; approval stays on the approver's machine                                               |
| `@parmana/replay`              | Deterministic reconstruction of a past policy decision                                                                                   |
| `@parmana/storage`             | Append-only persistence, in memory or PostgreSQL-backed                                                                                  |
| `@parmana/shared`              | Domain model and configuration shared across every package                                                                               |

Key properties:

- **Fail-closed configuration:** a misconfigured process refuses to start rather than degrade silently.
- **Credential isolation:** a connector never receives long-lived credentials, only a single-use session.
- **Single-use authorizations:** a nonce is accepted once.
- **Append-only signed evidence**, with both classical (Ed25519) and post-quantum (ML-DSA-65, in the Node packages) signing.

## How external systems connect

Parmana sits between the parties that want an action and the systems the action changes. Three roles connect to it.

| Role                    | Connects to                           | How                                                                                                                                                       |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents, apps and people | Parmana core                          | The HTTP API (`/execute`, `/policies/in-effect`, approvals), the TypeScript and Python SDKs, or the MCP tools in parmana-connect, which call the same API |
| Approvers               | Parmana core                          | Signed approvals through maker and checker. The signing key stays on the approver's machine                                                               |
| Connectors              | Parmana core, and the business system | Parmana releases an approved action to the connector as a signed release. The connector calls the business system with its own credentials                |

```
Agent / app / person
  |  request (HTTP API, SDK or MCP)
  v
Parmana core: policy, approval, signed decision, trust record
  |  signed release, only for an approved action
  v
Connector: verifies signature, audience, expiry and replay
  |  call with the connector's own credentials
  v
Business system (CRM, payments, chat ...)
  |  result returns: connector -> core (recorded) -> caller
```

These rules hold at every step:

- A business system never calls Parmana, and a caller never calls a connector or a business system directly.
- Parmana core does not hold the credentials for a business system that an external connector serves.
- A connector runs only an action that Parmana has approved and signed for it, and it runs that action once. A repeated release with the same transaction id gets the first answer back, and the action does not run again.

**Current state.** Built-in connectors are not in this repository. They moved to connector services outside it; see [ADR-0018](docs/internal/adr/ADR-0018-Connectors-Outside-Core.md). New connectors are built outside this repository and are registered through the flow described below.

## Reads, writes and executions

Parmana gates every kind of action the same way. A read, a write, or an execution runs only after a signed human approval, and reads included: a policy rule that approves an action must require that approval.

The action is carried out by an external connector, not by this repository. Parmana releases the approved action to the connector's endpoint as a signed release, and the connector performs the HTTP call its manifest declares. A capability marked `effect: read` must use `GET`. That rule is in [parmana-connect](https://github.com/pavancharak/parmana-connect), and it is not yet merged to its `main` branch (G-156). The external path has not yet been run against a deployed Parmana (G-133).

## Connecting a system you run

An operator registers an **external connector**: a capability, the HTTPS endpoint that serves it, and the policy that governs it. One person proposes the registration, and a different person approves it with a step-up signature. Once active, Parmana sends each approved action to the endpoint as a signed release. The endpoint checks the release's signature and audience, and it needs no shared secret.

- [Connect any external system](https://docs.parmanasystems.com/guides/connect-any-external-system): the full order of steps.
- [The parmana-connect service](https://docs.parmanasystems.com/connectors/parmana-connect): a ready-made endpoint that verifies releases and runs a manifest's HTTP call. Its source is in [pavancharak/parmana-connect](https://github.com/pavancharak/parmana-connect).
- [ADR-0013](docs/internal/adr/ADR-0013-Generic-External-Connector.md): the decision record, with its alternatives and limits.

## Reports and evidence

Every report is listed once, here. Start with the question you have.

**Test results**

- **Live CI runs:** every push runs the build, lint, typecheck and test suite. Results for each run are on the [CI workflow page](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml). To reproduce them, see [Quick start](#quick-start).
- **Evaluation scenarios:** the 16 attack scenarios are in [evaluations/scenarios.json](evaluations/scenarios.json). [EVALUATION.md](EVALUATION.md) explains the result.
- **Mutation testing:** [docs/internal/testing/MUTATION-TESTING.md](docs/internal/testing/MUTATION-TESTING.md) breaks the security code on purpose and checks that the tests notice. Fuzz tests send damaged and arbitrary requests, policies and records, and require a clear refusal, never a crash.

**Security**

- **Threat model:** [THREAT-MODEL.md](THREAT-MODEL.md) gives each threat its control, the attack that tests it, and the risk that remains.
- **Security challenge:** [SECURITY-CHALLENGE.md](SECURITY-CHALLENGE.md) describes what counts as breaking Parmana on a copy you run yourself, and credits every confirmed break.
- **Open issues and past incidents:** [docs/internal/VERIFICATION-GAPS.md](docs/internal/VERIFICATION-GAPS.md) lists every gap still open, with its evidence and what to do meanwhile. Past incidents and their fixes are recorded there too; see G-24 for an authorization bypass that was found and fixed. The full incident log is in [04-INCIDENTS-LOG.md](04-INCIDENTS-LOG.md).
- **Claims you can check:** [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md) states each claim at the scope its evidence supports, with the code and tests behind it, and lists what is not yet true.
- **Mapped to standards:** the [OWASP mapping](https://docs.parmanasystems.com/security/owasp-mapping) covers the OWASP Top 10 for LLM Applications and for Agentic Applications (2026). The [regulation mapping](https://docs.parmanasystems.com/security/regulation-mapping) covers the EU AI Act, the NIST AI RMF, ISO/IEC 42001 and RBI guidance.
- **Supply chain:** [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core), CodeQL on every change, and signed build provenance for SDK releases, the server image and the command-line tool's container image.
- **Reviewed internally:** four internal passes traced the execution path for every registered capability, looking for any action that could run without authorization. The fourth pass found none for the capabilities in production, with the caveats in [CLAIMS.md 2.25](docs/internal/CLAIMS.md). These were internal reviews, not an independent audit.

**Governance**

- **Policy approval log:** [governance/README.md](governance/README.md) describes the hash-chained log of policy change approvals, and how to verify it.

**Third-party listing**

- **AgenTrust:** the `parmana-server` integration is listed in the AgenTrust integrations repository at tier `verified` (read 2026-10-29). That tier covers the offline fixture path only: the connector results are mocks, and no conformance level is claimed. See [CLAIMS.md 3.23](docs/internal/CLAIMS.md) and the [AgenTrust refund evaluation](docs/internal/evaluation/agentrust-refund/README.md).

**Paper and comparison**

- **Technical paper:** design, threat model, evaluation and limitations, in [docs/internal/paper/parmana-paper.pdf](docs/internal/paper/parmana-paper.pdf).
- **Compared honestly:** [How Parmana compares](https://docs.parmanasystems.com/how-parmana-compares) sets Parmana beside IAM, API gateways and LLM guardrails, including where it is weaker.

## Status and scope

Assessed at Technology Readiness Level 6 (prototype demonstrated in a relevant environment) on the evidence in [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md). Not claimed: sustained volume, load-bearing production traffic, high availability, or multi-tenant production operation.

The claims file also tracks what has no implementation yet. Vendor connectors no longer live in this repository. They moved to connector services outside it under [ADR-0018](docs/internal/adr/ADR-0018-Connectors-Outside-Core.md). An external connector is registered through maker and checker approval, with no deploy, as [ADR-0013](docs/internal/adr/ADR-0013-Generic-External-Connector.md) describes. A connector built into the source is described in [docs/internal/connectors/BUILDING_A_CONNECTOR.md](docs/internal/connectors/BUILDING_A_CONNECTOR.md).

## Packages

The SDKs, the verifier and the command-line tool are published at version 2.0.1. All of them share one version.

| Package                  | Registry | Install                              |
| ------------------------ | -------- | ------------------------------------ |
| `@parmana/sdk`           | npm      | `npm install @parmana/sdk`           |
| `parmana`                | PyPI     | `pip install parmana`                |
| `@parmana/connector-sdk` | npm      | `npm install @parmana/connector-sdk` |
| `parmana-connector-sdk`  | PyPI     | `pip install parmana-connector-sdk`  |
| `@parmana/verifier`      | npm      | `npm install -g @parmana/verifier`   |
| `parmana-verifier`       | PyPI     | `pip install parmana-verifier`       |
| `@parmana/cli`           | npm      | `npm install -g @parmana/cli`        |

The command-line tool is also published as a container image, `ghcr.io/pavancharak/parmana-cli:2.0.1`. See [packages/cli/README.md](packages/cli/README.md) for how to run it.

The verifier lives in its own repository, [pavancharak/parmana-verifier](https://github.com/pavancharak/parmana-verifier). The release history for the SDKs is in the [changelog](https://docs.parmanasystems.com/changelog).

## Running it

- **Production:** [Deploy to production](https://docs.parmanasystems.com/deployment/production) covers the required configuration, the fail-closed startup checks, and how to confirm a deployment.
- **Your own infrastructure:** [Self hosted](https://docs.parmanasystems.com/self-hosted/overview) covers running it with Docker Compose.
- **The hosted instance:** [Live API and demos](https://docs.parmanasystems.com/guides/live-api-and-demos) covers authentication, the request shape, the deployed policies and offline verification.
- **Connecting an agent:** [docs/internal/connectors/CONNECTING_AN_AGENT.md](docs/internal/connectors/CONNECTING_AN_AGENT.md).

Integration tests against live external APIs are opt-in and skipped by default, so `npm test` never needs live credentials. The environment variables that enable them are named in the test files. A separate throughput script measures `POST /execute`:

```bash
npm run loadtest -- --connections 20 --duration 15
```

## Contributing and security

- **Contributing:** pull requests from outside Parmana Systems are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Every commit needs a `Signed-off-by` line (`git commit -s`) under the [Developer Certificate of Origin](https://developercertificate.org).
- **Security:** do not open a public issue for a vulnerability. Report it privately, as [SECURITY.md](SECURITY.md) describes.
- **Conduct:** everyone in issues, pull requests and other project spaces follows the [Code of Conduct](CODE_OF_CONDUCT.md).
- **Questions and ideas:** [GitHub Discussions](https://github.com/pavancharak/parmana-core/discussions). **Bugs:** [GitHub Issues](https://github.com/pavancharak/parmana-core/issues).

## Work with us

We are looking for a small number of design partners: teams with a real agent use case that touches money or a system of record. You get direct help from the founder to put Parmana in front of that workflow, policies written with you, and a say in what gets built next. We ask for a real integration under real constraints, and honest feedback.

Email **founder@parmanasystems.com** with a line about your use case. The website is [parmanasystems.com](https://parmanasystems.com/).

## License

Parmana is licensed under the [Apache License, Version 2.0](LICENSE). The trademark terms are in [NOTICE](NOTICE). To cite Parmana, use [CITATION.cff](CITATION.cff), or **Cite this repository** on GitHub.

Copyright (c) 2026 Parmana Systems Private Limited.

## Read the Parmana blog

The [Parmana blog](https://blog.parmanasystems.com) explains the product, the evidence and the open limits in plain terms. Read the post for your role:

- **Business leaders:** [What AI spending limits mean for your business](https://blog.parmanasystems.com/2026/10/25/what-ai-limits-mean-for-your-business/). Why limits must sit outside the AI, and what proof to ask for.
- **Engineers:** [Run the checks in an afternoon](https://blog.parmanasystems.com/2026/10/25/run-the-checks-in-an-afternoon/). Build, test, run the attack scenarios and verify a record.
- **Auditors and risk teams:** [Check a record offline, without trusting us](https://blog.parmanasystems.com/2026/10/25/check-a-record-offline/). How to verify a signed record with only a file and a trust file.
- **Buyers and evaluators:** [How to choose a control for AI actions](https://blog.parmanasystems.com/2026/10/25/how-to-choose-an-ai-action-control/). Seven questions to ask any vendor.
- **Anyone who wants the honest picture:** [Lessons from the limits we still have](https://blog.parmanasystems.com/2026/10/25/lessons-from-the-limits-we-still-have/). What we got wrong, and what remains open.

New posts are published regularly, so check the blog for updates.

## Documentation

**New here? Start with [The Parmana Handbook](https://docs.parmanasystems.com/handbook/overview).** It covers every capability in this codebase in 22 chapters, and is also available as a [PDF](https://docs.parmanasystems.com/handbook/download).

The documentation lives in two places:

- **[docs/site/](docs/site/)** is the public documentation: guides, concepts, the SDK reference and the handbook. It is published at [docs.parmanasystems.com](https://docs.parmanasystems.com).
- **[docs/internal/](docs/internal/)** holds the maintainer records: the claims register, the gap log, the architecture decisions (ADRs), the design proposals (RFCs), the operator runbooks and the test notes. [docs/README.md](docs/README.md) is the index to these.

Three indexes in [docs/internal/indexes/](docs/internal/indexes/) answer common questions in one table each:

- **[verification-gaps-index.md](docs/internal/indexes/verification-gaps-index.md)**: every gap in the gap log, with its status.
- **[claims-index.md](docs/internal/indexes/claims-index.md)**: every claim in the claims register, with the gaps each one mentions.
- **[adr-rfc-index.md](docs/internal/indexes/adr-rfc-index.md)**: every decision record and proposal, with its status.

To add a connector, start with [CONNECTOR_ISOLATION.md](docs/internal/architecture/CONNECTOR_ISOLATION.md) and [BUILDING_A_CONNECTOR.md](docs/internal/connectors/BUILDING_A_CONNECTOR.md).
