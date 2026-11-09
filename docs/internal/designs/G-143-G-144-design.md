# Design: inbound approvals and business-confirmed facts (G-143, G-144)

**Status:** partly decided. Section 2 says which decisions are made and which are open. No code is written.

**Gaps:** G-143 and G-144 in `docs/internal/VERIFICATION-GAPS.md`. **Parent:** G-129 (issue #421).
**Source:** RFC-0026. **Earlier proposals:** PR #517 (G-143), PR #518 (G-144).

---

## 1. Problem

An inbound decision (`POST /v1/inbound/checks`) approves a partner's request when the policy approves it. Two gaps:

- **G-143.** The decision record does not say who approved the request, or when. An auditor cannot tell whether a person approved it.
- **G-144.** The facts a policy relies on may come from the partner's own declaration. A declaration should be able to refuse a request, but never approve one.

## 2. Decisions

| #   | Topic                     | Decision                                                                                                                                                                | Status                                                                  |
| --- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| G1  | Sign the approval fields  | Sign them. An unsigned field can be edited after the fact.                                                                                                              | Recommended. Pending owner confirmation                                 |
| G2  | Record the key ID         | Record it, with the approver ID. Keys are rotated and revoked.                                                                                                          | Recommended. Pending owner confirmation                                 |
| G3  | Single use of an approval | Single use, tied to the approval ID.                                                                                                                                    | Recommended. Already enforced at authorization; timing is open (see O1) |
| F1  | Who registers a source    | Registered through maker-checker, from a key the business controls.                                                                                                     | Recommended. Pending owner confirmation                                 |
| F2  | Source key replacement    | Bounded overlap with an explicit end time. Default 24 hours, cap 7 days.                                                                                                | Recommended. Pending owner confirmation                                 |
| F3  | Read timeout              | Per capability, set at registration. Default 10 seconds. Any failure refuses.                                                                                           | Recommended. Pending owner confirmation                                 |
| F4  | Staleness                 | The source's own timestamp, a maximum age per fact in the policy, and a 30-second clock allowance.                                                                      | Recommended. Pending owner confirmation                                 |
| F5  | Coverage                  | Enforced when a policy is approved, not at request time.                                                                                                                | Recommended. Pending owner confirmation                                 |
| F6  | Re-approval of a source   | **6 months** for a source that can move money or change an external system. **12 months** for a read-only source. Re-approval needs the business and a Parmana checker. | **Decided by the owner.**                                               |

Each "Recommended" item becomes a decision when the owner confirms it.

## 3. Current state, from the code

- **Approval verification.** `ApprovalVerifier` reads the approver from `payload.issuer.approverId` and the issue time
  from `payload.issuedAt`. It checks trust, revocation, signature, expiry, action, resource and value
  (`packages/approval/src/ApprovalVerifier.ts`).
- **Single use already exists.** `ApprovalSignalVerifier` consumes an approval's nonce when a request is authorized,
  and `decide()` runs that authorization (`packages/approval/src/ApprovalSignalVerifier.ts`,
  `packages/runtime/src/RuntimeEngine.ts`). Approvals cannot be reused today.
- **`decide()` returns only `{ approved, reason }`**, so the approver and time are discarded before the inbound check sees
  them.
- **Inbound records** carry `policyName` and `policyVersion`, but no approver, key or time. They have no schema version.
  Their signed bytes are the sorted set of fields present on the record (`canonicalCheckBytes`,
  `packages/api/src/routes/inbound-checks.ts`). Records with no new fields keep their current bytes.
- **Business signal sources** store the endpoint, timeout, public key, key ID, status and revocation
  (`packages/shared/src/domain/`). They have no overlap window and no re-approval date. The maximum fact age lives in the
  policy's `signalSources`.
- **Coverage today.** A capability with no bound policy is refused. A declared fact with no source is not refused yet.

## 4. Design

### 4.1 Approval record (G-143)

When a decision is **approved** and `decide()` reports a verified approval was used, the record gets four fields:

| Field           | From                        |
| --------------- | --------------------------- |
| `approvedBy`    | `payload.issuer.approverId` |
| `approvedKeyId` | `payload.issuer.keyId`      |
| `approvalId`    | `payload.approvalId`        |
| `approvedAt`    | `payload.issuedAt`          |

- The fields are set only on an approved decision that used a verified approval. Otherwise all four are absent.
- The values come from the verified approval, never from the partner's request.
- The fields are part of the signed bytes.
- `decide()` returns the approval it used, as `approval: { approvalId, approverId, keyId, issuedAt }`, and is otherwise unchanged.
- Records without the fields keep their current bytes and still verify. No verifier outside `parmana-core` reads inbound
  records today, so none needs updating before a record is issued.

### 4.2 Business-confirmed facts (G-144)

**Registering a source**

1. A business operator proposes the source: endpoint, public key, the facts it answers, the capability, the timeout, and
   the maximum fact age.
2. The proposal is signed with a key the business controls.
3. A Parmana checker approves it with a step-up signature.
4. The source is active from approval, and must be **re-approved on its schedule** (F6).

**Re-approval schedule (F6, decided)**

- **6 months:** a source that can move money or change an external system.
- **12 months:** a read-only source.
- A source past its date is refused until re-approved. Re-approval needs the business and a Parmana checker.

**Key replacement (F2)**

- A replacement is a new registration with a new key, through the same flow.
- The old key stays valid until an explicit end time, with a default of 24 hours and a cap of 7 days.
- After that time the old key is refused.

**Each fact, each request**

1. Find the source for the fact and capability. None: refuse (`no_source_for_fact`).
2. Ask the source about the exact business object, with the source's timeout.
3. Verify the answer's signature against a currently valid source key.
4. Check the timestamp: refuse if it is older than the fact's maximum age, or more than 30 seconds in the future.
5. If the partner declared a value, compare it with the source's. A mismatch refuses (`declared_fact_mismatch`).
6. Give the policy the source's value, never the partner's.

**Failures refuse.** Each reason is recorded in the signed decision.

| Condition                                             | Reason                   |
| ----------------------------------------------------- | ------------------------ |
| No answer within the timeout                          | `source_timeout`         |
| Signature does not verify                             | `source_unverified`      |
| Key expired, revoked or unknown                       | `source_key_not_valid`   |
| Answer older than the maximum age, or from the future | `source_stale`           |
| Business object not found                             | `source_not_found`       |
| Declared value differs from the source                | `declared_fact_mismatch` |
| No source registered for a declared fact              | `no_source_for_fact`     |

**Coverage at policy approval (F5).** When a policy is proposed, its governance check lists every fact it declares as
sourced, and confirms each has a registered, unexpired source for the capability. A policy with a gap cannot be approved.

## 5. Open decisions

**O1. When an approval is consumed.** Today it is consumed during `decide()`, before the decision is recorded. If recording
fails, the approval is lost. The recommendation is to write the record and consume the approval in **one database
transaction**. If the two stores cannot share a transaction, use a reservation that expires, and make it permanent only
when the record is written. This changes the release path, so it needs the owner's confirmation.

**O2. Clock allowance.** 30 seconds, as proposed in F4. Confirm.

**O3. Several approvals on one decision.** Out of scope for now. Each approval used would need its own four fields. Confirm.

## 6. Compatibility

- Existing records keep their bytes and keep verifying. They gain no approval fields.
- Inbound checks that approve on declared facts alone will be refused for any fact without a source, after this change. List
  the affected capabilities before enabling it.
- If an external consumer of inbound records is added later, it must read the new fields. G-121 does not apply: G-121
  concerns Execution Trust Records, which is a different record format.

## 7. Security

- A partner cannot cause an approval by declaring a fact. Only a verified source answer can approve.
- A compromised source can answer only for its own facts and capability, and only until its key is revoked. Revocation
  takes effect when the change is approved.
- A replayed approval is refused, because it has already been consumed.
- A replayed source answer is refused by its timestamp and maximum age.
- Keys never appear in requests or records. Records carry only public identifiers and signatures.

## 8. Tests required before merge

1. An approved decision that used a verified approval records all four fields, and the signature covers them.
2. An approved decision with no approval records none of them.
3. A refused decision with a failed approval records none of them.
4. A second use of an approval is refused with `approval_already_used`.
5. A declared fact with no source refuses (`no_source_for_fact` or `source_timeout`).
6. An answer signed by an unknown key refuses (`source_unverified`).
7. An answer older than the maximum age refuses (`source_stale`), and one from the future beyond the allowance refuses.
8. A timeout refuses (`source_timeout`).
9. A declared value that differs from the source refuses (`declared_fact_mismatch`).
10. During the overlap window both keys verify. After the end time the old key refuses.
11. A money-moving source past 6 months refuses. A read-only source past 12 months refuses. Both pass before their date.
12. A policy declaring a sourced fact with no source cannot be approved.

## 9. Before code

1. Confirm the recommended items in section 2 and O1 to O3, or change them.
2. Record the answers here.
3. Then build, in this order: G-143 (fields, signing, `decide()` change), then G-144 (registration, per-fact checks,
   coverage at approval), then the tests in section 8.
4. Update CLAIMS, VERIFICATION-GAPS and the public inbound page in the same change. Add an external consumer of inbound records only if an owner decision requires one.

## 10. Done when

All tests in section 8 pass, every open item in sections 2 and 5 is decided, at least one capability runs end to end
with a registered, signed business source, and the claims and gap records are updated.
