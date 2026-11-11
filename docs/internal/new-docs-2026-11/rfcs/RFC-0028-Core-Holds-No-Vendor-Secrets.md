# RFC-0028 — Core holds no vendor credentials

Status: Proposed. Part of the code guard is built; runtime separation is not.

Created: 2026-11-11

Target Version: unset.

Gap: G-128 in `docs/internal/VERIFICATION-GAPS.md` (backlog row 52). G-128 stays open.

Related: ADR-0018 (connectors outside core), THREAT-MODEL.md A5, A9, §9, RFC-0027.

---

# Current status

| Item                                                              | State on `main` | Evidence                                                                                                        |
| ----------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------- |
| Core registers no built-in vendor connector                       | Done            | `packages/api/src/bootstrap/createConnectorRegistry.ts` registers only the test fixture and external connectors |
| Core reads no vendor credential variable, in any mode             | Done in code    | `tests/architecture/core-holds-no-vendor-credentials.test.ts` (PR #563, commit `fe18086`)                       |
| Startup refusal when a vendor variable is present                 | Not built       | The architecture test covers the code, not the running environment                                              |
| Each connector is its own service with its own identity           | Not built       | Connectors run as one Vercel deployment in `parmana-connectors`                                                 |
| Each connector reads its secret at call time from a secrets store | Not built       | Secrets store not chosen (open question 1)                                                                      |
| Each connector sits on its own network segment                    | Not built       | Needs cloud accounts and network setup, which are operator decisions                                            |
| One Razorpay release run end to end through the separate service  | Not run         | Razorpay test mode passed 4 of 4 checks, without a signed release through the deployed service                  |

**What this means.** The code guard shows that core cannot read a vendor credential by accident. It does not
isolate anything at runtime. A process on the same host can still read a secret if one is placed in its
environment, so G-128 stays open until the runtime items above are built and the Razorpay run is recorded.

**What is blocking the open items.**

- The secrets store choice (open question 1).
- Where each connector service runs, and in which account or project (tier, below).
- Cloud accounts and network segments, which an operator creates.

---

# Summary

Today, in env mode, `parmana-core` reads connector credentials from its own process environment
(`EnvSecretsProvider.ts` passes them through). Any code that can read that environment on the same
host, container or process can read the credential. The README's claim that the agent never holds real
credentials is true for callers of the HTTP API, and not true for code on the host.

This RFC proposes the fix: **core never holds a vendor credential, in any deployment tier**. What varies
by organization is how far one compromised connector can reach and how much operational work the
organization takes on. Core sends signed releases and never reads a secret.

# Problem

- The credential is in core's environment for the life of the process. A same-host reader needs no
  special access to get it.
- The threat model treats the host as out of scope (A9). That is an honest assumption, but it means one
  compromised component reaches every vendor account at once.
- Config drift is easy to miss. A variable added for one connector stays in core's environment
  indefinitely.

# Decision

1. **Core holds no connector credential.** No vendor secret is read by core, in any tier or mode.
2. **Each connector has its own identity and reads only its own secret.** How separate the identities
   and processes are depends on the tier (below).
3. **Secrets are read at call time** from a secrets store, and are never written to the environment, a
   file or a log.
4. **Network segmentation** matches the tier. The connector accepts releases from core's address only,
   and reaches only its vendor's API.
5. **Fail closed at startup.** Core refuses to start if any connector credential variable is present in
   its environment. A connector refuses to start if its secret is missing or of the wrong shape.

# Deployment tiers

The tier is chosen per organization. Every tier keeps decisions 1, 3 and 5. The tiers differ in
isolation and in operations.

## Tier 1: small organization, few connectors

Runs all connectors in one connector service. Each connector is its own process with its own identity
and its own secret, not one deployment per connector.

- **Core:** separate deployment, no secret access.
- **Connectors:** one service, one process per connector, each with a role that reads only its own secret.
- **Secrets:** the platform's managed store, with built-in rotation where available.
- **Self-hosted:** one Compose file with one container per connector, each with its own Docker secret.

**Pros**

- Lowest cost and the fewest deployment units.
- Core is still isolated from every vendor secret.
- Setup is short: one service, a few roles, a few secrets.

**Cons**

- A compromise of the connector service's host or runtime can reach every connector on it. Per-process
  identity limits the damage only if the platform enforces it.
- One deployment to update, so one bad release affects every connector.
- Rotation and access review still need a named owner, even with few secrets.

**Use when:** the organization has few connectors, a small team, and no regulatory requirement for
separation of vendor accounts.

## Tier 2: mid-size organization

One deployment per connector. Each has its own role, limited to its own secret. Separate network
segments, and rotation on a schedule.

- **Core:** separate deployment, no secret access.
- **Connectors:** one deployment each, each with a role that reads one secret ARN and nothing else.
- **Network:** a segment per connector, with an allowlist for core's release traffic and the vendor's API.
- **Monitoring:** per connector, with alerts on failed secret reads.
- **Self-hosted:** one Compose profile per connector, with the connector on its own network and its secret
  mounted into that container only.

**Pros**

- A compromised connector reaches only its own vendor's secret and API.
- A bad release affects one connector, not all of them.
- Per-connector logs and alerts make failures easier to trace.

**Cons**

- More deployments, roles and network rules to write and keep correct.
- Rotation and access reviews multiply by connector count.
- Higher monthly cost for secret reads, logs and per-deployment resources.

**Use when:** the organization runs several connectors, has a dedicated operations owner, and needs a
contained blast radius.

## Tier 3: regulated or high-value organization

Separate cloud accounts or projects for core and connectors, per-connector hosts, and signed audit of
every secret read.

- **Core:** its own account, with no permission on the secret store.
- **Connectors:** a separate account, one host or function per connector, each with a role scoped to one
  secret.
- **Audit:** every secret read is written to a signed log, and checked on a fixed cadence.
- **Review:** access reviews on a fixed schedule, and an independent review each year.

**Pros**

- A compromise of core's account does not reach vendor secrets, and a compromise of one connector host
  does not reach the others.
- Signed secret-read logs give evidence for audits and for incident response.
- Meets the strongest separation most regulators and enterprise buyers ask about.

**Cons**

- The highest cost: multiple accounts, per-connector hosts, audit storage, and reviewers.
- Cross-account access needs its own design and its own review.
- Slower to change, since a new connector goes through account, role and network approval.

**Use when:** the organization handles regulated data or high-value payments, or a contract requires
evidence of separation.

## Choosing a tier

Start at Tier 1 if you have few connectors. Move to Tier 2 when the number of connectors or the team
makes shared operations risky. Move to Tier 3 when a regulator, a contract, or a loss of exposure requires
it. Moving up does not change core or the release format, only the connector deployment.

Every tier includes the startup check and the architecture test in core. Both are cheap, and they stop a
credential from returning to core in any tier.

# Options considered

**A. Separate services with separate identities.** Removes the credential from core entirely, so a
compromised core cannot reach it. Cost: one deployment unit per connector, at Tier 2 and above. Tier 1
groups them, with the trade-off above.

**B. A separate process on the same host, reading a secret file with restricted permissions.** Cheaper,
but a same-host root user can still read it. Acceptable only for self-hosted copies, and documented as
such.

**C. Keep env mode and document the exposure.** No cost, but it leaves the README's claim false for code
on the host. Rejected for every hosted tier.

# Migration

1. Finish moving the vendor connectors out of core (ADR-0018). Done on `main`: core registers none.
2. Add the core startup check and the architecture test, so no new credential can be added to core.
   The architecture test is done. The startup check is not.
3. Stand up the connector services with their own identities, at the tier chosen, and point core's
   release endpoints at them. Not started.
4. Run one connector end to end through the new path (Razorpay is the first, as it has test-mode
   coverage) and record the result in the gap log. Not started.
5. Remove the remaining credential variables from core. Close G-128 only after step 4 is recorded.

# Open questions

1. **Secrets store.** Confirm the hosted choice (AWS Secrets Manager, or another store) before building.
   This is needed at every tier.
2. **Self-hosted default.** Answered per tier above: Tier 1 and Tier 2 use separate containers; a
   single-container run is allowed only with an explicit flag and a warning in the startup log.
3. **Connector hosts.** Tier 1 shares a host; Tier 2 uses one deployment per connector; Tier 3 uses one
   host per connector. Confirm this grouping.
4. **Latency.** Each call adds a secret read. Measure it on the Razorpay path before accepting the design,
   and decide whether a short-lived cache is allowed.

# Non-goals

- Protecting against root on a connector's own host. That risk moves to the connector host and is limited
  by keeping that host small and locked down. It is not removed at any tier.
- Changing the release format or the policy engine. Those are unaffected.

# Acceptance

The RFC is ready to build when:

- the secrets store is chosen (open question 1);
- the migration steps are agreed;
- the tier grouping is confirmed (open question 3).

When built, G-128 is closed only after a Razorpay release has run end to end through the separate
connector service, with core never reading the secret, and the result is recorded.
