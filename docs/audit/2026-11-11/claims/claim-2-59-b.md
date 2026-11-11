# 2.59 Schema Version 3 Hybrid Records Verify in the SDKs, Including the Whole-Record Message (Scoped, 2026-11-07)

Source: CLAIMS.md (commit d1d63c6), lines 1533-1551.

## Exact claim text

## 2.59 Schema Version 3 Hybrid Records Verify in the SDKs, Including the Whole-Record Message (Scoped, 2026-11-07)

**Claim.** The Python and TypeScript SDKs verify a hybrid Execution Trust Record: one Ed25519 entry and one ML-DSA-65 entry. For schema version 3, the signed message covers every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts`. A field added or a covered value changed after signing makes the record invalid. The result reports `coverage: "full"` when this holds.

**Scope.** The server still issues schema version 2. Turning schema version 3 on is a separate step, not yet taken (parmana-core #291). ML-DSA-65 needs `cryptography` 47 or later in Python and Node 24 or later in TypeScript. The TypeScript SDK no longer supports Node 20 or 22.

**Evidence.**

- `python/parmana/crypto/offline_verifier.py` (`_verify_hybrid_entries`, `_hybrid_message`)
- `typescript/src/crypto/offline-verifier.ts` (`verifyHybridEntries`, `hybridMessage`)
- `typescript/test/whole-record-v3-offline.test.ts`, `python/tests/test_whole_record_v3_offline.py`
- The fixture is written by the server's own signing code: `scripts/generate-whole-record-v3-fixture.ts`

# 3. Conditional Claims

The following claims are true only under an explicitly stated scope. The scope clause is load-bearing: removing it makes the claim false.

---


## Cited evidence paths

- `python/parmana/crypto/offline_verifier.py`: EXISTS
- `python/tests/test_whole_record_v3_offline.py`: EXISTS
- `scripts/generate-whole-record-v3-fixture.ts`: EXISTS
- `typescript/src/crypto/offline-verifier.ts`: EXISTS
- `typescript/test/whole-record-v3-offline.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `python/tests/test_whole_record_v3_offline.py` | not-run-or-missing | 0 | 0 | 0 |
| `typescript/test/whole-record-v3-offline.test.ts` | passed | 3 | 3 | 0 |
