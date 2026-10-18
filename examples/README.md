# Parmana Examples

Welcome to the Parmana Examples directory.

This directory contains tutorials, production scenarios, shared assets, and audit artifacts
demonstrating how Parmana authorizes, executes, verifies, and proves enterprise AI decisions.

---

## Structure

```
examples/
├── tutorials/              104 numbered, single-concept tutorials (see table below)
├── scenarios/
│   ├── expense-approval
│   └── purchase-order
├── audit/
│   └── AS-001-approved-vendor-payment   an example audit package (all evidence from one run)
├── shared/                 helper functions, reference policies, common transactions
├── 04-verified-execution/  runs its own receiving-side HTTP server on a free port
├── sandbox-playground/     the Playground scripts (cURL, PowerShell, TypeScript, Python) for the public sandbox
└── archive/                superseded examples, kept for history only
```

---

## Tutorials

Tutorials introduce Parmana one concept at a time, in `examples/tutorials/`. Numbering has a
few intentional gaps (61, 63–68, 85) from tutorials that were removed or never built when the
Razorpay connector was deliberately removed from the codebase (see `docs/CLAIMS.md`,
"Key Compromise Notice" section and the connector-removal history) — the sequence below is the
authoritative, current list (also the exact list `npm run examples` executes, in
`scripts/run-examples.ts`).

Tutorial coverage is not exhaustive: not every `docs/CLAIMS.md`-documented capability has a
dedicated tutorial (for example, §2.27's `policyStillCurrent` policy-freshness check has none as
of this writing). New tutorials get added when a capability's own narrative — "here's the
exact before/after that makes this concrete" — earns the cost of a new numbered entry, not
automatically alongside every change.

| #   | Topic                                                    |
| --- | -------------------------------------------------------- |
| 01  | Hello World                                              |
| 02  | Policy Evaluation                                        |
| 03  | Runtime Execution                                        |
| 04  | Policy Router                                            |
| 05  | Verification                                             |
| 06  | Replay                                                   |
| 07  | Receipt Generation                                       |
| 08  | Human Approval                                           |
| 09  | REST API                                                 |
| 10  | End-to-End                                               |
| 11  | Execution Authorization                                  |
| 12  | Envelope Verification                                    |
| 13  | Post-Quantum Signatures                                  |
| 14  | Custom Policy                                            |
| 15  | Custom Runtime Component                                 |
| 16  | Runtime Pipeline                                         |
| 17  | Multi Policy Routing                                     |
| 18  | Runtime Hooks                                            |
| 19  | Runtime Composition                                      |
| 20  | Batch Execution                                          |
| 21  | Partial Failure Handling                                 |
| 22  | Idempotent Execution                                     |
| 23  | Production Deployment                                    |
| 24  | SDK Integration Patterns                                 |
| 25  | Execution Permit Generation                              |
| 26  | Execution Authorization Verification                     |
| 27  | Authorization Expiration                                 |
| 28  | Envelope Replay Detection                                |
| 29  | Authorization Tampering                                  |
| 30  | Policy Version Pinning                                   |
| 31  | Authorization Binding                                    |
| 32  | Execution Pipeline                                       |
| 33  | Execution Boundary                                       |
| 34  | Execution Gateway                                        |
| 35  | Replay Attack                                            |
| 36  | Parameter Tampering                                      |
| 37  | Action Substitution                                      |
| 38  | Target Substitution                                      |
| 39  | Policy Substitution                                      |
| 40  | Signature Forgery                                        |
| 41  | Expired Authorization                                    |
| 42  | Nonce Reuse                                              |
| 43  | Stolen Authorization                                     |
| 44  | Direct API Bypass                                        |
| 45  | Connector Bypass                                         |
| 46  | TOCTOU Protection                                        |
| 47  | Canonical JSON                                           |
| 48  | Deterministic Hashing                                    |
| 49  | Detached Signatures                                      |
| 50  | Ed25519 Signatures                                       |
| 51  | Dilithium3 (Post-Quantum)                                |
| 52  | Hybrid Signatures                                        |
| 53  | Hybrid-Signed Execution Trust Record                     |
| 54  | Execution Receipt                                        |
| 55  | Execution Receipt Verification                           |
| 56  | Complete Execution Flow                                  |
| 57  | Credential Isolation                                     |
| 58  | Session Credentials                                      |
| 59  | Secure Connectors                                        |
| 60  | End-to-End Enterprise Execution                          |
| 62  | Signal/Intent Binding                                    |
| 69  | HubSpot Deal Update Connector                            |
| 70  | HubSpot Policy Denial                                    |
| 71  | HubSpot Signal-State Verification                        |
| 72  | HubSpot Approval Artifact                                |
| 73  | Refusal Records                                          |
| 74  | Refusal Record Fail-Open                                 |
| 75  | Signed Audit Events                                      |
| 76  | Caller Principal Scoping                                 |
| 77  | Caller Ownership Scoping                                 |
| 78  | Duplicate Transaction Race                               |
| 79  | Storage Backend Selection                                |
| 80  | Fail-Closed Config Validation                            |
| 81  | Connector Execution Gateway                              |
| 82  | Composite Signal-State Verification                      |
| 83  | Capability/Policy Binding (TD-22)                        |
| 84  | Caller Authentication                                    |
| 86  | Gateway Attestation                                      |
| 87  | Key Provider Path Traversal                              |
| 88  | Malformed Request Handling                               |
| 89  | Readiness Probe                                          |
| 90  | OpenAPI Self-Description                                 |
| 91  | Graceful Shutdown                                        |
| 92  | Public API Boundary                                      |
| 93  | Trust Record Ordering                                    |
| 94  | SDK HTTP Transport                                       |
| 95  | Generic Approval Verifier                                |
| 96  | GitHub PR Merge Connector                                |
| 97  | Execution Chain Integrity                                |
| 98  | Signal-Freshness Enforcement (G-31)                      |
| 99  | Key/Algorithm Binding Guard                              |
| 100 | Authorization Is Caller-Type-Agnostic                    |
| 101 | Fail-Closed Caller-Authentication Audit Writes           |
| 102 | Distinguishable HTTP Status for Policy Denial and Replay |
| 103 | Policy Governance (Maker-Checker)                        |
| 104 | Policy Governance Execution Verification                 |
| 105 | Tenant Key Isolation                                     |
| 106 | API Key Issuance (writing a new policy)                  |
| 107 | Offline Verification                                     |
| 108 | Public-Key Discovery                                     |
| 109 | Durable-Evidence Key Rotation                            |
| 110 | Hybrid-Signature Downgrade Protection                    |
| 111 | Connect an Agent to Parmana                              |
| 112 | Slack Connector                                          |

---

## Scenarios

Production-style business workflows in `examples/scenarios/`:

- Expense Approval
- Purchase Order

(Vendor Payment is demonstrated inline within several tutorials and in `examples/audit/`,
rather than as its own top-level scenario directory.)

Each scenario executes the complete Parmana lifecycle: authorize, verify, execute, confirm.

---

## Audit

`examples/audit/AS-001-approved-vendor-payment/` is an example audit package containing every
piece of evidence one real execution produces:

- Business Transaction
- Authority
- Authorization
- Intent
- Execution Trust Record
- Verification
- Receipt

---

## Shared

`examples/shared/` holds reusable helper utilities used across examples: helper functions,
common transactions, and reference policies.

---

## Running the Examples

```bash
npm install
```

Run the entire tutorial + scenario suite, including `04-verified-execution` (excludes
`09-rest-api`, which needs a running Parmana API server — see its own README):

```bash
npm run examples
```

No `.env` or `keys/` is needed. For anything not set in your environment or `.env`, the runner
uses local, offline defaults (`PARMANA_POLICY_DIR=./policies`, `PARMANA_STORAGE=memory`,
`KEY_PROVIDER=local`, `PRIMARY_SIGNATURE_PROVIDER=ed25519`) and signs with throwaway Ed25519 keys
in a temporary directory that it deletes afterwards. It prints which defaults it used. Values you
set yourself always take precedence.

Run one tutorial directly:

```bash
npx tsx examples/tutorials/01-hello-world/run.ts
```

Run one scenario directly:

```bash
npx tsx examples/scenarios/expense-approval/run.ts
```

---

## Learn More

See the Parmana documentation (`docs/`) for architecture, policy authoring, runtime,
verification, replay, storage, and API reference. For building a new connector specifically,
start with `docs/architecture/CONNECTOR_ISOLATION.md` and `docs/connectors/BUILDING_A_CONNECTOR.md`.
