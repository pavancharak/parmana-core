# Parmana

> **Under intense development. Not ready for public use.** Interfaces, policies and storage formats may change without notice.

[![CI](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana-core/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15846/badge)](https://www.bestpractices.dev/projects/15846)

**The Institutional Authority Layer for Autonomous Systems.** Make sure every action stays within what your institution allows.

AI agents propose and start actions. Institutions decide what authority to delegate. Parmana checks each action against that authority before it runs, and keeps signed evidence that anyone can verify.

Identity establishes who is acting. Access controls establish what an agent can reach. Institutional authority establishes what the institution has actually delegated. Cryptographic evidence proves what happened.

Access is not authority. An agent can be allowed into a system and still not be allowed to make a particular decision in it.

## The problem

Institutions are letting AI agents take actions that used to need a person: issuing refunds, paying vendors, changing records and infrastructure, and calling partners' systems. Two questions stand between that and production:

- **Is this action within what we delegated?** An instruction in a prompt ("only refund up to 500") is not a control. The agent, or any text injected into it, can ignore it. Access controls answer who can reach a system. They do not answer whether this action, for this amount, is within the authority the institution gave.
- **Can we prove what happened?** Logs written by the same system that acted are a claim, not evidence.

## How Parmana works

Parmana sits between any caller and the systems it calls, in four stages:

1. **Declared.** The institution writes its authority as explicit, versioned rules: what each action may do, up to what amount, and when a named person must approve it.
2. **Authorized.** Each proposed action is checked against those rules. If no rule matches, the action is refused. A rule that needs a person waits for a signed approval for that exact action, from a trusted approver, usable once.
3. **Executed.** Only permitted actions pass the enforcement boundary. On the supported paths, the gateway holds the connector credentials, so an agent calling the HTTP API never receives them, and it releases each approved action once.
4. **Proven.** A signed record of the decision and the release. Anyone can verify it offline, using only the public key they choose to trust.

Parmana does not decide what the agent should do. It decides whether the agent was allowed to do it, and it records that decision.

Parmana is not an AI model or an agent. It does not replace identity and access management, AI security or AI governance. It sits after them, in front of the actions an agent takes. [How Parmana compares](docs/site/how-parmana-compares.mdx) sets out the difference.

## Key features

- **Explicit authority:** versioned policies, evaluated on every action. If no rule matches, the action is refused.
- **Signed human approvals:** an action that needs sign-off waits for a signature from a trusted approver, for that action and resource, usable once.
- **Per-agent authority grants:** a grant names one agent, one capability, optional limits and an expiry. Grants are opt-in per policy, and no shipped policy requires one yet.
- **Credential isolation:** connector credentials stay inside the gateway on supported paths.
- **Two-person rule changes:** a change to a policy, an approver or a connector is proposed by one person and approved by a different person, with a step-up signature.
- **Signed, offline-verifiable records:** an audit trail that does not depend on the system that acted.
- **Operator stop:** a kill switch that refuses new execution and survives restarts. It does not recall actions already released, and it stops every caller at once, not one agent.
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

| Topic                              | Read                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| What it does, and its limits       | [docs/dev/OVERVIEW.md](docs/dev/OVERVIEW.md)                                                                                             |
| Architecture                       | [docs/dev/ARCHITECTURE.md](docs/dev/ARCHITECTURE.md)                                                                                     |
| Connect a system you run           | [docs/dev/CONNECTORS.md](docs/dev/CONNECTORS.md)                                                                                         |
| Packages, SDKs and CLI             | [docs/dev/PACKAGES.md](docs/dev/PACKAGES.md)                                                                                             |
| Tests, evidence and status         | [docs/dev/STATUS-AND-EVIDENCE.md](docs/dev/STATUS-AND-EVIDENCE.md)                                                                       |
| Essay: can our tests be trusted?   | [docs/essays/why-we-are-testing-whether-our-tests-can-be-trusted.md](docs/essays/why-we-are-testing-whether-our-tests-can-be-trusted.md) |
| Contributing, security and license | [docs/dev/COMMUNITY.md](docs/dev/COMMUNITY.md)                                                                                           |
| Everything, indexed                | [docs/dev/README.md](docs/dev/README.md)                                                                                                 |

Hosted docs: [docs.parmanasystems.com](https://docs.parmanasystems.com).

## Status and limits

Parmana is a prototype. Its limits are stated up front:

- It checks only actions that leave through its gateway. It does not yet check an agent that calls one of your systems directly.
- It does not read or judge the text a model produces. It limits what an agent can do, not what it says.
- Code on the same host that can read the server's environment can still read connector credentials.

Every claim about what Parmana does, with its evidence and known gaps, is listed in [docs/internal/CLAIMS.md](docs/internal/CLAIMS.md). Current status is in [docs/dev/STATUS-AND-EVIDENCE.md](docs/dev/STATUS-AND-EVIDENCE.md).

## Contributing, security and license

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first. To report a vulnerability, follow [SECURITY.md](SECURITY.md), and do not open a public issue. Licensed under [Apache 2.0](LICENSE).
