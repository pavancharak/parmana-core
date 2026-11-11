# 2.11 Trust Record Bound to Its Authorization

Source: CLAIMS.md (commit d1d63c6), lines 269-280.

## Exact claim text

## 2.11 Trust Record Bound to Its Authorization

The Execution Trust Record's authorizationId is part of the canonical content that is hashed and signed, not merely attached alongside it. Tampering with it changes the recomputed Trust Record hash.

Evidence

- BusinessTrustRecordBuilder (renamed from ExecutionTrustRecordBuilder)

- packages/runtime/tests/unit/execution-authorization-wiring.test.ts: "trust record references the authorization"

---


## Cited evidence paths

No backticked repo path in this claim.

## Test results from the full run (vitest full run, 403 files, 0 failed)

No cited test file.
