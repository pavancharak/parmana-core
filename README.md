# Parmana

**Every action stays within what your business allowed.** Parmana checks every action, whether a person or a machine takes it, against the limits you set. Then it keeps proof of what happened.

[![CI](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml)
[![CodeQL](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml/badge.svg)](https://github.com/pavancharak/parmana-core/actions/workflows/codeql.yml)
[![License](https://img.shields.io/badge/license-Apache%202.0-blue)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana-core/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15846/badge)](https://www.bestpractices.dev/projects/15846)

## The problem

Companies want AI agents to issue refunds, pay vendors, update CRM deals, merge pull requests and post to team channels. Two questions stop that from reaching production:

- **What may this agent do?** An instruction in a prompt ("only refund up to 500") is not a control. The agent, or whatever text gets injected into it, can ignore it.
- **Can we prove what it did?** Logs written by the same system that acted are a claim, not evidence.

## What Parmana does

Parmana sits between an AI agent and the systems it calls.

- **Before an action:** the request is checked against an explicit, versioned policy, and it needs a signed approval from a person you trust. No approval, no action, reads included ([CLAIMS.md 2.47](docs/CLAIMS.md)).
- **When it runs:** the agent never holds the real credentials. The gateway releases one approved action, once, through a connector.
- **After it runs:** a signed record of what was authorized and what happened. Anyone can verify it offline, without trusting Parmana's servers or database.

Parmana does not decide what the agent should do. It decides whether the agent was allowed to do it, and it proves that decision.

## Find your way around

Start with the goal closest to yours. The full documentation is at [docs.parmanasystems.com](https://docs.parmanasystems.com).

| I want to                                  | Go to                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| See it work, with nothing installed        | [Playground](https://docs.parmanasystems.com/playground)                                                      |
| Understand the ideas behind it             | [How Parmana thinks](https://docs.parmanasystems.com/how-parmana-thinks), then the [glossary](https://docs.parmanasystems.com/glossary) |
| Run it on my own machine                   | [Quickstart](https://docs.parmanasystems.com/quickstart)                                                      |
| Connect an AI agent                        | [Connect an agent](https://docs.parmanasystems.com/guides/connect-an-agent)                                   |
| Use the SDKs                               | [TypeScript quickstart](https://docs.parmanasystems.com/guides/typescript-sdk-quickstart) or [Python quickstart](https://docs.parmanasystems.com/guides/python-sdk-quickstart) |
| Check a record myself, without trusting us | [Verify independently](https://docs.parmanasystems.com/guides/verify-independently)                           |
| Check a record with a standalone tool      | [Parmana Verifier](https://github.com/pavancharak/parmana-verifier), an offline checker with no network access and no account                |
| Review the security model                  | [Security](https://docs.parmanasystems.com/security/overview)                                                 |
| See the evidence behind the claims         | [Reports and evidence](#reports-and-evidence)                                                                  |
| Run it on my own infrastructure            | [Self hosted](https://docs.parmanasystems.com/self-hosted/overview)                                           |
| Choose the right path for my role          | [Choose your path](https://docs.parmanasystems.com/choose-your-path)                                          |

Not sure where to begin? [Choose your path](https://docs.parmanasystems.com/choose-your-path) has one table for developers, operators, auditors and AI agents.

For AI tools, every docs page is listed in [llms.txt](https://docs.parmanasystems.com/llms.txt).

## Quick start

The short version, on Node.js 24 or later with no `.env` file or credentials:

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

- For the step-by-step evaluation guide, see [EVALUATION.md](EVALUATION.md). To try the public sandbox without installing anything, see the [docs playground](https://docs.parmanasystems.com/playground).

## How it works

The chain is **authorize, verify, execute, confirm**. A Business Transaction carries an explicit authority, authorization and intent. A deterministic policy evaluates it and approves or rejects it. An approved transaction executes through a gateway that never lets the caller hold real credentials. The result is signed into an append-only Execution Trust Record, which can be verified without trusting Parmana's runtime or database.

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
                                     (credentials never touch the caller)
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

| Package                        | Role                                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `@parmana/api`                 | REST API: `/execute`, `/verification`, webhooks, caller authentication                                         |
| `@parmana/runtime`             | Orchestrates a Business Transaction through policy, execution and evidence                                     |
| `@parmana/policy`              | Deterministic policy evaluation, sequential rules, first-match semantics                                       |
| `@parmana/execution-gateway`   | The sole boundary that releases an approved request to a connector                                             |
| `@parmana/execution-control`   | Credential-isolating, single-use execution release                                                             |
| `@parmana/connector-sdk`       | Connector authoring contract: capability definitions, schemas, and the Connector and CredentialProvider interfaces |
| `@parmana/envelope-verifier`   | Verifies a Parmana authorization independently, with no trust in Parmana's runtime or database                 |
| `@parmana/crypto`              | Signing and verification: Ed25519 by default, ML-DSA-65 (post-quantum) configurable                            |
| `@parmana/approval`            | Verifies signed approvals issued by a business authority, independent of the caller and of Parmana's runtime   |
| `@parmana/capability-registry` | Binds each capability to the policy that governs it, and refuses a request that names another                  |
| `@parmana/execution-system`    | The interface approved requests are forwarded through, with an HTTP implementation                             |
| `@parmana/connector-*`         | Connectors: HubSpot, GitHub, Slack and Paytm                                                                   |
| `@parmana/governance-ui`       | Internal UI to propose and review policy changes; approval stays on the approver's machine                     |
| `@parmana/replay`              | Deterministic reconstruction of a past policy decision                                                         |
| `@parmana/storage`             | Append-only persistence, in memory or Supabase-backed                                                          |
| `@parmana/shared`              | Domain model and configuration shared across every package                                                     |

Key properties: fail-closed configuration (a misconfigured process refuses to start rather than degrade silently), credential isolation (a connector never receives long-lived credentials, only a single-use session), exactly-once consumption of every authorization and webhook event, append-only signed evidence, and both classical (Ed25519) and post-quantum (ML-DSA-65) signing.

## Reports and evidence

Every report is listed once, here. Start with the question you have.

**Test results**

- **Live CI runs:** every push runs the build, lint, typecheck and test suite. Results for each run are on the [CI workflow page](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml). To reproduce them, see [Quick start](#quick-start).
- **Evaluation scenarios:** the 16 attack scenarios are in [evaluations/scenarios.json](evaluations/scenarios.json). [EVALUATION.md](EVALUATION.md) explains the result.
- **Mutation testing:** [docs/MUTATION-TESTING.md](docs/MUTATION-TESTING.md) breaks the security code on purpose and checks that the tests notice. Fuzz tests send damaged and arbitrary requests, policies and records, and require a clear refusal, never a crash.

**Security**

- **Threat model:** [THREAT-MODEL.md](THREAT-MODEL.md) gives each threat its control, the attack that tests it, and the risk that remains.
- **Security challenge:** [SECURITY-CHALLENGE.md](SECURITY-CHALLENGE.md) describes what counts as breaking Parmana on a copy you run yourself, and credits every confirmed break.
- **Open issues and past incidents:** [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) lists every gap still open, with its evidence and what to do meanwhile. Past incidents and their fixes are recorded there too; see G-24 for an authorization bypass that was found and fixed. The full incident log is in [04-INCIDENTS-LOG.md](04-INCIDENTS-LOG.md).
- **Claims you can check:** [docs/CLAIMS.md](docs/CLAIMS.md) states each claim at the scope its evidence supports, with the code and tests behind it, and lists what is not yet true.
- **Mapped to standards:** the [OWASP mapping](https://docs.parmanasystems.com/security/owasp-mapping) covers the OWASP Top 10 for LLM Applications and for Agentic Applications (2026). The [regulation mapping](https://docs.parmanasystems.com/security/regulation-mapping) covers the EU AI Act, the NIST AI RMF, ISO/IEC 42001 and RBI guidance.
- **Supply chain:** [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core), CodeQL on every change, and signed build provenance for SDK releases and the server image.
- **Reviewed internally:** four internal passes traced the execution path for every registered capability, looking for any action that could run without authorization. The fourth pass found none for the capabilities in production, with the caveats in [CLAIMS.md 2.25](docs/CLAIMS.md). These were internal reviews, not an independent audit.

**Governance**

- **Policy approval log:** [governance/README.md](governance/README.md) describes the hash-chained log of policy change approvals, and how to verify it.

**Paper and comparison**

- **Technical paper:** design, threat model, evaluation and limitations, in [docs/paper/parmana-paper.pdf](docs/paper/parmana-paper.pdf).
- **Compared honestly:** [How Parmana compares](https://docs.parmanasystems.com/how-parmana-compares) sets Parmana beside IAM, API gateways and LLM guardrails, including where it is weaker.

## Status and scope

Assessed at Technology Readiness Level 6 (prototype demonstrated in a relevant environment) on the evidence in [docs/CLAIMS.md](docs/CLAIMS.md). Not claimed: sustained volume, load-bearing production traffic, high availability, or multi-tenant production operation.

The claims file also tracks what has no implementation yet. Adding a connector is a source change today, not a runtime option; see [docs/connectors/BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md).

The HubSpot connector has been run against HubSpot's production API: a deal stage and amount were changed under policy through the signed gateway, then read back and reverted ([CLAIMS.md 3.10](docs/CLAIMS.md)).

## Running it

- **Production:** [Deploy to production](https://docs.parmanasystems.com/deployment/production) covers the required configuration, the fail-closed startup checks, and how to confirm a deployment.
- **Your own infrastructure:** [Self hosted](https://docs.parmanasystems.com/self-hosted/overview) covers running it with Docker Compose.
- **The hosted instance:** [Live API and demos](https://docs.parmanasystems.com/guides/live-api-and-demos) covers authentication, the request shape, the deployed policies and offline verification.
- **Connecting an agent:** [docs/connectors/CONNECTING_AN_AGENT.md](docs/connectors/CONNECTING_AN_AGENT.md).

Integration tests against HubSpot's real API are opt-in and skipped by default, so `npm test` never needs live credentials. The environment variables that enable them are named in the test files. A separate throughput script measures `POST /execute`:

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

Parmana is licensed under the [Apache License, Version 2.0](./LICENSE). The trademark terms are in [NOTICE](./NOTICE). Citing Parmana: [CITATION.cff](CITATION.cff), or **Cite this repository** on GitHub.

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

**New here? Start with [The Parmana Handbook](https://docs.parmanasystems.com/handbook/overview).** It covers every capability in this codebase in 23 chapters, and is also available as a [PDF](https://docs.parmanasystems.com/handbook/download).

[docs/README.md](docs/README.md) indexes the rest of the repository documentation: the claims register, the gap log, what is left to do, and the architecture decisions. To add a connector, start with [CONNECTOR_ISOLATION.md](docs/architecture/CONNECTOR_ISOLATION.md) and [BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md).
