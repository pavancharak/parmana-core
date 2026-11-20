# Parmana Documentation

Reader documentation (concepts, guides, deployment, the API and the SDKs) is the published
site at [docs.parmanasystems.com](https://docs.parmanasystems.com). Its source is
[`site/`](site). This folder holds only what does not belong on the site: the records the
project is held to, and the engineering references that code or tests cite.

## Developer documentation

The developer portal has the API, SDK and verifier reference, and the guides. Links below open on GitHub.

- **[Developer portal home](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/README.md)**: start here.
- **[Getting started](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/getting-started.md)** and **[Architecture](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/architecture.md)**.
- **REST API**: [overview](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/api/README.md), [core endpoints](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/api/endpoints.md), and the [generated endpoint index](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/api/endpoint-index.md) (all operations).
- **TypeScript SDK**: [reference](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/typescript.md) and the [generated method index](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/typescript-method-index.md).
- **Python SDK**: [reference](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/python.md) and the [generated method index](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/python-method-index.md).
- **Offline verifier** (`@parmana/verifier`, `parmana-verifier`): [reference](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/verifier.md).
- **CLI** (`parmana-ops`): [reference](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/cli.md).
- **Connector SDK**: [reference](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/sdk/connector-sdk.md).
- **Packages**: [envelope verifier API](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/packages/envelope-verifier-api.md) and [execution system API](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/packages/execution-system-api.md).
- **Security and schema versions**: [security](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/security/README.md) and [schema version 3](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/security/schema-v3.md).
- **Policies**: [policy management](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/policies/README.md).
- **Deployment and troubleshooting**: [deployment](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/deployment/README.md), [troubleshooting](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/troubleshooting/README.md).
- **Reference**: [error codes](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/reference/error-codes.md), [environment variables](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/reference/environment-variables.md), [FAQ](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/faq.md), [glossary](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/glossary.md).
- **Tutorials and examples**: [tutorials](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/tutorials/README.md), [examples](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/examples/README.md).
- **Release history**: [developer portal changelog](https://github.com/pavancharak/parmana-core/blob/main/docs/developer-portal/CHANGELOG.md).

The reader site (concepts, guides, and the same API and SDK material, rendered with navigation) is at [docs.parmanasystems.com](https://docs.parmanasystems.com). Its source is in [`site/`](https://github.com/pavancharak/parmana-core/blob/main/docs/site).

## The records

- **[CLAIMS.md](internal/CLAIMS.md)**: the technical claims register. Every claim is scoped to what is
  implemented and tested, with the files and tests that prove it, and a section of claims
  Parmana does not make. The source of truth for what Parmana does today.
- **[VERIFICATION-GAPS.md](internal/VERIFICATION-GAPS.md)**: the dated gap log. What was found missing
  or wrong, how severe, and how and when it was closed.
- **[REMAINING-WORK.md](internal/REMAINING-WORK.md)**: what is left to do, including what needs the
  operator, and ideas considered but not built.
- **[CURRENT-STATE.md](internal/project/CURRENT-STATE.md)**: a short description of the system as it stands.
- **[adr/](internal/adr)**: architecture decision records.
- **[../04-INCIDENTS-LOG.md](../04-INCIDENTS-LOG.md)**: security and release incidents and
  their resolutions.

## Engineering references

- **[architecture/system-architecture.md](internal/architecture/system-architecture.md)**: packages,
  their responsibilities, and how a request flows through them.
- **[architecture/repository-invariants.md](internal/architecture/repository-invariants.md)**: the
  architectural rules the build enforces, each with the test that enforces it.
- **[architecture/CONNECTOR_ISOLATION.md](internal/architecture/CONNECTOR_ISOLATION.md)**: how
  connector credentials are isolated.
- **[connectors/BUILDING_A_CONNECTOR.md](internal/connectors/BUILDING_A_CONNECTOR.md)**: how to add a
  connector.
- **[connectors/CONNECTING_AN_AGENT.md](internal/connectors/CONNECTING_AN_AGENT.md)**: connecting an
  external agent or caller, with every response and error cited to source.
- **[related-work/](internal/related-work)**: notes on outside research kept for future reference, and
  what each paper means for Parmana.

## Package documentation

- [../packages/api/README.md](../packages/api/README.md): the REST API package.
- [../packages/envelope-verifier/README.md](../packages/envelope-verifier/README.md):
  verifying a Parmana authorization without trusting Parmana's runtime or database.
- [../typescript/README.md](../typescript/README.md) and [../python/README.md](../python/README.md):
  the SDKs.

## License and security

- [../LICENSE](../LICENSE): Apache License 2.0.
- [../SECURITY.md](../SECURITY.md): reporting a vulnerability.
- [../THREAT-MODEL.md](../THREAT-MODEL.md): threats, controls, evidence and residual risk.
- [MUTATION-TESTING.md](internal/testing/MUTATION-TESTING.md): mutation scores for the security packages, the
  gaps they showed and what was fixed.
- [../governance/README.md](../governance/README.md): the public, hash chained log of policy
  change approvals, and how to verify it.
- [../SECURITY-CHALLENGE.md](../SECURITY-CHALLENGE.md): what counts as breaking Parmana on a
  local copy.
