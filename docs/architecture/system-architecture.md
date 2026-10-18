# System Architecture

Canonical, implementation-derived overview of Parmana's architecture: what each package is responsible for, how a business action flows from HTTP request to audited receipt, and where the repository's architectural boundaries are enforced.

This document describes the system **as implemented**, verified against source as of Phase 1G. It does not describe intended or historical architecture. Where earlier design documents disagree with this one, this one and the document it is built on win:

- [`repository-invariants.md`](./repository-invariants.md) — the Phase 1F canonical list of automatically-enforced architectural invariants, with the exact test that enforces each one.

This document doesn't repeat its content; it's the entry point that ties it together with package responsibilities and the surrounding subsystems (authorization, signal verification, replay, audit) it doesn't cover end to end. For a class-by-class narrated trace of one request, see [The Execution Pipeline](https://docs.parmanasystems.com/architecture/execution-pipeline) on the documentation site. For how to extend the system safely, see [`../connectors/BUILDING_A_CONNECTOR.md`](../connectors/BUILDING_A_CONNECTOR.md).

---

## 1. Repository overview

Parmana is an authorization layer for AI-initiated execution: it sits between an AI system's _decision_ to take an action (a payment, a CRM update, an API call) and the _business system_ that actually performs it, and it guarantees that action only happens if it was policy-approved, signed, verified, and auditable — never on the AI's say-so alone. Every action, reads included, also needs a signed approval from a trusted person for that action and its resource (`docs/architecture/repository-invariants.md` Invariant 8).

The repository is an npm-workspaces monorepo (`packages/*`, plus `examples/` and `typescript/`). Each package under `packages/` is independently built (`tsc -b` via TypeScript project references) and independently tested (`vitest`).

## 2. Package responsibilities

| Package                      | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Owns production execution?                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `@parmana/shared`            | Core domain types shared across the whole repo (`BusinessTransaction`, `ExecutionTrustRecord`, `ExecutableContent`, `ExecutionResult`, repository interfaces). No behavior, just contracts.                                                                                                                                                                                                                                                                                                                                                                             | No                                                                |
| `@parmana/crypto`            | Signing/verification/hashing primitives (Ed25519, Dilithium3/hybrid post-quantum, canonical JSON hashing) used to produce Authorizations, Trust Records, Receipts, and Refusal Records.                                                                                                                                                                                                                                                                                                                                                                                 | No                                                                |
| `@parmana/policy`            | The Policy Engine: loads a `Policy`, evaluates signals against its rules, produces a `PolicyDecision` (APPROVE/REJECT). Also defines the `SignalStateVerifier` interface (§5) and `CompositeSignalStateVerifier`.                                                                                                                                                                                                                                                                                                                                                       | No                                                                |
| `@parmana/replay`            | Deterministic reconstruction of a past execution from its Trust Record, for auditability.                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | No                                                                |
| `@parmana/receipt`           | Cryptographically-signed Receipt generation once a Trust Record exists. Imports the `ExecutionPermit` _type_ from `execution-control` to shape its model — no executable dependency.                                                                                                                                                                                                                                                                                                                                                                                    | No                                                                |
| `@parmana/storage`           | Persistence: Postgres/Supabase and in-memory implementations of the repository interfaces `@parmana/shared` defines (`BusinessTransactionRepository`, `ExecutionTrustRecordRepository`, etc.).                                                                                                                                                                                                                                                                                                                                                                          | No                                                                |
| `@parmana/envelope-verifier` | Signature/expiry/nonce verification primitives `ExecutionGateway` composes into its `verify()` sequence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                | No                                                                |
| `@parmana/execution-system`  | Defines the `ExecutionSystem` interface (`execute(request): Promise<ExecutionResult>`) — the seam `RuntimeEngine`'s pipeline calls through, and that `ExecutionGateway` implements. Also ships `DefaultExecutionSystem`/`HttpExecutionSystem` as alternate, non-production implementations of the same interface.                                                                                                                                                                                                                                                       | No                                                                |
| `@parmana/runtime`           | `RuntimeEngine`: policy evaluation, signal/intent binding, signal-state verification, authorization signing, and pipeline orchestration (`RuntimeComponent` stages) up to calling the injected `ExecutionSystem`. `ExecutionTrustApplication` wraps this with accept → run → verify → receipt. **Never** imports `execution-gateway`, `connector-sdk`, or `connector-hubspot` — enforced (Invariant 4, `repository-invariants.md`).                                                                                                                                     | No                                                                |
| `@parmana/execution-control` | `ExecutionControlService`, `SecureConnector` implementations (`SessionCredentialSecureConnector`), `ConnectorExecutor`/`ConnectorPolicy`/`CredentialVault` interfaces. The layer between `ExecutionGateway` and a concrete connector: session-scoped credential issuance, policy re-check, audit. Depended on only by `execution-gateway` and `api` — enforced (Invariant 6).                                                                                                                                                                                           | No — defines the seams; doesn't implement a vendor adapter itself |
| `@parmana/execution-gateway` | **Owns production execution.** `ExecutionGateway.execute()` is the sole production execution API (envelope verification → `ExecutionControlService` → adapter dispatch). Internally owns connector registration, credential-backed dispatch, and every vendor adapter (`GatewayHubSpotAdapter`, `GatewayGitHubAdapter`, `GatewaySlackAdapter`, `GatewayPaytmAdapter`, `GatewayExternalAdapter`, `GatewayHttpAdapter`) — none of which are part of its public API; callers use three factory functions instead (§7). Depended on only by `api` — enforced (Invariant 6). | **Yes — exclusively** (Invariant 2)                               |
| `@parmana/connector-sdk`     | Passive SDK: capability constants, request/response DTOs, the `Connector`/`CredentialProvider` interfaces, `MockConnector` (test double), and reference mocks for SAP, Oracle, Workday and Salesforce. Zero `fetch()` calls anywhere in its `src/` — enforced (Invariant 1).                                                                                                                                                                                                                                                                                            | No                                                                |
| `@parmana/connector-hubspot` | Same pattern as `connector-sdk`, scoped to HubSpot: capability constants, DTOs, signal-verification definitions. Zero `fetch()` calls — enforced.                                                                                                                                                                                                                                                                                                                                                                                                                       | No                                                                |
| `@parmana/api`               | The HTTP application: routes, bootstrap/composition root (`packages/api/src/bootstrap/*`), webhooks. Composes every other package into a running server. Routes only ever call `ExecutionTrustApplication.execute(...)`; bootstrap only constructs, never calls `.execute(` — both enforced (Invariant 5).                                                                                                                                                                                                                                                              | No (composes, doesn't execute)                                    |

**No exception today.** The one documented exception, `RazorpaySettlementProcessor.ts`, a read-only webhook fetch-verify that called a connector's `.execute()` directly, was removed with the Razorpay connector on 2026-08-12. See Invariant 3 in `repository-invariants.md`.

## 3. The execution pipeline

One production execution pipeline exists, permanently enforced by `tests/architecture/execution-boundary.test.ts` (Invariants 1–6):

```
HTTP request
  → packages/api/src/routes/{execute.ts, transactions.ts}
      → ExecutionTrustApplication.execute()        (packages/runtime/src/ExecutionTrustApplication.ts)
          → Runtime.execute()                       (packages/runtime/src/Runtime.ts)
              → RuntimeEngine.execute()              (packages/runtime/src/RuntimeEngine.ts)
                  [policy evaluation, signal verification, authorization — see §4/§5]
                  → RuntimePipeline: TrustChainValidationComponent → ExecutionComponent
                      → ExecutionComponent.execute()
                          → (injected) ExecutionSystem.execute()
                              → ExecutionGateway.execute()                (packages/execution-gateway/src/ExecutionGateway.ts)
                                  → ExecutionControlService.execute()      (packages/execution-control/src)
                                      → SecureConnector.execute()          (SessionCredentialSecureConnector)
                                          → SdkConnectorExecutor.execute() (packages/execution-gateway/src/connector-execution)
                                              → Connector.execute()        (GatewayHubSpotAdapter / GatewayGitHubAdapter / GatewaySlackAdapter / GatewayPaytmAdapter / GatewayExternalAdapter)
                                                  → Business System
                  → BusinessTrustPipeline.execute()  → ExecutionTrustRecord
          → VerificationService.verify()
          → ReceiptService.generate()
```

A class by class trace of one request, with every point where it can stop: [The Execution Pipeline](https://docs.parmanasystems.com/architecture/execution-pipeline) on the documentation site.

**Production binding:** `ExecutionSystem` is bound to `ExecutionGateway` exactly once, in `packages/api/src/bootstrap/createExecutionSystem.ts` — its own doc comment calls this "the single architectural entry point for execution-system composition." No other `ExecutionSystem` implementation is constructed in production bootstrap.

## 4. Authorization pipeline

Two independent signatures gate every execution:

1. **Runtime-issued Authorization** — `RuntimeAuthorizationSigner.sign()` (inside `RuntimeEngine.execute()`), only reached after `ExecutionGate.enforce(decision)` passes (i.e., only for an `APPROVED` policy decision). Binds a `decisionId`, `businessTransactionId`, `policyName`/`policyVersion`, and the exact `ExecutableContent` about to be released, with a TTL.
2. **Gateway-verified envelope** — `ExecutionGateway.verify()` independently re-checks, in order: protocol version, signature, expiry, TTL-vs-policy, business-transaction content hash (the frozen `ExecutableContent` must hash-match what was signed), and nonce-unseen (replay protection, §5). Only if every side-effect-free check passes does it consume the nonce; only then does it proceed to `ExecutionControlService`.
3. **Gateway attestation, per call** — `ExecutionControlService` re-authenticates the Gateway itself (`authenticator.authenticateGateway(...)`) before resolving a connector, and `SessionCredentialSecureConnector` issues a one-time, capability-scoped session before a credential is ever handed to a connector.

No stage trusts a decision made by an earlier stage without re-verifying its own concern — the Gateway doesn't trust that Runtime's authorization was well-formed just because it exists; it re-verifies the signature and content hash itself.

## 5. Signal verification

Two distinct mechanisms guard against a caller supplying signals that don't reflect reality, both inside `RuntimeEngine.execute()`, both running _before_ authorization is ever signed:

- **Signal/Intent binding** (`SignalIntentBinder.findViolations`, `@parmana/policy`) — runs before policy evaluation. Proves the declared signals describe the _same action_ as the Intent about to be authorized (closes the gap where a small, verifiable signals payload could be paired with an Intent that silently targets something else). A violation is treated as an ordinary policy REJECT.
- **Signal/State verification** (`SignalStateVerifier.findViolations`, optional, wired via `RuntimeBuilder.withSignalStateVerifier`) — runs only when the provisional decision is APPROVE. Checks signed human approvals (`ApprovalSignalVerifier`, `@parmana/approval`) and independently re-fetches real state from the vendor where a verifier exists (`HubSpotSignalStateVerifier`, via `executeHubSpotCapability`, which sign a fresh authorization and call the _same_ injected `ExecutionSystem`/`ExecutionGateway` — not a separate path) and overrides the decision to REJECT on mismatch. A REJECT here means **no authorization is ever generated** — this is why a policy denial makes zero calls to the external system for ordinary rejections, but does make one for a state-mismatch check on an otherwise-approved decision.

Production wiring: `createApprovalSignalVerifier.ts`, `createHubSpotSignalStateVerifier.ts` and `createSlackChannelSignalVerifier.ts` (`packages/api/src/bootstrap/`), composed via `CompositeSignalStateVerifier` (`@parmana/policy`), threaded into `RuntimeFactory.create()`'s `signalStateVerifier` parameter.

## 6. Replay protection

Nonce-based, enforced inside `ExecutionGateway.verify()` (`GatewayVerificationResult.checks.nonceUnseen`): the nonce is checked last, and only consumed once every side-effect-free check (signature, expiry, TTL, content hash) has already passed — so a request that fails on some other ground never burns its nonce, but a request replayed with an already-consumed nonce is rejected before it can reach `ExecutionControlService`. Backed by `@parmana/envelope-verifier`'s `NonceStore` (in-memory for tests/examples, a durable store in production).

## 7. Audit generation

Two independent audit trails, at two different layers, for two different purposes:

- **Execution-control audit** — `ExecutionControlService` and `SessionCredentialSecureConnector` write to the shared `ExecutionAuditSink` on session creation, credential acquisition, and execution completion (see `ExecutionAuditEvent`, `packages/execution-gateway/src/connector-runtime/types.ts` — the interface; the live implementation is production-configured, not the dead `connector-runtime/MemoryExecutionAuditSink`). One sink per registry — `GatewayConnectorRegistry.register()` requires it unless a connector explicitly opts into `legacyInsecure`.
- **Trust Record / Receipt** — the durable, signed evidentiary artifacts: `BusinessTrustPipeline` assembles the `ExecutionTrustRecord` from the runtime context after the pipeline completes; `ReceiptService.generate()` produces a signed `Receipt` from it. Refused (non-approved) decisions get their own signed, third-party-verifiable `RefusalRecord` instead (RFC-0021), written by `RefusalRecordBuilder` before `ExecutionGate.enforce()` is called — a refusal is evidenced even though nothing downstream of it ever executes.

## 8. Dependency graph

Verified acyclic (Phase 1F, Invariant 6 — `tests/architecture/execution-boundary.test.ts`'s package-level ownership checks; also `npx tsc -b`'s project-reference build order, which fails on a cycle by construction):

```
shared          →  (everything else depends on this; depends on nothing internal)
crypto          →  shared
policy          →  shared, crypto                              (never depends on runtime — enforced)
envelope-verifier → shared, crypto
execution-system → shared
receipt         → execution-control (type-only), execution-system, shared
runtime         → policy, shared, crypto, execution-system      (never execution-gateway/connector-*  — enforced)
execution-control → shared, crypto                               (no dependents outside execution-gateway/api — enforced)
connector-sdk   → crypto, envelope-verifier, execution-system, policy, shared
connector-hubspot → connector-sdk, crypto, envelope-verifier, execution-system, policy, shared
execution-gateway → connector-sdk, connector-hubspot, crypto, envelope-verifier, execution-control, execution-system, shared
api             → everything (the composition root)
```

Note the direction: `execution-gateway` depends on `connector-sdk`/`connector-hubspot` (for capability constants and DTOs), never the reverse — this is what makes Invariant 1/2 (connector packages own no execution) structurally coherent rather than just a naming convention.

## 9. Extension model

See [`../connectors/BUILDING_A_CONNECTOR.md`](../connectors/BUILDING_A_CONNECTOR.md) for the full guide. Summary: new vendor integrations are added _inside_ `execution-gateway` (a new `Gateway*Adapter` implementing `connector-sdk`'s `Connector` interface, registered via `createGatewayConnectorRegistry()`), never inside a connector package directly — that boundary is what Invariants 1 and 2 permanently enforce. New capabilities, signal verifiers, and policies each have a narrower, package-local extension point; components that must never be modified directly (the pipeline's core stages, `ExecutionGateway.execute()`'s verification sequence, the credential-handling seam) are listed explicitly there.
