# Parmana

[![CI](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana-core/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15846/badge)](https://www.bestpractices.dev/projects/15846)

**Parmana makes sure every caller takes only the actions your business has approved, even when they could technically do more.**

Parmana is an open-source authorization gate for actions. Whether a person, an application or an AI agent is acting, Parmana checks the action against the limits you set, requires a signed approval where your policy needs one, and keeps a signed record of what was authorized and what happened.

## The problem

Companies want AI agents to issue refunds, pay vendors, update CRM deals, merge pull requests and post to team channels. Two questions stand between that and production:

- **What may this agent do?** An instruction in a prompt ("only refund up to 500") is not a control. The agent, or any text injected into it, can ignore it.
- **Can we prove what it did?** Logs written by the same system that acted are a claim, not evidence.

## What Parmana does

Parmana sits between any caller and the systems it calls.

- **Before an action:** the request is checked against an explicit, versioned policy. Where policy requires it, a signed approval from a trusted person is needed. No approval, no action, reads included.
- **When it runs:** on the supported paths, the gateway resolves connector credentials, so an agent calling the HTTP API never receives them. The gateway releases one approved action, once, through a connector.
- **After it runs:** a signed record of what was authorized and what happened. Anyone can verify it offline, using only the public key they choose to trust.

Parmana does not decide what the agent should do. It decides whether the agent was allowed to do it, and it records that decision.

## Key features

- **Policy checks:** versioned, explicit policies evaluated on every action.
- **Signed approvals:** actions that need sign-off wait for a signature from a key you trust.
- **Credential isolation:** connector credentials stay inside the gateway on supported paths.
- **Signed, offline-verifiable records:** an audit trail that does not depend on the system that acted.
- **Connectors:** a way to connect the systems you run. See [CONNECTORS.md](docs/dev/CONNECTORS.md).
- **APIs and SDKs:** an HTTP API with an OpenAPI spec, a TypeScript package, a Python SDK, and a CLI. See [PACKAGES.md](docs/dev/PACKAGES.md).
- **Evaluations and tests:** an evaluation suite, Vitest tests, and mutation testing with Stryker.

## Quick start

Needs Node.js 24 or later. No `.env` file or credentials are required.

```bash
npm ci
npm run build
npm test
npm run evaluate
```

Other ways to run it, including a local server and Docker: [docs/dev/RUNNING.md](docs/dev/RUNNING.md).

## Repository layout

| Path                                                        | Contents                                               |
| ----------------------------------------------------------- | ------------------------------------------------------ |
| `packages/`                                                 | Core workspace packages, including the API server      |
| `typescript/`                                               | TypeScript SDK                                         |
| `python/`, `python-connector-sdk/`                          | Python SDK and connector SDK                           |
| `openapi/`, `schemas/`, `postman/`                          | API specification, JSON schemas and Postman collection |
| `supabase/`, `docker/`, `docker-compose.yml`, `Dockerfile*` | Database and container deployment files                |
| `scripts/`, `tests/`, `evaluations/`                        | Build, verification and test tooling                   |
| `docs/`                                                     | Developer and internal documentation                   |
| `governance/`, `policies/`, `proof-audit/`                  | Governance, policy and audit material                  |

The project uses npm workspaces with TypeScript and Vitest. Its scripts are defined in [package.json](package.json).

## Learn more

| Topic                              | Read                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| What it does, and its limits       | [docs/dev/OVERVIEW.md](docs/dev/OVERVIEW.md)                                                                               |
| Architecture                       | [docs/dev/ARCHITECTURE.md](docs/dev/ARCHITECTURE.md)                                                                       |
| Connect a system you run           | [docs/dev/CONNECTORS.md](docs/dev/CONNECTORS.md)                                                                           |
| Packages, SDKs and CLI             | [docs/dev/PACKAGES.md](docs/dev/PACKAGES.md)                                                                               |
| Tests, evidence and status         | [docs/dev/STATUS-AND-EVIDENCE.md](docs/dev/STATUS-AND-EVIDENCE.md)                                                         |
| Essay: can our tests be trusted?   | [docs/essays/why-we-are-testing-whether-our-tests-can-be-trusted.md](docs/essays/why-we-are-testing-whether-our-tests-can-be-trusted.md) |
| Contributing, security and license | [docs/dev/COMMUNITY.md](docs/dev/COMMUNITY.md)                                                                             |
| Everything, indexed                | [docs/dev/README.md](docs/dev/README.md)                                                                                   |

Hosted docs: [docs.parmanasystems.com](https://docs.parmanasystems.com).

## Status and limits

Parmana is a prototype. Its limits are stated up front:

- It checks only actions that leave through its gateway. It does not yet check an agent that calls one of your systems directly.
- Code on the same host that can read the server's environment can still read connector credentials.

Every claim about what Parmana does, with its evidence and known gaps, is listed in [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md). Current status is in [docs/dev/STATUS-AND-EVIDENCE.md](docs/dev/STATUS-AND-EVIDENCE.md).

## Contributing, security and license

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a vulnerability, follow [SECURITY.md](SECURITY.md), and do not open a public issue. Licensed under [Apache 2.0](LICENSE).
