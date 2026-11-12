# Architecture

[Back to the README](../../README.md) · [Developer docs index](README.md)

## How it works

The chain is **authorize, verify, execute, confirm**. A Business Transaction carries an explicit authority, authorization and intent. A deterministic policy evaluates it and approves or rejects it. An approved transaction executes through a gateway that never gives the caller real credentials. The result is signed into an append-only Execution Trust Record, which can be verified without trusting Parmana's runtime or database.

```
Authority --> Authorization --> Intent --> Business Transaction
                                                  |
                                                  v
                                          Policy Engine (deterministic)
                                                  |
                                                  v
                                              Decision
                                                  |
                                                  v
                                          Execution Gateway
                                     (credentials are not returned to the caller)
                                                  |
                                                  v
                                        Connector -> real system
                                                  |
                                                  v
                              Execution Trust Record (signed, append-only)
                                                  |
                                                  v
                                Verification  <-->  Settlement Confirmation
```

| Package                        | Role                                                                                                                                     |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `@parmana/api`                 | REST API: `/execute`, `/verification`, webhooks, caller authentication                                                                   |
| `@parmana/runtime`             | Orchestrates a Business Transaction through policy, execution and evidence                                                               |
| `@parmana/policy`              | Deterministic policy evaluation, sequential rules, first-match semantics                                                                 |
| `@parmana/execution-gateway`   | The sole boundary that releases an approved request to a connector                                                                       |
| `@parmana/execution-control`   | Credential-isolating, single-use execution release                                                                                       |
| `@parmana/connector-sdk`       | Connector authoring contract: capability definitions, schemas, and the Connector and CredentialProvider interfaces                       |
| `@parmana/envelope-verifier`   | Verifies a Parmana authorization independently, with no trust in Parmana's runtime or database                                           |
| `@parmana/crypto`              | Signing and verification: Ed25519 by default; ML-DSA-65 (post-quantum) in the Node packages, which need Node 24 and OpenSSL 3.5 or later |
| `@parmana/approval`            | Verifies signed approvals issued by a business authority, independent of the caller and of Parmana's runtime                             |
| `@parmana/capability-registry` | Binds each capability to the policy that governs it, and refuses a request that names another                                            |
| `@parmana/execution-system`    | The interface approved requests are forwarded through, with an HTTP implementation                                                       |
| `@parmana/governance-ui`       | Internal UI to propose and review policy changes; approval stays on the approver's machine                                               |
| `@parmana/replay`              | Deterministic reconstruction of a past policy decision                                                                                   |
| `@parmana/storage`             | Append-only persistence, in memory or PostgreSQL-backed                                                                                  |
| `@parmana/shared`              | Domain model and configuration shared across every package                                                                               |

Key properties:

- **Fail-closed configuration:** a misconfigured process refuses to start rather than degrade silently.
- **Credential isolation:** a connector never receives long-lived credentials, only a single-use session.
- **Single-use authorizations:** a nonce is accepted once.
- **Append-only signed evidence**, with both classical (Ed25519) and post-quantum (ML-DSA-65, in the Node packages) signing.

## How external systems connect

Parmana sits between the parties that want an action and the systems the action changes. Three roles connect to it.

| Role                    | Connects to                           | How                                                                                                                                                       |
| ----------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents, apps and people | Parmana core                          | The HTTP API (`/execute`, `/policies/in-effect`, approvals), the TypeScript and Python SDKs, or the MCP tools in parmana-connect, which call the same API |
| Approvers               | Parmana core                          | Signed approvals through maker and checker. The signing key stays on the approver's machine                                                               |
| Connectors              | Parmana core, and the business system | Parmana releases an approved action to the connector as a signed release. The connector calls the business system with its own credentials                |

```
Agent / app / person
  |  request (HTTP API, SDK or MCP)
  v
Parmana core: policy, approval, signed decision, trust record
  |  signed release, only for an approved action
  v
Connector: verifies signature, audience, expiry and replay
  |  call with the connector's own credentials
  v
Business system (CRM, payments, chat ...)
  |  result returns: connector -> core (recorded) -> caller
```

These rules hold at every step:

- A business system never calls Parmana, and a caller never calls a connector or a business system directly.
- Parmana core does not hold the credentials for a business system that an external connector serves.
- A connector runs only an action that Parmana has approved and signed for it, and it runs that action once. A repeated release with the same transaction id gets the first answer back, and the action does not run again.

**Current state.** Built-in connectors are not in this repository. They moved to connector services outside it; see [ADR-0018](../internal/adr/ADR-0018-Connectors-Outside-Core.md). New connectors are built outside this repository and are registered through the flow described below.

## Reads, writes and executions

Parmana gates every kind of action the same way. A read, a write, or an execution runs only after a signed human approval, and reads included: a policy rule that approves an action must require that approval.

The action is carried out by an external connector, not by this repository. Parmana releases the approved action to the connector's endpoint as a signed release, and the connector performs the HTTP call its manifest declares. A capability marked `effect: read` must use `GET`. That rule is in [parmana-connect](https://github.com/pavancharak/parmana-connect), and it is not yet merged to its `main` branch (G-156). The external path has not yet been run against a deployed Parmana (G-133).
