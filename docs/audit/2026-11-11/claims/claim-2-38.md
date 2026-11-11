# 2.38 Signing Readiness Before Release, Explicit Failure After Release

Source: CLAIMS.md (commit d1d63c6), lines 1287-1311.

## Exact claim text

## 2.38 Signing Readiness Before Release, Explicit Failure After Release

Before an action is released to a connector, the runtime proves that the evidence signing path can currently produce a signature that verifies. If it cannot, the request is refused with `503 SIGNING_UNAVAILABLE` and nothing is executed. If the action was released and the signed Execution Trust Record then cannot be produced or persisted, the failure is reported as `500 EXECUTION_RECORD_INCOMPLETE`, naming the `businessTransactionId` and `authorizationId`, with a critical log event, instead of a generic `500` that reads as "nothing happened". The decision is recorded in `docs/internal/adr/ADR-0011-Signing-Readiness-And-Explicit-Post-Release-Failure.md`.

- The probe (`VerificationCrypto.probeSigning()`) signs a synthetic artifact over 4096 bytes through the same signer and key id used for trust records and verifies it against the public key the same signer publishes. It catches a missing, disabled or denied key, a KMS or network outage, a signing and verification key mismatch, and the KMS size limit.
- A success is cached for 60 seconds, a failure is never cached, and concurrent requests share one probe.
- It is enforced everywhere except when `NODE_ENV` is exactly `test` or `development`, and no environment variable can switch it off in production.
- A failure before release, such as a policy rejection, is not reclassified as a released action.

Scope, stated plainly:

- This does not guarantee that every executed action has a signed trust record. A transient failure between the readiness check and the real signing, or a database failure after release, still leaves an executed action with no signed record. It narrows the window and makes the failure explicit and reconcilable. **Superseded on 2026-09-21 by section 2.39:** a signed Execution Intent is now stored before release, and a missing record can be rebuilt.
- There was no two phase record and no rebuild path for a missing record (G-53 in `docs/internal/VERIFICATION-GAPS.md`) when this section was written. Section 2.39 adds both, with the limits stated there.
- Verified in tests. The failure responses (`503 SIGNING_UNAVAILABLE`, `500 EXECUTION_RECORD_INCOMPLETE`) are proven in unit tests, not by live fault injection.

Evidence

- `packages/runtime/src/SigningReadiness.ts`, `RuntimeEngine.ts`, `Runtime.ts`, `errors/SigningUnavailableError.ts`, `errors/ExecutionRecordIncompleteError.ts`
- `packages/crypto/src/VerificationCrypto.ts` (`probeSigning`), `packages/api/src/bootstrap/createSigningReadiness.ts`, `packages/api/src/application.ts`
- `packages/runtime/tests/unit/signing-readiness.test.ts` and `execution-record-incomplete.test.ts` (readiness failure leaves the release counter at zero, failure after release is `EXECUTION_RECORD_INCOMPLETE` with the identifiers and a critical log, a persistence failure is reported the same way, a policy rejection before release is not reclassified)
- `packages/crypto/tests/unit/signing-probe.test.ts` (matching key passes, missing key fails, mismatched public key fails)
- `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`

---


## Cited evidence paths

- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/internal/adr/ADR-0011-Signing-Readiness-And-Explicit-Post-Release-Failure.md`: EXISTS
- `packages/api/src/application.ts`: EXISTS
- `packages/api/src/bootstrap/createSigningReadiness.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts`: EXISTS
- `packages/crypto/src/VerificationCrypto.ts`: EXISTS
- `packages/crypto/tests/unit/signing-probe.test.ts`: EXISTS
- `packages/runtime/src/SigningReadiness.ts`: EXISTS
- `packages/runtime/tests/unit/signing-readiness.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/unit/bootstrap/create-signing-readiness.test.ts` | passed | 4 | 4 | 0 |
| `packages/crypto/tests/unit/signing-probe.test.ts` | passed | 3 | 3 | 0 |
| `packages/runtime/tests/unit/signing-readiness.test.ts` | passed | 5 | 5 | 0 |
