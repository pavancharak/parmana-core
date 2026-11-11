# 2.29 Signal-Freshness Enforcement at Execution Time (G-31)

Source: CLAIMS.md (commit d1d63c6), lines 1013-1048.

## Exact claim text

## 2.29 Signal-Freshness Enforcement at Execution Time (G-31)

A signed Execution Authorization is also bound to the exact runtime signals its decision rested on, not merely the policy and content it approved: `RuntimeEngine.execute()` computes `signalsHash` — a canonical hash of the `PolicySignals` object evaluated for that decision, via the same `TrustRecordHasher` idiom 2.27's `policyContentHash` uses — and includes it inside the signed `ExecutionAuthorizationPayload` (`packages/runtime/src/RuntimeEngine.ts`). This closes the one gap 2.27 left open: policy content was already re-checked at the execution boundary, but the vendor status, risk exposure, market conditions, or other real-world facts a policy's `boundSignals`/`SignalStateVerifier` cares about were verified once, pre-authorization, and never again.

`ExecutionRequest` carries the same `signals` the authorization was signed under (`packages/execution-system/src/ExecutionRequest.ts`, populated by `ExecutionRequestBuilder` from the persisted `BusinessTransaction.signals`), and `ExecutionGateway` optionally accepts a `SignalStateVerifier` (`ExecutionGatewayOptions.signalStateVerifier` — the same port `@parmana/policy` already defines and `RuntimeEngine` already uses pre-authorization, reused here rather than reimplemented). When supplied, and when the authorization carries a `signalsHash` and the request carries `signals` (older authorizations signed before this check existed carry neither), the gateway recomputes the signals hash and compares it to the signed value — a mismatch sets `signalsStillCurrent: false` and is reported in `GatewayVerificationResult.signalsHashMismatch`. When the hash matches, the gateway independently re-verifies those signals against real-world state via `SignalStateVerifier.findViolations` — any divergence also sets `signalsStillCurrent: false`, reported in `GatewayVerificationResult.signalDivergence`, and fails `verify()` before the connector is ever invoked, in the same ordered check sequence `policyStillCurrent` sits in (`packages/execution-gateway/src/ExecutionGateway.ts`).

This check is opt-in and additive, not a behavior change for existing deployments: omitting `signalStateVerifier`, or verifying an authorization signed before `signalsHash` existed, leaves `signalsStillCurrent` absent (not failed) — the same "absent means skipped" convention `policyStillCurrent` already uses — and `isSoleFailureNonceReplay` treats an absent/undefined check as passing, so it does not spuriously reclassify a stale-signals rejection as a nonce replay. In production, only capabilities with a configured `SignalStateVerifier` get a real re-verification, and none is configured in this version; every action's `findViolations` call returns an empty array (nothing to check), the same discipline every capability-scoped `SignalStateVerifier` implementation already follows. The check also only has effect when decision and execution are actually separated in time; this codebase's own `RuntimeEngine`/`ExecutionGateway` wiring runs both synchronously in one call today, so its practical value is for a `SignedExecutionAuthorization` handed to a decoupled downstream receiver (e.g. an `HttpExecutionSystem`-based deployment) that verifies and executes independently, potentially much later, up to `maxTtlSeconds` — exactly the use this authorization type's own "receiving systems" doc comment describes as supported.

Evidence

- `packages/shared/src/domain/execution-authorization.ts` (`signalsHash` on `ExecutionAuthorizationPayload`)

- `packages/runtime/src/RuntimeEngine.ts` (`signalsHash` computed and signed into the authorization payload)

- `packages/runtime/src/ExecutionRequestBuilder.ts`, `packages/execution-system/src/ExecutionRequest.ts` (`signals` carried through to the execution boundary)

- `packages/execution-gateway/src/ExecutionGateway.ts` (`signalStateVerifier` option, `signalsStillCurrent` check, `signalsHashMismatch`/`signalDivergence` reporting)

- `packages/execution-gateway/src/GatewayVerificationResult.ts` (`signalsStillCurrent`, `signalsHashMismatch`, `signalDivergence` fields)

- `packages/api/src/bootstrap/executionGatewaySignalStateVerifier.ts` (late-binding singleton resolving the Gateway↔verifier circular construction dependency in production wiring), `packages/api/src/bootstrap/createExecutionGateway.ts`, `packages/api/src/application.ts`

- `packages/execution-gateway/tests/unit/signal-freshness.test.ts` (9 cases: unchanged-signals pass, verifier-reported drift failure with named divergence, `execute()` throwing with the divergence named, request signals no longer hash-matching the authorization, check skipped — not failed — when no `signalStateVerifier` is wired and when the authorization carries no `signalsHash`, a request without `signals` failing against an authorization signed over signals, a request without `signals` checked as `{}` against one signed over no signals, a nonce-replay-only failure still correctly classified when the signals check was skipped)

- `packages/crypto/tests/unit/authorization-envelope.test.ts` (3 cases: `signalsHash` included and verifies unchanged, omitted when not supplied, a tampered `signalsHash` fails signature verification)

- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` (1 case, through the real `RuntimeBuilder`/`RuntimeEngine`/`ExecutionComponent` wiring: the produced authorization's `signalsHash` matches an independently recomputed hash of the transaction's signals, and the `ExecutionRequest` reaching the execution system carries those same signals)

- `docs/internal/VERIFICATION-GAPS.md` G-31 (full narrative, including what this does and does not close)

- `examples/tutorials/98-signal-freshness-enforcement/run.ts` (runnable narrative: one authorization, two independent receiving systems — one whose live re-check finds nothing changed and executes, one that finds the vendor blocked since authorization and is rejected with the divergence named, before its connector is ever invoked)

---

**Update (2026-10-03, follow up):** a request with no `signals` used to skip this check even when the authorization carried a `signalsHash`. It is now checked as `{}`, the value `RuntimeEngine` hashes for a transaction with no signals, so omitting signals passes only against an authorization signed over no signals, and is then still re-verified by the `SignalStateVerifier`. Evidence: `signal-freshness.test.ts` (the two new cases above).

## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `examples/tutorials/98-signal-freshness-enforcement/run.ts`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/bootstrap/createExecutionGateway.ts`: EXISTS
- `packages/api/src/bootstrap/executionGatewaySignalStateVerifier.ts`: EXISTS
- `packages/crypto/tests/unit/authorization-envelope.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/execution-gateway/src/GatewayVerificationResult.ts`: EXISTS
- `packages/execution-gateway/tests/unit/signal-freshness.test.ts`: EXISTS
- `packages/execution-system/src/ExecutionRequest.ts`: EXISTS
- `packages/runtime/src/ExecutionRequestBuilder.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts`: EXISTS
- `packages/shared/src/domain/execution-authorization.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                            | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/crypto/tests/unit/authorization-envelope.test.ts`          | passed | 15    | 15     | 0       |
| `packages/execution-gateway/tests/unit/signal-freshness.test.ts`     | passed | 10    | 10     | 0       |
| `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` | passed | 10    | 10     | 0       |
