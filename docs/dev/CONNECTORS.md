# Connecting a system you run

[Back to the README](../../README.md) · [Developer docs index](README.md)

An operator registers an **external connector**: a capability, the HTTPS endpoint that serves it, and the policy that governs it. One person proposes the registration, and a different person approves it with a step-up signature. Once active, Parmana sends each approved action to the endpoint as a signed release. The endpoint checks the release's signature and audience, and it needs no shared secret.

- [Connect any external system](https://docs.parmanasystems.com/guides/connect-any-external-system): the full order of steps.
- [The parmana-connect service](https://docs.parmanasystems.com/connectors/parmana-connect): a ready-made endpoint that verifies releases and runs a manifest's HTTP call. Its source is in [pavancharak/parmana-connect](https://github.com/pavancharak/parmana-connect).
- [ADR-0013](../internal/adr/ADR-0013-Generic-External-Connector.md): the decision record, with its alternatives and limits.
