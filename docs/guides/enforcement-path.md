# Enforcement path in `ExecutionGateway`

This guide describes how `ExecutionGateway` in `packages/execution-gateway/src/ExecutionGateway.ts` decides whether a signed authorization may release an action to a connector, and what it does with the result.

The gateway is the last check before a connector runs. It does not decide whether an action is permitted. That decision is made upstream and recorded in the signed authorization. The gateway checks that the authorization still holds at the moment of release.

## 1. Entry point and setup

Callers invoke `ExecutionGateway.execute(request)` (`ExecutionGateway.ts:736`). It calls `verify(request)` and acts on the result. The connector runs only when `verify` returns `valid: true`.

The constructor (`ExecutionGateway.ts:278`) throws at startup in three cases:

1. Neither `connector` nor `executionControl` is supplied (line 296).
2. Both are supplied (line 304).
3. Policy binding is required and `policyRepository` or `policyApprovalVerifier` is missing (line 314).

Policy binding is required unless `allowUnverifiedPolicy` is set. The code comment says that flag is for legacy fixtures only.

Production wiring is in `packages/api/src/bootstrap/createExecutionGateway.ts:120`. It uses `executionControl`, not a direct connector. It does not set `allowUnverifiedPolicy`. It also passes the policy repository, the policy approval verifier, the signal state verifier, the authority grant repository, and the authorization revocation list.

## 2. Verification checks (`verify`, lines 346–682)

`verify` runs every check and records each result in a `checks` object. A failed check does not throw inside `verify`. Throwing happens in `execute`.

| # | Check | Source | Passes when | Fails when |
|---|---|---|---|---|
| 1 | Envelope | `envelopeVerifier.verifyChecks` (line 361) | Key resolves, signature verifies, version is supported, not expired, TTL is within policy | Any of those is false. See section 5. |
| 2 | Content hash | lines 369–383 | Hash of the rebuilt executable content equals `businessTransactionHash` in the signed payload | Content was changed after signing |
| 3 | Policy binding | lines 395–478 | Live policy hash equals the signed `policyContentHash`, and the approval verifier confirms the approval record | Hash absent (fails closed), hash differs, policy not found, or approval record invalid |
| 4 | Signals | lines 480–537 | Hash of request signals equals the signed `signalsHash`, and no release-stage violations are found | Signals hash absent (fails closed when the verifier is wired), hash differs, or violations found |
| 5 | Business conditions | lines 559–570 | Every condition's `validUntil` is later than `now` | Any condition expired or has an unparseable date |
| 6 | Authority grant | lines 572–588, `checkAuthorityGrant` at 688 | Grant is unexpired, is the active grant for the caller and capability, and is unexpired in the registry | Expired, revoked, replaced, or unreadable |
| 7 | Decision | lines 595–596 | Signed `decisionOutcome` is `"APPROVED"` | Any other outcome |
| 8 | Revocation | lines 602–607 | Authorization ID is not on the revocation list | Revoked. A read error also refuses release. |
| 9 | Verification-only key scope | lines 612–615 | Key is not verification-only, or the capability is in its allowed list | Verification-only key used for a non-read capability |

Only when every check above passes does the gateway consume the nonce (lines 617–645). Consumption is the only step with a side effect, so a forged or mismatched request cannot burn a nonce.

The result is `valid = priorChecksPassed && nonceUnseen !== false` (line 648).

When `executionControl` is wired, the gateway does not consume the nonce here. It leaves `nonceUnseen` undefined. See section 6.

### Notes on specific checks

- **Policy (check 3).** Under the default configuration, a missing `policyContentHash` is a failure, not a skip (lines 399–410). Policy binding passes only when both the hash and the governance check are positively verified (lines 545–547).
- **Signals (check 4).** Requests without signals are hashed as `{}`, which matches how the runtime hashes a transaction with no signals. Omitting signals never skips the check.
- **Authority grant (check 6).** The grant is re-read from the registry at release time, not trusted from the signature alone.

## 3. Outcome after verification (`execute`, lines 739–760)

If `verify` returns `valid: false`, `execute` picks one of three outcomes:

1. **Nonce replay.** Only the nonce check failed and every other check passed (`isSoleFailureNonceReplay`, line 893). The gateway returns the recorded outcome for that nonce (`replayedOutcome`, line 804). Nothing runs again. If no outcome is recorded, it throws `NonceAlreadyConsumedError`. If the outcome is still in flight, it throws `OutcomeUnknownError`.
2. **Authorization no longer valid.** Only business conditions or the authority grant failed, and the policy is still bound (`isOnlyNoLongerValid`, line 911). The gateway throws `AuthorizationNoLongerValidError` with the reasons. The authorization is genuine but no longer applies. A forged or tampered request never takes this path.
3. **Any other failure.** The gateway throws an `Error` that names every failed check. Both hashes are included on a content mismatch.

## 4. Release to the connector (`execute` and `releaseToConnector`, lines 762–877)

1. **Freeze the content.** The verified executable content is deep-frozen (line 762), so nothing downstream can alter it.
2. **Record the attempt.** If an outcome store is configured, `begin(nonce, expiresAt)` runs before the connector call (lines 774–783). If a row already exists, the request is answered from it and never reaches the connector. This protects against a repeated or concurrent attempt.
3. **Dispatch.** `releaseToConnector` (line 822) sends the request in one of two ways:
   - With `executionControl.service`, it calls `service.execute` with the authorization, the frozen content, the verification flags, and an attestation minted for this authorization ID. Approvals are passed through only when signals are still current.
   - With `executionControl.channel`, it calls `channel.release`, routed to a connector ID.
   - Without `executionControl`, it calls `connector.execute` directly.
4. **Complete the record.** `complete(nonce, result)` is called after dispatch (line 792).

## 5. Envelope verifier (`packages/envelope-verifier`)

`EnvelopeVerifier` provides the checks behind check 1 and the nonce consumption.

- **`verifyChecks`** (`EnvelopeVerifier.ts:190`) has no side effects. It resolves the signing key, then checks:
  - signature and version, via `AuthorizationVerifier` from `@parmana/crypto`
  - expiry (`notExpired`)
  - TTL: `expiresAt` must be after `authorizedAt`, the TTL must not exceed `maxTtlSeconds` (default 300 seconds), and `authorizedAt` must not be more than 60 seconds in the future
- **Key resolution** (`EnvelopeVerifier.ts:154`). With a `keyProvider`, the key is looked up by `keyId`. A key that is revoked, expired in the key-expiry store, missing, or unreadable fails closed. Without a provider, the static public key is used.
- **`consumeNonce`** (`EnvelopeVerifier.ts:270`) calls `nonceStore.checkAndRecord`. It returns `false` for a nonce already seen.
- **`verify`** (`EnvelopeVerifier.ts:289`) runs the checks and consumes the nonce only if they pass.

The in-memory nonce store (`MemoryNonceStore.ts`) loses state on restart. The code warns that it must not be used in production. Production uses `PostgresNonceStore` (`packages/api/src/bootstrap/createNonceStore.ts:28`), except under `NODE_ENV=test`.

## 6. Where the nonce is consumed in production

The gateway's `verify` consumes the nonce only when `executionControl` is not wired (`ExecutionGateway.ts:640–645`). Production wires `executionControl` (section 1). So in production the gateway does not consume the nonce.

The single consumption on the release path happens in the release verifier (`createReleaseVerifier`). `ExecutionControlService.ts:18` says consuming twice would refuse every release.

This means the nonce check in production depends on the release verifier. A release that bypasses the gateway and reaches the release verifier still consumes the nonce once. Verifying this path is an open item in section 8.

## 7. Invariants

These properties follow from the code above. Each one should have a test that fails if it breaks.

- A request that fails any check never runs a connector.
- A failed or forged request never consumes a nonce.
- A missing policy hash, signals hash, or approval record is a failure, not a pass, unless `allowUnverifiedPolicy` is set.
- Only a signed decision of `APPROVED` can release.
- Dispatched content is the frozen content that was verified.
- A repeated nonce returns the recorded outcome and never reaches the connector a second time.

Tests in `packages/execution-gateway/tests/unit/` cover parts of this. These are the most relevant files: `execution-gateway.test.ts`, `release-recheck.test.ts`, `policy-freshness.test.ts`, `signal-freshness.test.ts`, and `execution-control.test.ts`.

## 8. Test results and open items

### Test run

Command, from the repository root under Node 24:

```bash
npx vitest run packages/envelope-verifier packages/execution-gateway
```

Result: 28 test files and 266 tests, all passing. This includes the 259 existing tests and 7 added to cover the gaps below.

Node 24 is required. The root test setup generates ML-DSA-65 keys, which Node 22 does not support, so every file fails during setup on Node 22. Tests also need a `.env.test` file copied from `.env.test.example`, and `PARMANA_POLICY_DIR` set to `./policies`.

The workspace packages are imported from `dist/`. Rebuild with `node node_modules/typescript7/bin/tsc -b` after any source change, or the dist-freshness check stops the run before any test executes.

### Coverage of the enforcement invariants

The gaps found in the earlier review are now covered by these tests:

1. **Decision outcome.** `packages/execution-gateway/tests/unit/enforcement-invariants.test.ts` signs a payload with `decisionOutcome: "DECLINED"` and checks that the gateway refuses it, the connector is not called, and the nonce stays unrecorded (`ExecutionGateway.ts:595–596`). The production release verifier has its own copy of this check, tested in `packages/api/tests/unit/release-nonce-path.test.ts`.
2. **Verification-only keys.** The same file tests all three cases: a capability outside the list is refused (`ExecutionGateway.ts:612–615`), a capability on the list is allowed, and a key not on the list is unrestricted. Production does not pass `verificationOnlyKeys`, so this check is inactive in production. Its tests show the code is correct, not that it is in use.
3. **Production nonce path.** `packages/api/tests/unit/release-nonce-path.test.ts` wires the gateway to the real `createReleaseVerifier` through an execution-control service. The first release succeeds, a second release of the same authorization is refused with `NonceAlreadyConsumedError`, and the connector runs once. The enforcement-invariants file also checks that the gateway itself leaves the nonce unconsumed when `executionControl` is wired.

To confirm the new decision and key-scope tests fail when those checks are broken, both checks were weakened temporarily. Two tests failed, one for each check. The source was then restored and rebuilt.

4. **Signals.** Nine tests in `packages/execution-gateway/tests/unit/signal-freshness.test.ts` cover the release-stage signal check (section 2, check 4):
   - Unchanged signals with no drift pass, and `signalsStillCurrent` is `true` (line 130).
   - Drift reported by the verifier fails the check and names the divergence (lines 181 and 205).
   - A request whose signals no longer match the signed hash fails with a named mismatch (line 224).
   - No verifier wired means the check is skipped, not failed (line 249).
   - An authorization without a `signalsHash` is refused at release (line 270).
   - Omitted signals hash as `{}`, so a request that omits signals fails against a signed hash of real signals (line 291), and passes against a signed hash of `{}` (line 315).
   - A replay that also has skipped signal checks is still classified as a replay (line 349).

### Next steps

In priority order. Each item names the reason it matters.

1. **Decide on `verificationOnlyKeys`.** Production does not pass this option (`packages/api/src/bootstrap/createExecutionGateway.ts:120`), so the check at `ExecutionGateway.ts:612–615` never runs in production. Either wire it with a real key list, or remove the option and its tests. Leaving it as is suggests a protection that does not exist.
2. **Read the signature checks in `@parmana/crypto`.** Check 1 and the envelope verifier depend on `AuthorizationVerifier`. This code has not been read yet, so the guide cannot yet confirm the signature and version claims in sections 2 and 5.
3. **Read how authorizations are issued (`RuntimeEngine`).** `decisionOutcome`, `signalsHash`, and the nonce are set there. The gateway's checks are only as strong as what is signed upstream.
4. **Test the full production wiring.** The release-nonce test in `packages/api/tests/unit/release-nonce-path.test.ts` uses the real release verifier with a stub execution-control service. Production uses `ExecutionControlService` and `createExecutionGateway`, which need database, vault, and signer setup. That wiring has no end-to-end test.
5. **Trace how a refusal is handled after release.** The call sites in `packages/runtime` (`ExecutionComponent`) decide whether a thrown refusal is recorded, retried, or surfaced. This has not been read.

Already read and covered in this guide: `createReleaseVerifier` (`packages/api/src/bootstrap/createReleaseVerifier.ts`), which is the production release-time check and the single nonce consumption on that path.

## Sources

All paths are relative to the repository root.

- `packages/execution-gateway/src/ExecutionGateway.ts` (constructor 278, `verify` 346, `checkAuthorityGrant` 688, `execute` 736, `replayedOutcome` 804, `releaseToConnector` 822, `isSoleFailureNonceReplay` 893, `isOnlyNoLongerValid` 911)
- `packages/envelope-verifier/src/EnvelopeVerifier.ts` (`resolveKey` 154, `verifyChecks` 190, `consumeNonce` 270, `verify` 289)
- `packages/envelope-verifier/src/MemoryNonceStore.ts`, `NonceStore.ts`
- `packages/api/src/bootstrap/createExecutionGateway.ts` (120)
- `packages/api/src/bootstrap/createNonceStore.ts` (28)
- `packages/execution-control/src/ExecutionControlService.ts` (18)
