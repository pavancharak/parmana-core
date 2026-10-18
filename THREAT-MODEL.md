# Parmana threat model

This document states what Parmana protects, from whom, how, and what stays exposed. Each
threat names the control that addresses it, the evidence for that control, and the residual
risk. The evidence is one of:

- an attack scenario you can run with `npm run evaluate -- EV-xx` (see
  [evaluations/scenarios.json](evaluations/scenarios.json));
- a claim in [docs/CLAIMS.md](docs/CLAIMS.md), cited by section number.

Reviewed on 2026-10-10 against `main`. When a claim, an enforcement point or an attacker
capability changes, this file changes in the same pull request.

## 1. System and scope

**In scope:** the Parmana server in this repository: the API, the runtime that evaluates
policy and signs authorizations, the execution gateway and execution control, the built in
connectors (HubSpot, GitHub, Slack, Paytm), release to registered external connectors, policy
and approver governance, and the records it signs. Also in scope: offline verification of
those records with `@parmana/envelope-verifier`, `@parmana/crypto` and `@parmana/sign`.

**Out of scope:**

- the downstream systems themselves (Paytm, HubSpot, GitHub, Slack, an external endpoint);
- the AI agent and the model behind it;
- the hosting platform, its network and its TLS;
- the people who approve.

Parmana assumes nothing about the agent. It treats every request as possibly hostile.

**Deployments covered:**

| Deployment                   | Notes                                                                                                                         |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Hosted API                   | Production mode, AWS KMS or local key files, Postgres                                                                         |
| Self hosted (Docker Compose) | The same server in production mode, keys as local files ([self hosted](https://docs.parmanasystems.com/self-hosted/overview)) |
| Public sandbox               | Demo only: acts on nothing, anyone can approve, published demo key (CLAIMS.md 2.51)                                           |
| Development and test         | Not covered. Settings such as `PARMANA_AUTH_DISABLED=true` remove protections on purpose                                      |

## 2. Assets

| Asset                                                                          | Why it matters                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Actions on downstream systems (refunds, merges, posts, edits)                  | The thing being protected. An unauthorized action is the main harm              |
| Authorization signing key (`default`)                                          | Signs authorizations and records. Whoever holds it can sign anything E3 accepts |
| Gateway key (`gateway`)                                                        | Signs gateway attestations and sessions                                         |
| Approver keys                                                                  | Sign human approvals. Held by approvers, not by Parmana                         |
| Step up keys                                                                   | Sign policy and approver changes. Held by the people who approve them           |
| Connector credentials (Paytm, HubSpot, GitHub, Slack)                          | Call the downstream system directly, without Parmana                            |
| API keys                                                                       | Identify callers. Stored only as SHA-256 hashes                                 |
| Policies and their approval records                                            | Decide what is allowed                                                          |
| Nonce store                                                                    | Makes authorizations and approvals single use                                   |
| Records: Trust Records, Refusal Records, Execution Intents, caller audit trail | The evidence of what was decided and done                                       |

## 3. Trust boundaries

```text
  AI agent / caller ──B1──▶ API ──▶ Runtime (policy, approvals) ──▶ Gateway ──B4──▶ Connector ──B5──▶ Downstream system
                                       ▲          │                                   (credential released here only)
  Approver ──B2 (signed approval)──────┘          │
  Maker and checker ──B3 (signed changes)──▶ Policy and approver governance
                                                  │
                                       Database ◀─┘ (B6)          Signed records ──B7──▶ Offline verifier
```

| Boundary                | Crossing                               | Enforcement point (see the [Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide#where-execution-is-blocked)) |
| ----------------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| B1 caller to API        | Every HTTP request                     | E1 API boundary: API key, capability, principal and tenant scoping                                                           |
| B2 approver to server   | A signed approval inside a request     | E2 decision: approval signature, trusted and unrevoked approver, bound to action, resource and amount, single use            |
| B3 governance           | Policy, approver and connector changes | Maker checker: a second human credential with a step up signature                                                            |
| B4 decision to release  | A signed authorization                 | E3 gateway: signature, expiry, content hash, current policy, signals, nonce                                                  |
| B5 release to connector | A connector call                       | E4 execution control: a valid single use session; the credential is released only here. E5: the receiver's own check         |
| B6 server to database   | Reads and writes                       | Database credentials; Parmana's checks assume the database is not attacker writable                                          |
| B7 record to verifier   | A signed record                        | Signature check with only the public keys, no server or database                                                             |

## 4. Attackers

| Attacker                                                                                                                  | In scope                        |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| A0. Anyone on the network, with no credentials                                                                            | Yes                             |
| A1. A caller with a valid agent API key, controlling the whole request (including a prompt injected or compromised agent) | Yes                             |
| A2. An attacker who captured a valid authorization or a used approval                                                     | Yes                             |
| A3. A holder of one governance credential (maker or checker, not both)                                                    | Yes                             |
| A4. An attacker who can read or alter stored records, but holds no signing key                                            | Yes, for tampering with records |
| A5. A holder of an approver key, the signing key, the gateway key or a connector credential                               | No (assumed not compromised)    |
| A6. An attacker with write access to the database                                                                         | No (assumed)                    |
| A7. One person holding both the maker and the checker credentials                                                         | No (assumed)                    |
| A8. An agent that holds its own credentials to a downstream system and never calls Parmana                                | No (outside the boundary)       |
| A9. Anyone who controls the host, container, image, build or source that Parmana runs from                                | No (assumed)                    |

The [Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide#what-an-attacker-controls)
gives the expected outcome for each of A5 to A7. In most cases the attack succeeds. They are
listed so that a review can state them as assumptions rather than leave them implicit.

A8 and A9 always succeed against Parmana itself, and Parmana cannot prevent either. A8 is
closed downstream, where a system accepts only Parmana's signed release (E5); see
[example 04](examples/04-verified-execution/README.md#an-agent-that-bypasses-parmana). Parmana governs only actions
that are routed through it: an agent with its own credentials to a system is not governed at
all (assumptions 5 and 6 below). Whoever controls the machine, image or code Parmana runs from
can change what it enforces or skip it; T17 reduces the chance that the published code or
image was altered, but nothing in Parmana defends a host its operator, or an attacker on it,
chooses to modify. On a self hosted copy the person running it is the operator and holds A5
to A9 by construction, so a challenge against such a copy only tests attackers A0 to A4.

## 5. Threats, controls and residual risk

| ID  | Threat                                                                               | Attacker       | Control                                                                                                                                                                                       | Evidence                                                                                                  | Residual risk                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------ | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | Request with no key, a bad key, or outside the key's scope                           | A0, A1         | E1 refuses before anything is evaluated; capability, principal and tenant are scoped per key                                                                                                  | EV-12; 2.16, 3.16                                                                                         | None known within scope                                                                                                                                                                              |
| T2  | A prompt injected agent requests an action no person approved                        | A1             | E2: an action whose policy needs approval is refused without a valid signed approval; declared facts cannot authorize                                                                         | EV-04; 2.42, 2.44, 2.47                                                                                   | An approval names the action and resource, not every parameter (for example Slack message text, a HubSpot stage). Parameters it does not cover are the agent's choice                                |
| T3  | Forged, altered, misdirected or reused approval                                      | A1, A2         | E2: signature by a trusted, unrevoked approver, bound to action, resource and amount, single use                                                                                              | EV-05; 2.42                                                                                               | A stolen approver key signs valid approvals (A5). One approver key is trusted in production today                                                                                                    |
| T4  | Declared facts describe one action while the Intent executes another                 | A1             | Bound signals must match the executed Intent before any rule evaluates                                                                                                                        | EV-06; 2.44                                                                                               | Only signals a policy binds are checked; a policy author can leave one out (a warning is logged, 2.30)                                                                                               |
| T5  | Request judged by a weaker policy, or by an outdated version                         | A1             | Each capability is bound to one policy; the gateway refuses an authorization whose policy is not the approved, current version                                                                | EV-07, EV-08; 2.22, 2.27, 2.36                                                                            | A policy that is approved but written too broadly allows what it allows. Signatures show a policy ran unmodified, not that it is right                                                               |
| T6  | Forged, altered, expired or replayed authorization                                   | A2             | E3: signature, expiry (including the exact instant), content hash, nonce                                                                                                                      | EV-01, EV-02, EV-03; 2.8, 2.10, 2.15                                                                      | Single use holds across instances only when they share one nonce store (Parmana's server uses Postgres). A receiver with its own store gets once per instance (3.2)                                  |
| T7  | Facts change between approval and execution                                          | A1             | The gateway re-checks the signed signals before release                                                                                                                                       | EV-09; 2.29                                                                                               | Only capabilities with a configured signal state verifier are re-checked; in production that is a small set (2.29)                                                                                   |
| T8  | The same business transaction runs twice by racing                                   | A1             | Atomic duplicate rejection in storage                                                                                                                                                         | EV-15; 2.20                                                                                               | None known within scope                                                                                                                                                                              |
| T9  | A code path in the server reaches a connector without the gateway                    | A1             | Only the gateway can release; checked by an architecture test over the package boundaries                                                                                                     | EV-11; 3.1                                                                                                | Enforcement is in software, not the network. Anyone with a connector credential (A5) can call the downstream system directly, unrecorded                                                             |
| T10 | A connector credential leaks to the caller, a decision or a record                   | A1             | Credentials resolved only in execution control, per call, never stored as state, redacted to a fingerprint                                                                                    | EV-10; 2.23, 3.10, 3.17                                                                                   | Proven for the built in connectors. A new built in connector must follow the same pattern; it is not inherited automatically                                                                         |
| T11 | A policy, approver or connector change made by one person                            | A3             | Maker checker: a second human credential with a step up signature; the change and approval are signed and chained                                                                             | EV-13; 2.26, 2.34, 2.45, 2.49                                                                             | The server cannot tell that two credentials belong to two people (A7). In the current production deployment one person holds both                                                                    |
| T12 | A signed record is altered, or a forged one is presented                             | A4             | Every field is in the signed canonical bytes; offline verification fails on any change; Executions are chained, and a partially chained one fails (G-89); audit events are chained per caller | EV-14; 2.5, 2.6, 2.32, 3.11                                                                               | Deleting a caller's whole history, or reordering rows across callers, is not caught by the per caller chain. An attacker with the database and the signing key (A5, A6) can rewrite history          |
| T13 | A policy name or version reads or writes outside the policy directory                | A1, A3         | Paths are confined to the policy directory                                                                                                                                                    | EV-16                                                                                                     | None known within scope                                                                                                                                                                              |
| T14 | An action is released but no evidence is written                                     | A1             | A signed Execution Intent is stored before release; if it cannot be, nothing is released                                                                                                      | 2.38, 2.39                                                                                                | If the Trust Record cannot be written after release, it is rebuilt from the execution context saved right after release (`POST /execution-intents/{id}/finalize`), so it is delayed rather than lost |
| T15 | Misconfiguration silently weakens enforcement                                        | Operator error | The server refuses to start on invalid or unsafe configuration (for example an unimplemented key provider, a sandbox with auth disabled)                                                      | 2.17                                                                                                      | Development settings remove protections on purpose; a deployment that sets them is not covered                                                                                                       |
| T16 | Load or slow requests deny service                                                   | A0, A1         | Per caller rate limit on `/execute`, limits on failed authentication and public routes; connector timeouts                                                                                    | 3.14                                                                                                      | No load guarantee. The pipeline has no overall timeout; connector calls do                                                                                                                           |
| T17 | A malicious dependency or build step                                                 | Supply chain   | Actions and base images pinned, Dependabot, CodeQL on every change, OpenSSF Scorecard, SLSA provenance for SDK releases and the server image                                                  | [Security overview](https://docs.parmanasystems.com/security/overview#automated-checks-on-the-repository) | The hosted API and sandbox are built by Vercel and have no signed provenance; only the published image does                                                                                          |
| T18 | A signal sent with the wrong type, so a limit rule does not fire (an amount as text) | A1             | Every signal the policy declares in `signalsSchema` must have that type before any rule runs; a mismatch is refused                                                                           | 2.52                                                                                                      | A signal the policy does not declare is not checked; an absent signal is left to the rules, where it satisfies no condition                                                                          |

For the same threats arranged by the OWASP Top 10 for LLM Applications and for Agentic
Applications (2026), see [OWASP mapping](https://docs.parmanasystems.com/security/owasp-mapping).

## 6. Assumptions

These are not defended. A review should state them as assumptions:

1. Signing keys (`default`, `gateway`) are not compromised. Under AWS KMS the key cannot be
   exported, but a process that can call `kms:Sign` can still sign.
2. Approver and step up keys are held by the people they name.
3. The maker and the checker are two people.
4. The database is not writable by an attacker.
5. Connector credentials are held only by Parmana's execution control.
6. Downstream systems accept actions only from Parmana, or verify its signed release (E5).
7. Policies are written correctly. Parmana proves which policy decided, not that it is right.
8. The host, container runtime, image and source Parmana runs from are not attacker
   controlled. Image provenance (T17) can be checked before deployment; integrity after that
   is the hosting platform's responsibility.
9. Agents reach governed systems only through Parmana: they hold no credentials of their own
   to those systems. This is a deployment property, not something Parmana enforces.

## 7. Prompt injection, specifically

Parmana does not detect prompt injection, and does not claim to. It limits what an injected
agent can achieve:

- An injected agent holds only its API key (A1). It cannot sign an approval, an authorization
  or a policy change.
- Any action whose policy needs approval is refused without a signed approval from a trusted
  person for that action and resource (EV-04). Since 2026-09-30 every agent action needs one,
  reads included (2.47).
- What the agent declares cannot authorize anything by itself (2.44). Bound signals must
  match the action executed (EV-06).
- A fact a policy sources from a business system (`signalSources`, 2.53, RFC-0023) is asked of
  that system by Parmana, never taken from the agent; an agent that proposes a different value
  is refused as `INVALID`. A source is registered only through maker checker, is asked with a
  query signed by Parmana, and, when registered with a key, must sign its answer; an unsigned,
  wrongly signed or non-echoing answer is refused as `SOURCE_UNAVAILABLE` (2.54). An agent cannot
  register, change or impersonate a source. A compromised source can still answer wrongly: Parmana
  proves the source said it, not that it is right (G-92).
- Under a policy with `requireAuthorityGrant`, an agent's key gets only the authority a grant gives
  it: one capability, within limits on each request, until an expiry (2.55). Grants are made only
  through maker checker, and never by or for the person approving, so an agent cannot widen its own
  authority. An expired grant refuses as `AUTHORITY_EXPIRED`. Limits are per request, not per day
  (G-93).
- What a decision rests on is signed into its authorization and re-checked by the gateway at release:
  a fact past its `validUntil`, or a grant expired or revoked since the decision, stops the release
  (2.56). An external endpoint receives the facts as signed conditions and can act only if they
  still hold (G-94).
- What remains: within an approved action and resource, any parameter the approval does not
  fix is the agent's choice, and a person can be persuaded to approve a request they did not
  read closely.

## 8. How this is checked

- `npm run evaluate` runs the 16 attack scenarios behind T1 to T13 and reports each one
  blocked or not, tied to the commit.
- The full test suite and the architecture tests run on every pull request.
- [SECURITY-CHALLENGE.md](SECURITY-CHALLENGE.md) invites anyone to break T1 to T13 on a copy
  they run themselves.
- Gaps found and closed are recorded in [docs/VERIFICATION-GAPS.md](docs/VERIFICATION-GAPS.md);
  security incidents in [04-INCIDENTS-LOG.md](04-INCIDENTS-LOG.md).

The reviews so far, including four passes over the authorization path (2.25), were internal.
No independent audit has been completed. The
[Audit guide](https://docs.parmanasystems.com/evaluation/audit-guide) is the starting point for
one.
