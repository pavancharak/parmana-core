# Status and evidence

[Back to the README](../../README.md) · [Developer docs index](README.md)

## Reports and evidence

Every report is listed once, here. Start with the question you have.

**Test results**

- **Live CI runs:** every push runs the build, lint, typecheck and test suite. Results for each run are on the [CI workflow page](https://github.com/pavancharak/parmana-core/actions/workflows/ci.yml). To reproduce them, see [Quick start](RUNNING.md#quick-start).
- **Evaluation scenarios:** the 16 attack scenarios are in [evaluations/scenarios.json](../../evaluations/scenarios.json). [EVALUATION.md](../../EVALUATION.md) explains the result.
- **Mutation testing:** [docs/internal/testing/MUTATION-TESTING.md](../internal/testing/MUTATION-TESTING.md) breaks the security code on purpose and checks that the tests notice. Fuzz tests send damaged and arbitrary requests, policies and records, and require a clear refusal, never a crash.

**Security**

- **Threat model:** [THREAT-MODEL.md](../../THREAT-MODEL.md) gives each threat its control, the attack that tests it, and the risk that remains.
- **Security challenge:** [SECURITY-CHALLENGE.md](../../SECURITY-CHALLENGE.md) describes what counts as breaking Parmana on a copy you run yourself, and credits every confirmed break.
- **Open issues and past incidents:** [docs/internal/VERIFICATION-GAPS.md](../internal/VERIFICATION-GAPS.md) lists every gap still open, with its evidence and what to do meanwhile. Past incidents and their fixes are recorded there too; see G-24 for an authorization bypass that was found and fixed. The full incident log is in [04-INCIDENTS-LOG.md](../../04-INCIDENTS-LOG.md).
- **Claims you can check:** [docs/internal/CLAIMS.md](../internal/CLAIMS.md) states each claim at the scope its evidence supports, with the code and tests behind it, and lists what is not yet true.
- **Mapped to standards:** the [OWASP mapping](https://docs.parmanasystems.com/security/owasp-mapping) covers the OWASP Top 10 for LLM Applications and for Agentic Applications (2026). The [regulation mapping](https://docs.parmanasystems.com/security/regulation-mapping) covers the EU AI Act, the NIST AI RMF, ISO/IEC 42001 and RBI guidance.
- **Supply chain:** [OpenSSF Scorecard](https://scorecard.dev/viewer/?uri=github.com/pavancharak/parmana-core), CodeQL on every change, and signed build provenance for SDK releases, the server image and the command-line tool's container image.
- **Reviewed internally:** four internal passes traced the execution path for every registered capability, looking for any action that could run without authorization. The fourth pass found none for the capabilities in production, with the caveats in [CLAIMS.md 2.25](../internal/CLAIMS.md). These were internal reviews, not an independent audit.

**Governance**

- **Policy approval log:** [governance/README.md](../../governance/README.md) describes the hash-chained log of policy change approvals, and how to verify it.

**Third-party listing**

- **AgenTrust:** the `parmana-server` integration is listed in the AgenTrust integrations repository at tier `verified` (read 2026-10-29). That tier covers the offline fixture path only: the connector results are mocks, and no conformance level is claimed. See [CLAIMS.md 3.23](../internal/CLAIMS.md) and the [AgenTrust refund evaluation](../internal/evaluation/agentrust-refund/README.md).

**Paper and comparison**

- **Technical paper:** design, threat model, evaluation and limitations, in [docs/internal/paper/parmana-paper.pdf](../internal/paper/parmana-paper.pdf).
- **Compared honestly:** [How Parmana compares](https://docs.parmanasystems.com/how-parmana-compares) sets Parmana beside IAM, API gateways and LLM guardrails, including where it is weaker.

## Status and scope

Assessed at Technology Readiness Level 6 (prototype demonstrated in a relevant environment) on the evidence in [docs/internal/CLAIMS.md](../internal/CLAIMS.md). Not claimed: sustained volume, load-bearing production traffic, high availability, or multi-tenant production operation.

The claims file also tracks what has no implementation yet. Vendor connectors no longer live in this repository. They moved to connector services outside it under [ADR-0018](../internal/adr/ADR-0018-Connectors-Outside-Core.md). An external connector is registered through maker and checker approval, with no deploy, as [ADR-0013](../internal/adr/ADR-0013-Generic-External-Connector.md) describes. A connector built into the source is described in [docs/internal/connectors/BUILDING_A_CONNECTOR.md](../internal/connectors/BUILDING_A_CONNECTOR.md).
