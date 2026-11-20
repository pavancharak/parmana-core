# Parmana developer portal

Parmana makes sure that AI agents and business applications take only the actions the organization has approved, and keeps signed, independently verifiable evidence of each action.

This portal documents the SDKs, the REST API, the policy and governance model, deployment, security and evidence verification, and troubleshooting. Every behaviour described here was checked against the source code in this repository, and the examples were run. Where something was not run, the page says so.

> **Start here:** [Getting started](getting-started.md), then [Concepts](overview.md) and the [tutorials](tutorials/README.md).

## How to read this portal

Each feature carries one of these labels:

| Label            | Meaning                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Implemented**  | In the code, and exercised by a test, example or live run recorded in [COVERAGE.md](COVERAGE.md).                                                                          |
| **Experimental** | In the code and reachable, but opt-in, or not yet covered by a production runbook. Experimental operations are marked `x-stability: experimental` in the OpenAPI document. |
| **Test only**    | Works only with `NODE_ENV=test` or a test fixture. Never use it in a deployment.                                                                                           |
| **Planned**      | Named in the design documents, not in the code. Not documented as usable.                                                                                                  |

## Versions covered

| Component                                                | Version                    | Where it comes from                                                           |
| -------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| `@parmana/sdk` (TypeScript SDK)                          | 4.1.1                      | `typescript/package.json`, npm                                                |
| `parmana` (Python SDK)                                   | 4.1.1                      | `python/pyproject.toml`, PyPI                                                 |
| `@parmana/cli` (`parmana-ops`)                           | 4.1.1                      | `packages/cli/package.json`, npm                                              |
| `@parmana/verifier` (`parmana-verify`, offline verifier) | 2.0.3                      | `parmana-verifier` repository, npm                                            |
| `parmana-verifier` (Python verifier)                     | 2.0.3                      | PyPI                                                                          |
| `@parmana/connector-sdk`, `parmana-connector-sdk`        | 4.1.1                      | `packages/connector-sdk`, `python-connector-sdk`                              |
| API server (`@parmana/api`, run from source or Docker)   | repository 4.1.1           | `packages/api`. Not published to npm. See [Deployment](deployment/README.md). |
| OpenAPI document                                         | API `1.0.0`, OpenAPI 3.1.0 | `openapi/openapi.yaml`                                                        |

`GET /version` reports the `@parmana/api` package version, the same as the packages (4.1.1 in this build). An earlier build reported a hand-typed `0.4.0`; that is fixed. See [COVERAGE.md](COVERAGE.md#known-issues-found-during-this-review).

## Sections

| Section                                                      | What it covers                                                                                                                                                                |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Overview](overview.md)                                      | What Parmana is, why it exists, who should use it, and how it differs from gateways and guardrails.                                                                           |
| [Getting started](getting-started.md)                        | Prerequisites, installation, a local server, a first authorized execution, and the first evidence check.                                                                      |
| [Architecture](architecture.md)                              | Request flow, maker-checker, agent authorization, evidence, deployment and trust boundaries.                                                                                  |
| [SDKs](sdk/README.md)                                        | Every published package, the TypeScript and Python SDK references, the offline verifier and the CLI.                                                                          |
| [API reference](api/README.md)                               | Authentication, headers, errors, and the core endpoints with request and response examples. The full [endpoint index](api/endpoint-index.md) lists all 66 OpenAPI operations. |
| [Tutorials](tutorials/README.md)                             | Node.js, Python, fintech, refund authorization, maker-checker, transaction limits, AI agents, and evidence.                                                                   |
| [Policy management](policies/README.md)                      | Where policies live, how they are versioned, approved and evaluated, and how organizations keep ownership.                                                                    |
| [Deployment](deployment/README.md)                           | Local, Docker, PostgreSQL, cloud and on-premises options, environment variables, operations.                                                                                  |
| [Security](security/README.md)                               | Signing, hashing, canonical JSON, trust roots, tamper detection, key management. [Evidence verification](security/evidence-verification.md) is a separate page.               |
| [Troubleshooting](troubleshooting/README.md)                 | Error catalogue, common integration failures, debugging steps.                                                                                                                |
| [Reference](reference/README.md)                             | Configuration, environment variables, error codes, method and endpoint indexes.                                                                                               |
| [FAQ](faq.md) and [Glossary](glossary.md)                    | Common questions and defined terms.                                                                                                                                           |
| [Changelog](CHANGELOG.md) and [Coverage report](COVERAGE.md) | What changed in this portal, and what was verified.                                                                                                                           |

## Runnable examples

The examples in [examples/](examples/README.md) are the code the tutorials point to. They run against a local server that you start from this repository.

## Verification tools

- [tools/generate-indexes.mjs](tools/generate-indexes.mjs) regenerates the method and endpoint indexes from the SDK source and the OpenAPI document.
- [tools/check-docs.mjs](tools/check-docs.mjs) checks that the portal's links resolve and that every public SDK method and OpenAPI operation is mentioned somewhere in the portal.

## Proposed website navigation

The repository's existing documentation site is Mintlify (`docs/site/docs.json`). This portal does not change that site. It is written as plain Markdown so that it can be placed in the site's navigation. The owner would need to approve that change; it is not applied here. A proposed navigation, in the order of the requested structure, is:

```text
Overview            overview.md
Quickstart          getting-started.md
Concepts            overview.md#core-concepts, architecture.md
SDKs                sdk/README.md, sdk/typescript.md, sdk/python.md, sdk/verifier.md, sdk/cli.md
API Reference       api/README.md, api/endpoints.md, api/endpoint-index.md
Tutorials           tutorials/README.md and its eight pages
Policy Management   policies/README.md
Architecture        architecture.md
Deployment          deployment/README.md
Security            security/README.md, security/evidence-verification.md
Evidence Verification  security/evidence-verification.md
Troubleshooting     troubleshooting/README.md
FAQ                 faq.md
```

## Relationship to the existing documentation

The repository already has a larger, Mintlify-based site in `docs/site/`, technical guides in `docs/guides/`, and generated reference pages. This portal does not replace them. Where a topic is already covered there, this portal links to it instead of repeating it. Two existing pages were found to be out of date for a fresh local start; see [COVERAGE.md](COVERAGE.md#known-issues-found-during-this-review).
