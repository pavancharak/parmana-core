# ADR-0018: Connectors Outside Core

**Status:** Proposed. Not accepted. Written for the operator to accept or change. Nothing in this record has been removed from the code yet.

**Date:** Proposed 2026-10-29.

**Relates to:** ADR-0013 (the generic external connector, which this extends and in one point supersedes), ADR-0009 (the signed authorization the Paytm connector service verifies), ADR-0012 (Execution Intents, unchanged).

## Context

parmana-core ships four connectors in its own code: HubSpot, GitHub, Slack and Paytm. Each has a package (`packages/connector-*`), a gateway adapter, a credential provider, a bootstrap file in `packages/api/src/bootstrap/`, and entries in the registry and the capability-to-policy table. ADR-0013 kept those four in code on purpose: "`paytm:`, `hubspot:`, `github:`, `slack:` stay code."

That has three costs:

- Each new system changes core, and core carries every vendor's credentials, client code and failure modes.
- Core's tests, tutorials and documentation depend on vendor code. The integration tests for these connectors cover a large part of the API package's test surface.
- A connector bug or a vendor change can require a core release.

ADR-0013 already gives a way to run a connector outside core: a signed release, sent to an HTTPS endpoint the operator runs, which verifies it and performs the action with its own credentials. `parmana-connect` is a ready-made endpoint of that kind. The external path has been live in production since 2026-09-30.

## Decision

1. **Core holds no vendor code.** After the migration, parmana-core contains no `packages/connector-*` package, no connector bootstrap, and no vendor credential. Its only connector route is the external connector path from ADR-0013.
2. **Every vendor connector runs as an external connector.** Its code lives in the `parmana-connectors` repository, in its own folder (`src/connectors/<vendor>/`), with its own tests. Each connector is deployed as its own endpoint. Core reaches it only through a registration (ADR-0013 step 1), approved through maker and checker.
3. **Core's connector-specific code is removed in steps, not in one change.** A connector is removed from core only after its external version has passed the same checks the in-core version passed, against the same live or sandbox system, and after its production registration is in place.
4. **parmana-connect stays generic and holds no vendor code.** It is the service that runs connectors defined by a manifest. Vendor connectors live in `parmana-connectors`, one folder per vendor. Each vendor module imports only the shared contract module (`src/connector-contract.ts`), which has no imports of its own. A vendor module never imports core code, the manifest engine, or another vendor's module. Core and each connector share only the signed-release format and the public key.

## Migration order

| Order | Connector              | Why this position                                                                                                                                                                                                      |
| ----- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0     | Decision (this record) | Nothing is removed before acceptance.                                                                                                                                                                                  |
| 1     | Razorpay refund        | New. Built as an external connector from the start, so it never enters core.                                                                                                                                           |
| 2     | Paytm refund           | Already a forwarder to an external service (`PAYTM_CONNECTOR_URL`), using a shared secret. Moves to the signed release path. Production points at it today, so it moves before anything else in production is touched. |
| 3     | Slack                  | Single capability. No write-back to Parmana's own data.                                                                                                                                                                |
| 4     | GitHub                 | App authentication (an app JWT signed with a private key) needs code, not a manifest, in the connector. Built as a module in parmana-connectors.                                                                       |
| 5     | HubSpot                | Most used by the tutorials and the most test coverage in core. Last, so the migration pattern is proven before it.                                                                                                     |
| 6     | Zerodha                | Package exists, not registered. Remove it with no migration.                                                                                                                                                           |

Each step is one pull request in each repository, in this order: the module and its tests in parmana-connectors; the registration in core, through maker and checker; the removal from core. A step is not finished until the removal is merged and the production check passes again.

## What is removed from core, per step

- The `packages/connector-<vendor>` package and its entry in the workspace.
- The gateway adapter in `packages/execution-gateway` for that vendor.
- The bootstrap files and the registry entry in `packages/api/src/bootstrap/`.
- The capability-to-policy binding in `packages/capability-registry`.
- Integration tests that exercised only that vendor. Their behaviour moves to the tests of the vendor's connector in parmana-connectors, and to the live check.
- Tutorials and examples for that vendor, rewritten to call the external path.

## What stays in core

- Policy, approvals, approval issuers, maker and checker, signing, Execution Intents and audit.
- The external connector registration, the signed release, and the result check.
- Credential handling for core's own keys. A vendor credential is never stored in core after its step.

## Consequences

- Core's surface shrinks. Its test suite gets faster and does not depend on vendor sandboxes.
- A vendor can be replaced, or run by a customer, without a core release.
- Each connector's credential moves from core's environment to its own service. That is more places to secure, and each must follow the key rules in `docs/runbooks/`.
- Results from an external connector are checked by core against the signed release. Core cannot inspect a vendor's internal state the way the in-core connector could, so each connector's module must report its outcome fully (see the Razorpay receipt check as the model).
- During migration, two paths for the same capability must never be active at once. Registration of the external path and removal of the in-core path happen in the same release.

## Open questions for the operator

1. **Production Paytm.** Production points `PAYTM_CONNECTOR_URL` at the agent today. Confirm that the Paytm move may happen after the Razorpay connector is deployed from parmana-connectors, not before.
2. **HubSpot and Slack in production.** Confirm whether their tokens are set in production. If they are, their registrations come before the removal, with no gap.
3. **Live Razorpay money.** Confirm that live keys stay refused (`PARMANA_RAZORPAY_ALLOW_LIVE_KEYS` unset) until the live check in step 1 is written and passed.
4. **Repository.** Confirm that parmana-connectors is the place for the vendor modules, and that it stays private until a connector must be released or licensed separately.
