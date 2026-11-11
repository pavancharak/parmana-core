# 2.27 Policy-Freshness Enforcement at Execution Time

Source: CLAIMS.md (commit d1d63c6), lines 968-987.

## Exact claim text

## 2.27 Policy-Freshness Enforcement at Execution Time

A signed Execution Authorization is bound to the exact policy content it was decided under, not merely the policy's `(name, version)` identifier: `RuntimeEngine.execute()` computes `policyContentHash` — a hash of the policy document actually loaded for that decision, via the same `TrustRecordHasher` other artifact hashes in this codebase use — and includes it inside the signed `ExecutionAuthorizationPayload` (`packages/runtime/src/RuntimeEngine.ts`). This is distinct from 2.26's "Content hash at decision time (G-24)", which stamps a content hash onto the persisted `ExecutionTrustRecord` for audit purposes; this hash is signed into the authorization itself and independently re-checked before execution is allowed to proceed.

`ExecutionGateway` optionally accepts a `PolicyRepository` (`ExecutionGatewayOptions.policyRepository`). When supplied, and when the authorization being verified carries a `policyContentHash` (older authorizations signed before this check existed do not), the gateway reloads the policy at the authorization's own `(policyName, policyVersion)` and recomputes its current content hash, comparing it against the signed value. A mismatch — whether from the policy's content changing in place or the policy no longer existing at that name/version at all — sets `policyStillCurrent: false`, is reported in `GatewayVerificationResult.policyContentMismatch`, and fails `verify()` before the connector is ever invoked, exactly like the existing `businessTransactionHash` check it sits alongside in the same ordered check sequence (`packages/execution-gateway/src/ExecutionGateway.ts`).

**Update (2026-09-20): this check is no longer opt in.** It fails closed by default (see 2.36). `ExecutionGateway` now requires a `PolicyRepository` and a policy approval verifier at construction, and an authorization that carries no `policyContentHash` is rejected with `policyStillCurrent: false` instead of being skipped. The only way to get the earlier "absent means skipped" behavior is the explicit, loudly named `allowUnverifiedPolicy: true` option, which production bootstrap does not set. The replay detection logic (`isSoleFailureNonceReplay`) still treats an undefined check as passing, which is safe because in the default mode every policy check is present and must be true for `valid` to be true.

Evidence

- `packages/runtime/src/RuntimeEngine.ts` (`policyContentHash` computed and signed into the authorization payload)

- `packages/execution-gateway/src/ExecutionGateway.ts` (`policyRepository` option, `policyStillCurrent` check, `policyContentMismatch` reporting)

- `packages/execution-gateway/src/GatewayVerificationResult.ts` (`policyStillCurrent`, `policyContentMismatch` fields)

- `packages/execution-gateway/tests/unit/policy-freshness.test.ts` (7 cases: unchanged-policy pass, changed-content-since-signing failure with named mismatch, `execute()` throwing with the mismatch named, policy no longer existing at that name/version, check skipped — not failed — when no `policyRepository` is wired, check skipped — not failed — when the authorization carries no `policyContentHash`, a nonce-replay-only failure still correctly classified when the policy check was skipped)

---


## Cited evidence paths

- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/execution-gateway/src/GatewayVerificationResult.ts`: EXISTS
- `packages/execution-gateway/tests/unit/policy-freshness.test.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/execution-gateway/tests/unit/policy-freshness.test.ts` | passed | 7 | 7 | 0 |
