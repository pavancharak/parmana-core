# Parmana Documentation

Reader documentation (concepts, guides, deployment, the API and the SDKs) is the published
site at [docs.parmanasystems.com](https://docs.parmanasystems.com). Its source is
[`site/`](site/). This folder holds only what does not belong on the site: the records the
project is held to, and the engineering references that code or tests cite.

## The records

- **[CLAIMS.md](CLAIMS.md)**: the technical claims register. Every claim is scoped to what is
  implemented and tested, with the files and tests that prove it, and a section of claims
  Parmana does not make. The source of truth for what Parmana does today.
- **[VERIFICATION-GAPS.md](VERIFICATION-GAPS.md)**: the dated gap log. What was found missing
  or wrong, how severe, and how and when it was closed.
- **[REMAINING-WORK.md](REMAINING-WORK.md)**: what is left to do, including what needs the
  operator, and ideas considered but not built.
- **[CURRENT-STATE.md](CURRENT-STATE.md)**: a short description of the system as it stands.
- **[adr/](adr/)**: architecture decision records.
- **[../04-INCIDENTS-LOG.md](../04-INCIDENTS-LOG.md)**: security and release incidents and
  their resolutions.

## Engineering references

- **[architecture/system-architecture.md](architecture/system-architecture.md)**: packages,
  their responsibilities, and how a request flows through them.
- **[architecture/repository-invariants.md](architecture/repository-invariants.md)**: the
  architectural rules the build enforces, each with the test that enforces it.
- **[architecture/CONNECTOR_ISOLATION.md](architecture/CONNECTOR_ISOLATION.md)**: how
  connector credentials are isolated.
- **[connectors/BUILDING_A_CONNECTOR.md](connectors/BUILDING_A_CONNECTOR.md)**: how to add a
  connector.
- **[connectors/CONNECTING_AN_AGENT.md](connectors/CONNECTING_AN_AGENT.md)**: connecting an
  external agent or caller, with every response and error cited to source.
- **[connectors/PAYTM_CONNECTOR.md](connectors/PAYTM_CONNECTOR.md)**: the out of process Paytm
  refund connector and its wire contract.
- **[related-work/](related-work/)**: notes on outside research kept for future reference, and
  what each paper means for Parmana.

## Package documentation

- [../packages/api/README.md](../packages/api/README.md): the REST API package.
- [../packages/envelope-verifier/README.md](../packages/envelope-verifier/README.md):
  verifying a Parmana authorization without trusting Parmana's runtime or database.
- [../typescript/README.md](../typescript/README.md) and [../python/README.md](../python/README.md):
  the SDKs.

## License and security

- [../LICENSE](../LICENSE): proprietary, source available for evaluation.
- [../SECURITY.md](../SECURITY.md): reporting a vulnerability.
- [../THREAT-MODEL.md](../THREAT-MODEL.md): threats, controls, evidence and residual risk.
- [MUTATION-TESTING.md](MUTATION-TESTING.md): mutation scores for the security packages, the
  gaps they showed and what was fixed.
- [../governance/README.md](../governance/README.md): the public, hash chained log of policy
  change approvals, and how to verify it.
- [../SECURITY-CHALLENGE.md](../SECURITY-CHALLENGE.md): what counts as breaking Parmana on a
  local copy.
