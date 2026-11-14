# Security properties

**Status:** Phase 1 draft. These are proposed properties. None is proven. Each row states what currently holds, and what does not.

## Properties

| ID  | Property                                                                                                           | Status in the repository (14 November 2026)                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| P1  | Authorization safety: no action enters controlled execution without a valid authorization decision                 | Enforced by `ExecutionGateway.verify` and tested (XM-01 to XM-04). Not formally proven.                                  |
| P2  | Action correspondence: the executed action matches the authorized action                                           | Record level: `checkExecutionCorrespondence`, tested. Connector level: HTTP connector only. Vendor adapters not covered. |
| P3  | Authority version consistency: the authorization references the correct authenticated authority and policy version | Policy hash bound and checked (XM-03). Authority identifier bound. Version not bound (gap, AM-04).                       |
| P4  | Replay resistance: a consumed authorization cannot authorize another execution                                     | Nonce consumption and outcome store, tested (RT-01, RT-02).                                                              |
| P5  | Evidence integrity: modification of authenticated evidence is detected                                             | Signed trust record checked offline, tested (CE-01). Records outside the signed view are not covered.                    |
| P6  | Revocation effectiveness: new execution is denied after effective revocation                                       | Grant revocation tested (AM-02). Key revocation and propagation latency not implemented.                                 |
| P7  | Evidence completeness: missing records are detected against an independent sequence                                | Pure reconciliation tested (CE-04). Not connected to the ledger. No external checkpoint.                                 |

## Assumptions

Each property holds only under these assumptions. A property is not claimed outside them.

- **A1 Signing keys:** the private key of a trusted signer is not compromised. Compromise is a separate scenario (T24).
- **A2 Trust root:** the public keys used by the verifier are obtained from a source the verifier trusts.
- **A3 Cryptographic primitives:** SHA-256 and Ed25519 (and ML-DSA where used) are not broken within the test's time bound.
- **A4 Policy source:** the policy repository returns the policy that was approved, or an error. Silent substitution is a scenario (T26), not an assumption.
- **A5 Clock:** the timestamps used for expiry are correct within the stated tolerance.
- **A6 Connector:** for P2, the connector sends the body it was given. For the HTTP connector this is checked by the wire hash. For other connectors it is assumed, and that assumption is the gap in D10.

## Distinctions the research must keep

The research must not treat these as one property.

| Concept                | Meaning                                             | Established by                                   |
| ---------------------- | --------------------------------------------------- | ------------------------------------------------ |
| Integrity              | The data is unchanged since it was signed           | Hash and signature (P5)                          |
| Authenticity           | A known key signed it                               | Signature under a trusted key (A1, A2)           |
| Authority              | The key holder was entitled to authorize the action | Not established by a signature. Requires P1, P3. |
| Execution authenticity | The connector sent the authorized action            | Requires P2, and A6                              |
| Completeness           | No record is missing                                | Requires P7, and an independent sequence         |

A valid signature establishes authenticity and integrity only. It does not establish authority, execution, or completeness.
