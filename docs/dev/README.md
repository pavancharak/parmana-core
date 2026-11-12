# Developer documentation

Start here. The [README](../../README.md) has the one-minute version; these files have the detail.

| I want to | Read |
| --- | --- |
| Understand what Parmana does and its limits | [OVERVIEW.md](OVERVIEW.md) |
| See how a request moves through it | [ARCHITECTURE.md](ARCHITECTURE.md) |
| Run it locally, or deploy it | [RUNNING.md](RUNNING.md) |
| Connect a system I run | [CONNECTORS.md](CONNECTORS.md) |
| Use the SDKs, CLI or verifier | [PACKAGES.md](PACKAGES.md) |
| Check the tests, evidence and status | [STATUS-AND-EVIDENCE.md](STATUS-AND-EVIDENCE.md) |
| Contribute, report a vulnerability, or get the license | [COMMUNITY.md](COMMUNITY.md) |

Hosted documentation: [docs.parmanasystems.com](https://docs.parmanasystems.com). Start with [Choose your path](https://docs.parmanasystems.com/choose-your-path) if you are unsure which role applies. For AI tools, every docs page is listed in [llms.txt](https://docs.parmanasystems.com/llms.txt).

## Documentation

**New here? Start with [The Parmana Handbook](https://docs.parmanasystems.com/handbook/overview).** It covers every capability in this codebase in 22 chapters, and is also available as a [PDF](https://docs.parmanasystems.com/handbook/download).

The documentation lives in two places:

- **[docs/site/](../site/)** is the public documentation: guides, concepts, the SDK reference and the handbook. It is published at [docs.parmanasystems.com](https://docs.parmanasystems.com).
- **[docs/internal/](../internal/)** holds the maintainer records: the claims register, the gap log, the architecture decisions (ADRs), the design proposals (RFCs), the operator runbooks and the test notes. [docs/README.md](../README.md) is the index to these.

Three indexes in [docs/internal/indexes/](../internal/indexes/) answer common questions in one table each:

- **[verification-gaps-index.md](../internal/indexes/verification-gaps-index.md)**: every gap in the gap log, with its status.
- **[claims-index.md](../internal/indexes/claims-index.md)**: every claim in the claims register, with the gaps each one mentions.
- **[adr-rfc-index.md](../internal/indexes/adr-rfc-index.md)**: every decision record and proposal, with its status.

To add a connector, start with [CONNECTOR_ISOLATION.md](../internal/architecture/CONNECTOR_ISOLATION.md) and [BUILDING_A_CONNECTOR.md](../internal/connectors/BUILDING_A_CONNECTOR.md).
