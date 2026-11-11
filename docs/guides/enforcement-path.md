# Enforcement path in `ExecutionGateway`

This guide describes how a signed authorization becomes a connector call, and what happens when it is refused. It covers the gateway's verification (`packages/execution-gateway/src/ExecutionGateway.ts`), the envelope and signature checks (`packages/envelope-verifier`, `packages/crypto`), the production wiring (`packages/api/src/bootstrap`), the issuance of authorizations (`packages/runtime/src/RuntimeEngine.ts`), and the handling of a refusal after release (`packages/runtime/src/components/ExecutionComponent.ts`).

The gateway is the last check before a connector runs. It does not decide whether an action is permitted. That decision is made upstream and recorded in the signed authorization. The gateway checks that the authorization still holds at the moment of release.

## 1. Entry point and setup

Callers invoke `ExecutionGateway.execute(request)` (`ExecutionGateway.ts:736`). It calls `verify(request)` and acts on the result. The connector runs only when `verify` returns `valid: true`.

The constructor (`ExecutionGateway.ts:278`) throws at startup in three cases:

1. Neither `connector` nor `executionControl` is supplied (line 296).
2. Both are supplied (line 304).
3. Policy binding is required and `policyRepository` or `policyApprovalVerifier` is missing (line 314).

Policy binding is required unless `allowUnverifiedPolicy` is set. The code comment says that flag is for legacy fixtures only.

Production wiring is in `packages/api/src/bootstrap/createExecutionGateway.ts:120`. It uses `executionControl`, not a direct connector. It does not set `allowUnverifiedPolicy`. It passes:

- the policy repository and policy approval verifier (policy binding, check 3);
- the signal state verifier, `executionGatewaySignalStateVerifier` (check 4);
- the authority grant repository (check 6);
- the authorization revocation list (check 8);
- `verificationOnlyKeys`, from `verificationOnlyKeysConfig()` in `packages/api/src/bootstrap/verifierKeyId.ts` (check 9). The key is `PARMANA_VERIFIER_KEY_ID`, default `signal-verifier`, and the allowed capabilities are `hubspot:deal-fetch`.

The signal state verifier is late-bound. `createApplication()` calls `.bind()` on it (`packages/api/src/application.ts:120`). Until that runs, every release that reaches check 4 throws "Signal/State Verifier is not bound". That is the intended fail-closed behavior, but it means a process that builds the gateway without calling `createApplication()` releases nothing.

## 2. Verification checks (`verify`, lines 346–682)

`verify` runs all nine checks and records each in a `checks` object. A failed check does not throw inside `verify`. Throwing happens in `execute`.

| #   | Check                       | Source                                      | Passes when                                                                         | Fails when                                                                      |
| --- | --------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1   | Envelope                    | `envelopeVerifier.verifyChecks` (line 361)  | Key resolves, signature verifies, version supported, not expired, TTL within policy | Any of those is false. See section 5.                                           |
| 2   | Content hash                | lines 369–383                               | Hash of rebuilt content equals signed `businessTransactionHash`                     | Content changed after signing                                                   |
| 3   | Policy binding              | lines 395–478                               | Live policy hash equals signed `policyContentHash`; approval record verifies        | Hash absent (fails closed), differs, policy not found, or approval invalid      |
| 4   | Signals                     | lines 480–537                               | Request signals hash equals signed `signalsHash`; no release-stage violations       | Hash absent (fails closed when verifier is wired), differs, or violations found |
| 5   | Business conditions         | lines 559–570                               | Every `validUntil` is later than `now`                                              | Any condition expired or unparseable                                            |
| 6   | Authority grant             | lines 572–588; `checkAuthorityGrant` at 688 | Grant unexpired, active for caller and capability, unexpired in registry            | Expired, revoked, replaced, or unreadable                                       |
| 7   | Decision                    | lines 595–596                               | Signed `decisionOutcome` is `"APPROVED"`                                            | Any other value                                                                 |
| 8   | Revocation                  | lines 602–607                               | Authorization ID not on revocation list                                             | Revoked, or read error (refuses release)                                        |
| 9   | Verification-only key scope | lines 612–615                               | Key not in `verificationOnlyKeys`, or capability in its allowed list                | Verification-only key used for a capability outside its list                    |

Only when all nine pass does the gateway consume the nonce (lines 617–645). Consumption is the only side effect in this path, so a forged or mismatched request cannot burn a nonce. Result: `valid = priorChecksPassed && nonceUnseen !== false` (line 648).

When `executionControl` is wired, the gateway leaves `nonceUnseen` undefined and does not consume the nonce here. See section 6.

### Notes on specific checks

- **Policy (check 3).** A missing `policyContentHash` is a failure under default configuration (lines 399–410). Binding passes only when hash and governance are both positively verified (lines 545–547).
- **Signals (check 4).** Requests without signals hash as `{}`, matching how the runtime hashes a transaction with no signals. Check 4 is refused entirely, not skipped, when the authorization has no `signalsHash` and the verifier is wired (line 492).
- **Authority grant (check 6).** The grant is re-read from the registry at release time, not trusted from the signature alone.
- **Verification-only keys (check 9).** Active in production since this change. A signed authorization from the verifier key for any capability outside `hubspot:deal-fetch` is refused. Nothing on `main` signs with that key yet. The HubSpot helper that does is on an unmerged branch (audit G-111).

## 3. Outcome after verification (`execute`, lines 739–760)

If `verify` returns `valid: false`, `execute` picks one of three outcomes:

1. **Nonce replay.** Only the nonce check failed and every other check passed (`isSoleFailureNonceReplay`, line 893). The gateway returns the recorded outcome for that nonce (`replayedOutcome`, line 804). Nothing runs again. If no outcome is recorded, it throws `NonceAlreadyConsumedError`. If the outcome is still in flight, it throws `OutcomeUnknownError`.
2. **Authorization no longer valid.** Only business conditions or the authority grant failed, and the policy is still bound (`isOnlyNoLongerValid`, line 911). The gateway throws `AuthorizationNoLongerValidError` with the reasons. The authorization is genuine but no longer applies. A forged or tampered request never takes this path.
3. **Any other failure.** The gateway throws an `Error` that names every failed check. Both hashes are included on a content mismatch.

## 4. Release to the connector (`execute` and `releaseToConnector`, lines 762–877)

1. **Freeze the content.** The verified content is deep-frozen (line 762), so nothing downstream can change it.
2. **Record the attempt.** If an outcome store is configured, `begin(nonce, expiresAt)` runs before dispatch (lines 774–783). A repeated or concurrent attempt that finds a row is answered from it and never reaches the connector.
3. **Dispatch** (`releaseToConnector`, line 822):
   - With `executionControl.service` (production), it calls `service.execute` with the authorization, frozen content, verification flags, and an attestation minted per authorization ID. Approvals pass through only when signals are still current.
   - With `executionControl.channel`, it calls `channel.release`, routed to a connector ID.
   - Without `executionControl`, it calls `connector.execute` directly.
4. **Complete the record.** `complete(nonce, result)` runs only after dispatch returns (line 792).

**Known defect (step 4).** Dispatch has no `try`/`finally`. If dispatch throws, `complete` never runs and the row stays `in_flight`. Every later attempt with the same nonce then gets `OutcomeUnknownError`, with the message "Do not retry. Check the external system before acting again." That is wrong when the connector never ran, for example when the capability is not registered. Section 8 shows this with a test. The fix is not made yet, because it needs a rule for telling a failure before dispatch from one after it.

## 5. Envelope and signature checks

Check 1 has two layers.

**The envelope verifier** (`packages/envelope-verifier/src/EnvelopeVerifier.ts`) supplies the checks and the nonce:

- **`verifyChecks`** (line 190) has no side effects. It resolves the signing key, then checks signature and version, expiry, and TTL.
- **TTL policy:** `expiresAt` must be after `authorizedAt`. The TTL must not exceed `maxTtlSeconds` (default 300). `authorizedAt` must not be more than 60 seconds in the future.
- **Key resolution** (line 154): with a `keyProvider`, the key is looked up by `keyId`. A revoked, expired, missing, or unreadable key fails closed. Without a provider, the static public key is used.
- **`consumeNonce`** (line 270) calls `nonceStore.checkAndRecord` and returns `false` for a nonce already seen.
- **`verify`** (line 289) consumes the nonce only if the side-effect-free checks pass.

The in-memory nonce store loses state on restart and is for tests only. Production uses `PostgresNonceStore` (`packages/api/src/bootstrap/createNonceStore.ts:28`), except under `NODE_ENV=test`.

**The signature checks** (`packages/crypto/src/AuthorizationVerifier.ts`) are what the envelope verifier calls:

- **Version first.** `payload.version` must equal 1 (`SUPPORTED_PAYLOAD_VERSION`). Any other value, including a missing field, returns all three checks false, and no signature is attempted.
- **Signature.** The payload is canonicalized by `CanonicalSerializer` and checked by `SignatureVerifier` against the signature provider. The verifier does not check whether the signer is authorized, only that the bytes match the key it was given.
- **Expiry.** `notExpired` is `now < expiresAt`, a strict comparison. An unparseable `expiresAt` is treated as expired.
- **Both are always evaluated.** There is no early return between the signature and expiry checks, to avoid a timing difference between them.
- **Hybrid mode.** `HybridSignatureProvider` requires exactly two signature entries, one for each configured algorithm. Each must verify under its own algorithm's public key. A missing, extra, duplicated, or mismatched entry is a rejection, not a partial pass.

`AuthorizationVerifier` does not check the nonce. Its own comment says nonce handling belongs to the receiving system.

## 6. Where the nonce is consumed in production

The gateway's `verify` consumes the nonce only when `executionControl` is not wired (`ExecutionGateway.ts:640–645`). Production wires `executionControl` (section 1). So in production the gateway does not consume the nonce.

The single consumption on the release path happens in the release verifier (`packages/api/src/bootstrap/createReleaseVerifier.ts`). It runs before the connector is looked up. In order, it checks the signature and expiry, the `APPROVED` decision, and the content hash, then consumes the nonce. `ExecutionControlService.ts:18` says consuming twice would refuse every release.

Consequence: if the release verifier passes but the connector lookup then fails, the nonce is already consumed. The authorization cannot be used again.

## 7. Issuing authorizations (`RuntimeEngine`)

The authorization is signed only on the approval path. The sequence in `RuntimeEngine.execute` (`packages/runtime/src/RuntimeEngine.ts`, line 799):

1. `decide(transaction)` returns the decision, policy content hash, signals, authority, and business validation.
2. `executionGate.enforce(decision)` (line 818) throws unless the decision is `APPROVED`. Signing is never reached for a refusal.
3. The executable content is built from the transaction's action, target, and parameters. Its hash is what the gateway later rebuilds and compares (check 2).
4. `signalsHash` is the hash of the signals the decision was made on.
5. `authorizationSigner.sign(...)` signs the payload (line 835). Its fields:
   - `decisionOutcome: "APPROVED"`, hardcoded, justified by step 2;
   - `policyName`, `policyVersion`, and `policyContentHash`;
   - `signalsHash`;
   - `submittedBy`, `grantedCapability`, and `tenantId`, when present in the transaction metadata;
   - `businessConditions`, from the validated signals, when business validation passed. Each carries its `validUntil`;
   - `authorityGrant`, when the authority has a grant, with its `grantId` and `validUntil`;
   - `executableContent`.
6. The TTL is `authorizationTtlSeconds`.

`RuntimeAuthorizationSigner` (`packages/runtime/src/RuntimeAuthorizationSigner.ts`) resolves the signing key per tenant, falling back to the `default` key when no tenant key exists. It then calls `AuthorizationSigner`. The nonce is generated by the signer. That step was not traced in this pass.

## 8. Refusal after release (`ExecutionComponent`)

`ExecutionComponent.execute` (`packages/runtime/src/components/ExecutionComponent.ts`) is one component in the runtime pipeline (`RuntimePipeline.ts:31`). Its sequence:

1. It creates the Execution record with mode `SYNC` and the authorization ID (before the `try`).
2. Inside the `try`, it builds the request and calls `executionSystem.execute(request)`.
3. On success, it attaches evidence and marks the Execution completed.
4. On any error, it calls `executionService.fail(execution)`, then rethrows the original error.

Points to note:

- **No refusal record is written after release.** Refusal records come from the decision path (`RuntimeEngine.writeRefusalRecord`), so a release refusal is recorded only as a failed Execution.
- **Ordering risk.** `fail` is awaited before the rethrow. If `fail` itself throws, the original refusal is lost. This was not tested.
- **The pipeline does not catch.** `RuntimePipeline` has no `try` around components, so the error propagates to the caller.

At the API, the error reaches `error-handler.ts`, which maps these refusals by their class:

| Refusal                           | Status                      | Source                                                              |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------- |
| `ConnectorNotRegisteredError`     | 503                         | `packages/shared/src/errors/connector-not-registered-error.ts`      |
| `NonceAlreadyConsumedError`       | 409                         | `packages/shared/src/errors/nonce-already-consumed-error.ts`        |
| `OutcomeUnknownError`             | 409                         | `packages/shared/src/errors/outcome-unknown-error.ts`               |
| `AuthorizationNoLongerValidError` | 409, with `executionStatus` | `packages/shared/src/errors/authorization-no-longer-valid-error.ts` |

Any other error reaches the generic 500 path. That path was not traced in detail.

## 9. Tests

### Test run

Command, from the repository root under Node 24:

```bash
npx vitest run packages/envelope-verifier packages/execution-gateway packages/api/tests/unit/release-nonce-path.test.ts packages/api/tests/integration/production-gateway.integration.test.ts packages/api/tests/integration/external-connector-release.integration.test.ts
```

Result: 30 test files and 276 tests, all passing.

Node 24 is required. The root test setup generates ML-DSA-65 keys, which Node 22 does not support. Tests also need a `.env.test` file copied from `.env.test.example`. The workspace packages are imported from `dist/`, so rebuild with `node node_modules/typescript7/bin/tsc -b` after any source change. Otherwise the dist-freshness check stops the run before any test executes. The `re2` native module must also be built (`npm rebuild re2`) if dependencies were installed with `--ignore-scripts`.

### What the tests cover

- **Decision outcome (check 7).** `enforcement-invariants.test.ts` signs `DECLINED` and checks the gateway refuses it, the connector is not called, and the nonce stays unrecorded. `release-nonce-path.test.ts` checks the same for the release verifier.
- **Verification-only keys (check 9).** `enforcement-invariants.test.ts` covers the three cases with a custom option. `production-gateway.integration.test.ts` covers the production wiring: a verifier-key authorization for `erp:create-invoice` is refused, and one for `hubspot:deal-fetch` passes. Without the option the verifier key would be unrestricted, so this test would fail. That is an inference from the code, not a mutation test.
- **Production nonce path.** `release-nonce-path.test.ts` wires the gateway to the real `createReleaseVerifier` through a stub execution-control service. A second release is refused and the connector runs once.
- **Production wiring, end to end.** `production-gateway.integration.test.ts` builds the gateway with the real `createExecutionGateway()` and binds the signal verifier with `createApplication()`. It signs with the production default key and the verifier key. The cases:
  1. a runtime-signed authorization passes every check against the real `access-control@1.0.0` policy hash;
  2. a release to an unregistered capability is refused with `ConnectorNotRegisteredError`, and a retry is answered with `OutcomeUnknownError` (the defect in section 4);
  3. verifier-key scope, both ways.
- **Signal checks (check 4).** Nine tests in `signal-freshness.test.ts`: unchanged signals pass (line 130); drift reported by the verifier fails and names the divergence (lines 181, 205); a request whose signals no longer match the signed hash fails with a named mismatch (line 224); no verifier wired means skipped, not failed (line 249); an authorization without `signalsHash` is refused at release (line 270); omitted signals hash as `{}`, and fail against a signed hash of real signals (line 291) but pass against a signed hash of `{}` (line 315); a replay with skipped signal checks is still classified as a replay (line 349).

### Limits of the production test

The production test cannot release to a connector. `createExecutionGateway` builds its execution-control service with no test-only connector registrations, so a successful release through the real factory is not possible without network or database setup. The test ends at the connector lookup.

## 10. Open items

In priority order. Each item names the reason it matters.

1. **Fix the outcome-record defect (section 4).** A release refused before dispatch leaves the row `in_flight`. Retries then tell the caller to check the external system, though nothing ran. The fix needs a rule that separates a failure before dispatch (the connector was never called) from one after it (it may have run). It also needs the production test's last assertion changed.
2. **Decide whether the release verifier should run after the connector lookup.** Today a lookup failure burns the nonce (section 6). That is safe, but it means a request to an unregistered capability can never be retried, even after the registration is added.
3. **Trace the failed-`fail()` case in `ExecutionComponent`.** If `executionService.fail` throws, the refusal is lost (section 8). Add a test or wrap the call.
4. **Trace the nonce generation in `AuthorizationSigner`** and confirm it is unique per authorization (section 7).
5. **Read the generic 500 path in `error-handler.ts`** to confirm which errors can leak details.
6. **Decide on the HubSpot helper branch** (`fix/hubspot-self-approval`). The verification-only key is now active in production, but nothing on `main` signs with it, so the containment is in place without its caller (audit G-111).

## Sources

All paths are relative to the repository root.

- `packages/execution-gateway/src/ExecutionGateway.ts`: constructor 278, `verify` 346, `checkAuthorityGrant` 688, `execute` 736, `replayedOutcome` 804, `releaseToConnector` 822, `isSoleFailureNonceReplay` 893, `isOnlyNoLongerValid` 911
- `packages/envelope-verifier/src/EnvelopeVerifier.ts`: `resolveKey` 154, `verifyChecks` 190, `consumeNonce` 270, `verify` 289
- `packages/envelope-verifier/src/MemoryNonceStore.ts`, `NonceStore.ts`
- `packages/crypto/src/AuthorizationVerifier.ts`, `SignatureVerifier.ts`, `providers/HybridSignatureProvider.ts`
- `packages/api/src/bootstrap/createExecutionGateway.ts`: 120, `verificationOnlyKeys` at 142
- `packages/api/src/bootstrap/verifierKeyId.ts`: `VERIFIER_READ_CAPABILITIES`, `verificationOnlyKeysConfig`
- `packages/api/src/bootstrap/createNonceStore.ts`: 28
- `packages/api/src/bootstrap/createReleaseVerifier.ts`
- `packages/api/src/bootstrap/executionGatewaySignalStateVerifier.ts`: late binding, 26–57
- `packages/api/src/application.ts`: `createApplication` 103, bind at 120
- `packages/api/src/middleware/error-handler.ts`: refusal mapping around line 200
- `packages/execution-control/src/ExecutionControlService.ts`: 18
- `packages/runtime/src/RuntimeEngine.ts`: `execute` 799, `executionGate.enforce` 818, signing 835
- `packages/runtime/src/RuntimeAuthorizationSigner.ts`
- `packages/runtime/src/components/ExecutionComponent.ts`
- `packages/runtime/src/RuntimePipeline.ts`: 31
- `packages/shared/src/errors/` (status codes)
- Tests: `packages/execution-gateway/tests/unit/` (`enforcement-invariants`, `signal-freshness`), `packages/api/tests/unit/release-nonce-path.test.ts`, `packages/api/tests/integration/production-gateway.integration.test.ts`, `packages/api/tests/integration/external-connector-release.integration.test.ts`
