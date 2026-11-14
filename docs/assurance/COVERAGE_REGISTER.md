# Coverage register

**Status:** Current as of 14 November 2026, at commit `91ace38f`. Update it whenever a claim's coverage changes.
**Rule:** A product claim is made only where this register says it is covered. Anything marked "not covered" or "open" must not be presented as working.

## 1. Coverage by claim

| Claim                                                                 | Covered                     | Not covered                                                 | Evidence                                                                              |
| --------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Authorized content matches what the gateway verified before dispatch  | Yes, for every release      | Changes after the gateway's check                           | `ExecutionGateway.verify`, `execution-gateway.test.ts`                                |
| Each released result records authorized and dispatched content hashes | Yes, record level           | Vendor adapters                                             | `ExecutionGateway.execute`, `execution-gateway.test.ts` (correspondence tests)        |
| The dispatched hash reflects the outbound request                     | HTTP connector only         | `GatewayHttpAdapter`, `GatewayExternalAdapter`              | `HttpConnector`, `http-connector-wire-hash.test.ts`; see `OPEN_ITEMS_DESIGN.md` (D10) |
| A trust record's executions correspond to its embedded authorization  | Yes, offline                | Records without the correspondence fields are "not checked" | `checkTrustRecordCorrespondenceOffline`, its tests                                    |
| A completed execution has a trust record                              | Pure function only          | The stored ledger                                           | `reconcileExecutionEvidence`; see D11                                                 |
| Signatures are accepted only in canonical encoding                    | Yes, Ed25519 and Dilithium3 | Other verifiers outside this repository                     | `canonicalSignatureBytes`, `canonical-signature-encoding.test.ts`                     |
| A revoked grant cannot authorize execution                            | Yes                         | Revocation registry faults                                  | Benchmark AM-02                                                                       |
| Authority is bound to a version                                       | No                          | All                                                         | Gap G-A, benchmark AM-04; see D12                                                     |
| Only the execution gateway can execute                                | Yes, by architecture test   | Not run as a benchmark test                                 | `tests/architecture/execution-boundary.test.ts` (EM-03)                               |
| A third party can verify evidence without trusting Parmana            | No                          | All                                                         | Target; see D11 (option C)                                                            |

## 2. Benchmark coverage

- 20 tests in the specification (`testing/poae/benchmark-spec.md`).
- 18 run in `tests/assurance/poae/poae-benchmark.test.ts`, all passing on commit `bbe92321`.
- EM-03 is covered by an existing architecture test. AM-04 is a gap.
- XM-01 and XM-02 test the content hash, not a policy limit or an approved vendor list.
- EM-01, EM-02 and EM-04 are record-level tests.

## 3. Frozen cryptographic core (confirmed 14 November 2026, D8)

These files would be frozen. A change needs an owner review and new test vectors:

- `packages/crypto/src/ArtifactSigner.ts`
- `packages/crypto/src/TrustRecordHasher.ts`
- `packages/crypto/src/CanonicalSerializer.ts`
- `packages/crypto/src/ExecutionTrustRecordCanonicalView.ts`
- `packages/crypto/src/OfflineVerifier.ts`
- `packages/crypto/src/providers/signature/` (all files, including `canonicalSignatureBytes.ts`)
- `packages/crypto/src/providers/hash/` (all files)

Not frozen: `ExecutionCorrespondenceOffline.ts`, which is new and additive.

Confirmed by the owner under D8. It is not yet enforced by a test; enforcing it is a separate step.

## 4. Open items

| Item                                  | Decision | Status                                     |
| ------------------------------------- | -------- | ------------------------------------------ |
| Vendor adapter hash                   | D10      | Pending                                    |
| Ledger connection and external anchor | D11      | Pending                                    |
| Authority version                     | D12      | Pending                                    |
| Frozen-core list                      | D8       | Draft in section 3, pending confirmation   |
| CI gate for the benchmark             | D13      | Accepted in principle; not yet implemented |
