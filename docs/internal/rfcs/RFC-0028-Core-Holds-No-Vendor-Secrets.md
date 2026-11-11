# RFC-0028 — Core holds no vendor credentials

Status: Proposed. Nothing is built yet.

Created: 2026-11-11

Target Version: unset.

Gap: G-128 in `docs/internal/VERIFICATION-GAPS.md` (backlog row 52).

Related: ADR-0018 (connectors outside core), THREAT-MODEL.md A5, A9, §9, RFC-0027.

---

# Summary

Today, in env mode, `parmana-core` reads connector credentials from its own process environment
(`EnvSecretsProvider.ts` passes them through). Any code that can read that environment on the same
host, container or process can read the credential. The README's claim that the agent never holds real
credentials is true for callers of the HTTP API, and not true for code on the host.

This RFC proposes the permanent fix: **core never holds a vendor credential**. Each connector runs as a
separate service with its own identity, reads only its own secret, at call time, and runs on its own
network segment. Core sends signed releases and never reads a secret.

# Problem

- The credential is in core's environment for the life of the process. A same-host reader needs no
  special access to get it.
- The threat model treats the host as out of scope (A9). That is an honest assumption, but it means one
  compromised component reaches every vendor account at once.
- Config drift is easy to miss. A variable added for one connector stays in core's environment
  indefinitely.

# Decision

1. **Core holds no connector credential.** No vendor secret is read by core, in any mode.
2. **Each connector is its own service** with its own runtime identity, and its only permission is to
   read its own secret.
3. **Secrets are read at call time** from a secrets store, and are never written to the environment, a
   file or a log.
4. **Separate network segment** per connector. The connector accepts releases from core's address only,
   and reaches only its vendor's API.
5. **Fail closed at startup.** Core refuses to start if any connector credential variable is present in
   its environment. A connector refuses to start if its secret is missing or of the wrong shape.

# Design

## Hosted deployment

- A separate cloud account or project for connectors, so a compromise of core's account does not reach
  vendor secrets.
- Each connector runs as a function or container with a role that can read one secret ARN, and nothing
  else.
- Core's role has no permission on the secret store.
- Secrets are stored in AWS Secrets Manager (or the platform's equivalent). KMS encrypts them; it does
  not store them.
- Rotation is scheduled per secret. Each rotation and each secret read is logged.

## Self-hosted

- A Compose profile runs the connector as its own container, with its secret supplied as a Docker secret
  mounted into that container only.
- Core's container has no mount and no network route to the secret.
- The profile documents that one machine running both is the weaker configuration, and that it is the
  operator's risk.

## Verification

- An architecture test fails if core code imports a connector secret reader or reads a vendor variable.
- A startup check in core refuses to boot with a vendor variable present.
- A scheduled probe sends core's release to a connector and confirms the connector, not core, performed
  the secret read, using the connector's own log.

# Options considered

**A. Separate services with separate identities. Recommended.** Removes the credential from core
entirely, so a compromised core cannot reach it. Cost: one deployment unit per connector.

**B. A separate process on the same host, reading a secret file with restricted permissions.** Cheaper,
but a same-host root user can still read it. Acceptable only for self-hosted copies, and documented as
such.

**C. Keep env mode and document the exposure.** No cost, but it leaves the README's claim false for
code on the host. Rejected for the hosted deployment.

# Migration

1. Finish moving the vendor connectors out of core (ADR-0018). Remove their variables from core's
   configuration.
2. Add the core startup check and the architecture test, so no new credential can be added to core.
3. Stand up the connector services with their own identities, and point core's release endpoints at them.
4. Run one connector end to end through the new path (Razorpay is the first, as it has test-mode
   coverage) and record the result in the gap log.
5. Remove the remaining credential variables from core. Close G-128 only after step 4 is recorded.

# Open questions

1. **Secrets store.** Confirm the hosted choice (AWS Secrets Manager, or another store) before building.
2. **Self-hosted default.** Should the Compose profile default to separate containers, or to the single
   container with a warning?
3. **Connector hosts.** How many connectors per host? Proposed: one per host, to keep a compromise contained.
4. **Latency.** Each call adds a secret read. Measure it on the Razorpay path before accepting the design.

# Non-goals

- Protecting against root on a connector's own host. That risk moves to the connector host and is limited
  by keeping that host small and locked down. It is not removed.
- Changing the release format or the policy engine. Those are unaffected.

# Acceptance

The RFC is ready to build when:

- the secrets store is chosen (open question 1);
- the migration steps are agreed;
- the self-hosted default is decided (open question 2).

When built, G-128 is closed only after a Razorpay release has run end to end through the separate
connector service, with core never reading the secret, and the result is recorded.
