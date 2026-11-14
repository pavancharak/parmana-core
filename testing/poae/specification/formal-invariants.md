# Formal invariants

**Status:** Phase 1 draft. These are the statements Phase 4 will model and check. They are not proven here.

## Notation

- `A` is a declared authority, `I` a requested action, `P` the policy, `D` the decision, `X` the executed action, `E` the evidence.
- `Authorize(A, I, P)` returns `D` in `{Approved, Denied}`.
- `Execute(I, D)` runs only when `D = Approved`.
- `Verify(E, A, P)` returns `Valid` or `Invalid`.

## Invariants

| ID    | Statement                                                                                                           | Property |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------- |
| INV-1 | `Execute(X) => D = Approved`                                                                                        | P1       |
| INV-2 | `Execute(X) => Hash(X) = Hash(I_authorized)`                                                                        | P2       |
| INV-3 | `Authorize` is a function: the same `(A, I, P)` gives the same `D`                                                  | H1       |
| INV-4 | A nonce is consumed at most once: a second release with the same nonce is refused                                   | P4       |
| INV-5 | `Verify(E, A, P) = Valid => E` is unchanged from the signed form                                                    | P5       |
| INV-6 | After revocation time `t_r` plus the propagation window `w`, no `Execute` under the revoked grant or key            | P6       |
| INV-7 | `Verify` over a ledger `L` returns `Invalid` if some completed execution in `L` has no record in the checkpoint `C` | P7       |
| INV-8 | If `Authorize` fails or cannot complete, `Execute` does not run and a refusal is recorded                           | P1, T27  |

## Mapping to the repository

| Invariant | Enforced by                                                     | Tested by                                                              |
| --------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| INV-1     | `ExecutionGateway.verify`, `execute`                            | XM-01 to XM-04, T09 (architecture test)                                |
| INV-2     | `checkExecutionCorrespondence`, `HttpConnector.wireContentHash` | EM-01, EM-02, EM-04 (record level)                                     |
| INV-3     | `Authorize` in the policy package, deterministic hash           | Tested in policy packages; not yet as a PoAE property                  |
| INV-4     | `NonceStore`, outcome store `begin`                             | RT-01, RT-02                                                           |
| INV-5     | `verifyExecutionTrustRecordOffline`, canonical signature check  | CE-01, CE-02, CE-03                                                    |
| INV-6     | Grant check at release (`checkAuthorityGrant`)                  | AM-02. Key revocation not implemented.                                 |
| INV-7     | `reconcileExecutionEvidence`                                    | CE-04 (pure). Not connected to a ledger or checkpoint.                 |
| INV-8     | Refusal recording in `ExecutionGateway.recordRefusal`           | XM-04 (execution not run). Recording of refusal not separately tested. |

## Notes for the formal model

- INV-2 depends on assumption A6. The model must state that the connector is trusted for this invariant, or model the connector as adversarial.
- INV-7 needs an independent checkpoint. Without one, the model shows only that reconciliation is correct over the records it is given.
- The invariants use `Hash` as an ideal function (collision-free). The model does not reason about hash breaks.
