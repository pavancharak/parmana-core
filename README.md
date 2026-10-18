# Parmana

**Let AI agents act on real systems: every action needs policy approval and a
person's signed approval before it runs, and leaves a signed record anyone can
verify afterwards.**

[![CI](https://github.com/pavancharak/parmana/actions/workflows/ci.yml/badge.svg)](https://github.com/pavancharak/parmana/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-proprietary-lightgrey)](./LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D24.6-brightgreen)](package.json)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/pavancharak/parmana/badge)](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana)
[![OpenSSF Best Practices](https://www.bestpractices.dev/projects/15230/badge)](https://www.bestpractices.dev/projects/15230)

> **Proprietary software evaluation only.** This repository is source-available
> for evaluation purposes. No license is granted to use, copy, modify, or
> distribute this software, in whole or in part, without a separate written
> agreement with Parmana Systems. See [LICENSE](./LICENSE). The client SDKs
> and connector SDKs are the exception: they are Apache 2.0 (see [License](#license)).

## The problem

Companies want AI agents to issue refunds, pay vendors, update CRM deals, merge
pull requests and post to team channels. Two questions stop that from reaching
production:

- **What is this agent allowed to do?** An instruction in a prompt ("only refund
  up to 500") is not a control. The agent, or whoever injects text into it, can
  ignore it.
- **Can we prove what it did?** Logs written by the same system that acted are a
  claim, not evidence.

## What Parmana does

Parmana sits between an AI agent and the systems it calls.

- **Before an action:** the request is checked against an explicit, versioned
  policy, and it needs a signed approval from a person you trust. No approval, no
  action, reads included ([CLAIMS.md 2.47](docs/CLAIMS.md)).
- **When it runs:** the agent never holds the real credentials. Parmana's gateway
  releases one approved action, once, through a connector.
- **After it runs:** a signed record of what was authorized and what happened,
  which anyone can verify offline without trusting Parmana's servers or database.

Parmana does not decide what the agent should do. It decides, and proves, whether
the agent was allowed to do it.

## Who it is for

- **Teams putting agents near money:** refunds, payouts, vendor payments.
- **Teams letting agents change systems of record:** CRM, code repositories,
  internal tools.
- **Security, risk and compliance teams** who have to sign off on what an agent
  may do, and **auditors** who need evidence rather than assurances.

## Why it holds up to review

- **Claims you can check.** [docs/CLAIMS.md](docs/CLAIMS.md) states each claim at
  the scope its evidence supports, with the code and tests behind it, and lists
  what is not yet true.
- **A threat model with its gaps.** [THREAT-MODEL.md](THREAT-MODEL.md) gives each
  threat its control, the attack that tests it and the risk that remains.
- **A standing challenge.** [SECURITY-CHALLENGE.md](SECURITY-CHALLENGE.md) lists
  what counts as breaking Parmana on a copy you run yourself, and credits every
  confirmed break.
- **Attacks you can run.** `npm run evaluate` runs 16 attacks (replay, forgery,
  acting without a signed approval, policy substitution, gateway bypass, record
  tampering and more) and reports each one blocked or not, tied to the commit.
- **Tests that are tested.** Mutation testing deliberately breaks the security
  code and checks the tests notice; the scores and the gaps it found are in
  [docs/MUTATION-TESTING.md](docs/MUTATION-TESTING.md). Fuzz tests send damaged
  and arbitrary requests, policies and records, and require a clear refusal,
  never a crash.
- **Mapped to OWASP.** Each risk in the OWASP Top 10 for LLM Applications and
  for Agentic Applications (2026), with what Parmana does, the evidence, and what
  it leaves to you: [OWASP mapping](https://docs.parmanasystems.com/security/owasp-mapping).
- **Compared honestly.** Parmana next to IAM, API gateways and LLM guardrails,
  including where it is weaker: [How Parmana compares](https://docs.parmanasystems.com/how-parmana-compares).
- **Technical paper.** Design, threat model, evaluation and limitations:
  [Technical paper](https://docs.parmanasystems.com/evaluation/paper)
  ([PDF](docs/paper/parmana-paper.pdf)). A talk ([slides, PDF](docs/paper/parmana-talk-slides.pdf)) and demo video scripts:
  [Talk and demo videos](https://docs.parmanasystems.com/evaluation/talk-and-videos).
- **Applied to public incidents.** Three reported AI agent incidents, what Parmana
  would and would not have changed: [Case studies](https://docs.parmanasystems.com/evaluation/case-studies).
- **Mapped to regulation.** How Parmana supports human oversight and record
  keeping under the EU AI Act (Articles 12, 14 and 26), the NIST AI RMF,
  ISO/IEC 42001 and RBI guidance for Indian banks and NBFCs: [Regulation mapping](https://docs.parmanasystems.com/security/regulation-mapping).
- **Open issues, listed.** Every gap still open, with its evidence and what to
  do meanwhile, is under "Open issues at a glance" in
  [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) and on the
  [Limitations](https://docs.parmanasystems.com/security/limitations#open-issues) page.
- **Fails closed.** A misconfigured server refuses to start; a request without a
  valid approval is refused and the refusal is recorded.
- **Policy changes need two people.** A proposed policy change takes effect only
  with a second person's signed approval.
- **Works with what you run.** Built in connectors for HubSpot, GitHub, Slack and
  Paytm, and a [generic connector](https://docs.parmanasystems.com/guides/connect-any-external-system)
  for your own systems.
- **Standard cryptography.** Ed25519 signatures by default, post quantum ML-DSA-65
  available.
- **Supply chain hygiene in the open.**
  [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana),
  CodeQL on every change, and signed build provenance for SDK releases and the
  server image.

**Try it without an account:** the [docs playground](https://docs.parmanasystems.com/playground)
sends real requests to a public sandbox, and the SDKs are open source (Apache 2.0):
`npm install @parmana/sdk` or `pip install parmana`.

## Work with us

We are looking for a small number of **design partners**: teams with a real agent
use case that touches money or a system of record. You get direct help from the
founder to put Parmana in front of that workflow, policies written with you, and a
say in what gets built next. We ask for a real integration under real constraints
and honest feedback.

Email **founder@parmanasystems.com** with a line about your use case.

## What the evidence shows

[docs/CLAIMS.md](docs/CLAIMS.md) states every technical claim at the scope
its evidence supports, cites the code and tests behind it, and keeps a list
of what is not yet true. Each point below has a section there you can
check.

The chain: **authorize -> verify -> execute -> confirm**. A Business
Transaction carries an explicit authority, authorization, and intent. A
deterministic policy evaluates it and approves or rejects. An approved
transaction executes through a gateway that never lets the caller hold
real credentials directly. The result is signed into an append-only
Execution Trust Record, independently verifiable without trusting
Parmana's own runtime or database.

What has been demonstrated:

- **The full test suite runs on every commit and pull request** (typecheck, lint, format,
  every test, build and the runnable examples; the pre commit hook and CI both run it). Suites
  that need live credentials or a database skip cleanly when none are configured.
- A live, reproducible execution authorization bypass was found and fixed the same day:
  policy evaluation signals are now bound to the executed Intent before any rule evaluates
  (`Policy.boundSignals` + `SignalIntentBinder`), closing the gap where a caller could declare
  a small, fully verified action while `intent` executed something else. See
  [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md) G-24 for the full incident, including
  the proof of concept figures, and what is still open.
- **A real external system**: HubSpot deal stage and amount updates, authorized by policy and
  executed through the signed gateway pipeline against HubSpot's production API, including a
  non-destructive read, change and revert on a real account
  ([CLAIMS.md 3.10](docs/CLAIMS.md)).
- Assessed at **Technology Readiness Level 6** (prototype demonstrated in a relevant
  environment) on the strength of the point above
  ([CLAIMS.md, Maturity Assessment](docs/CLAIMS.md)). An earlier deployment briefly reached
  TRL 7 on Razorpay evidence before that connector was removed on 2026-08-12; the Maturity
  Assessment has the history.
- **An internal source code review of the authorization path**: four passes traced the
  execution path for every capability, whatever kind of caller requests it (AI agent, person
  or other system), to check whether any action can run without authorization. The fourth
  pass found none for the capabilities registered in production, with the caveats stated
  alongside the result ([CLAIMS.md 2.25](docs/CLAIMS.md)). These were internal reviews, not
  an independent audit; the
  [Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide) is the starting
  point for one.

## Architecture

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
| `@parmana/runtime`             | Orchestrates a Business Transaction through policy, execution, and evidence                                    |
| `@parmana/policy`              | Deterministic policy evaluation, sequential rules, first-match semantics                                       |
| `@parmana/execution-gateway`   | The sole boundary that releases an approved request to a connector                                             |
| `@parmana/execution-control`   | Credential-isolating, single-use execution release                                                             |
| `@parmana/connector-sdk`       | Connector authoring contract: capability definitions, schemas, and the Connector/CredentialProvider interfaces |
| `@parmana/envelope-verifier`   | Verifies a Parmana authorization independently, no trust in Parmana's runtime or database required             |
| `@parmana/crypto`              | Signing and verification, Ed25519 by default, ML-DSA-65 (post-quantum) configurable                            |
| `@parmana/approval`            | Verifies signed approvals issued by a business authority, independent of the caller and of Parmana's runtime   |
| `@parmana/capability-registry` | Binds each capability to the policy that governs it and refuses a request that names another                   |
| `@parmana/execution-system`    | The interface Parmana forwards approved requests through, with an HTTP implementation                          |
| `@parmana/connector-*`         | Connectors: HubSpot, GitHub, Slack and Paytm                                                                   |
| `@parmana/governance-ui`       | Internal UI to propose and review policy changes; approval stays on the approver's machine                     |
| `@parmana/replay`              | Deterministic reconstruction of a past policy decision                                                         |
| `@parmana/storage`             | Append-only persistence, in-memory or Supabase-backed                                                          |
| `@parmana/shared`              | Domain model and configuration shared across every package                                                     |

Key properties: fail-closed configuration (a misconfigured process refuses
to start rather than degrade silently), credential isolation (a connector
never receives long-lived credentials, only a single-use session), exactly-once
consumption of every authorization and webhook event, append-only signed
evidence, and both classical (Ed25519) and post-quantum (ML-DSA-65)
signing.

## Getting started

Evaluating Parmana? [EVALUATION.md](EVALUATION.md) is the step by step guide: requirements,
what to run, and what to expect. The short version, on Node.js 24.6 or later with no `.env`
or credentials:

```bash
npm ci
npm run build
npm test
npm run examples
npm run evaluate
```

`npm run evaluate` runs the 16 attack scenarios in
[evaluations/scenarios.json](evaluations/scenarios.json) and prints whether each was blocked;
[EVALUATION.md](EVALUATION.md#3-run-the-attack-scenarios) explains the result and the report
it writes.

To see the full chain run against a local mock connector, no network
access or credentials required:

```bash
npx tsx examples/tutorials/60-end-to-end-enterprise-execution/run.ts
```

This walks through the full pipeline: policy evaluation, signed
authorization, envelope verification, request-bound attestation, session
credential issuance, connector execution, credential destruction, and the
signed audit/trust record.

For a real deployment, see
[Deploy to production](https://docs.parmanasystems.com/deployment/production)
(source: `docs/site/deployment/production.mdx`): required configuration,
fail closed startup validation, and how to confirm a deployment. To run it
on your own infrastructure with Docker Compose, see
[Self hosted](https://docs.parmanasystems.com/self-hosted/overview).

To call the live hosted instance directly (authentication, the request
shape, the deployed policies, and offline verification), see
[Live API and demos](https://docs.parmanasystems.com/guides/live-api-and-demos).

A further tier of integration tests exercises HubSpot's real API and is
opt-in, skipped by default so `npm test` never needs live credentials.
The env vars involved (names only, see the test files for what each
gates): `ALLOW_LIVE_HUBSPOT`, `TEST_HUBSPOT_PRIVATE_APP_TOKEN`,
`TEST_HUBSPOT_DEAL_ID`, and separately `ALLOW_LIVE_SUPABASE` for the
Supabase-gated storage suite.

To measure throughput and latency for `POST /execute` (real policy
evaluation, Ed25519 signing and connector execution, at configurable
concurrency against an in memory instance with caller authentication
disabled; the script's header comment has the exact scope):

```bash
npm run loadtest -- --connections 20 --duration 15
```

## Status and scope

Assessed at TRL 6 on the evidence in [docs/CLAIMS.md](docs/CLAIMS.md).
Explicitly not claimed: sustained volume, load-bearing traffic, high
availability, or multi-tenant production operation. The claims file also
tracks what has no implementation yet, every connector beyond HubSpot,
GitHub, Slack and Paytm among them. Adding a new connector is a bootstrap source change
today, not a runtime configuration option. See
[docs/connectors/BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md).

Interested in running Parmana against a real integration? See
[Work with us](#work-with-us), or write to **founder@parmanasystems.com**.

## Support

- Email: [founder@parmanasystems.com](mailto:founder@parmanasystems.com)
- Website: [parmanasystems.com](https://parmanasystems.com/)
- Documentation: [docs.parmanasystems.com](https://docs.parmanasystems.com)
- Questions and ideas: [GitHub Discussions](https://github.com/pavancharak/parmana/discussions)
- Issues: [github.com/pavancharak/parmana/issues](https://github.com/pavancharak/parmana/issues)
- Conduct: everyone in issues, pull requests and other project spaces follows the
  [Code of Conduct](CODE_OF_CONDUCT.md).
- Citing Parmana: [CITATION.cff](CITATION.cff), or **Cite this repository** on GitHub.

## License

Source-available for evaluation only. See [LICENSE](./LICENSE). No
license is granted to use, copy, modify, distribute, or create
derivative works from this repository except as expressly permitted in a
separate written agreement with Parmana Systems.

The exceptions are the SDKs, which are licensed under the Apache License 2.0:
the client SDKs in [typescript/](typescript/) and [python/](python/) (published
as `@parmana/sdk` and `parmana`), and the connector SDKs in
[packages/connector-sdk/](packages/connector-sdk/) and
[python-connector-sdk/](python-connector-sdk/). See the LICENSE file in each
directory.

Copyright (c) 2026 Parmana Systems Private Limited. "Parmana" is a trademark of Parmana Systems
Private Limited. See [NOTICE](./NOTICE).

## More documentation

**New here? Start with [The Parmana Handbook](https://docs.parmanasystems.com/handbook/overview)**:
every capability this codebase has, explained from the source, in 23 chapters
(source: `docs/site/handbook/`, also as a
[downloadable PDF](https://docs.parmanasystems.com/handbook/download)).

[docs/README.md](docs/README.md) indexes the rest of the repository documentation: the
claims register, the gap log, what is left to do, and the architecture decisions.

Connecting an external agent? Start with
[docs/connectors/CONNECTING_AN_AGENT.md](docs/connectors/CONNECTING_AN_AGENT.md)
(what's required and why, a step-by-step walkthrough, and every response/error
cited to source).

Adding a connector? Start with
[docs/architecture/CONNECTOR_ISOLATION.md](docs/architecture/CONNECTOR_ISOLATION.md)
(how credential isolation works) and
[docs/connectors/BUILDING_A_CONNECTOR.md](docs/connectors/BUILDING_A_CONNECTOR.md)
(the concrete steps, using the real HubSpot/GitHub connectors as reference).
