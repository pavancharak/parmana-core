# Design: inbound approvals and business-confirmed facts (G-143, G-144)

Status: **proposed, for decision.** No code is written. This document records the recommended decisions, the
design that follows from them, the failure cases, and the tests required before any code is merged.

Gaps: `docs/internal/VERIFICATION-GAPS.md` G-143 and G-144. Parent gap: G-129 (issue #421). Source questions:
`docs/internal/rfcs/RFC-0026-Inbound-Facts-From-Business-Sources.md`. Earlier proposals: PR #517 (G-143 design),
PR #518 (G-144 answers).

---

## 1. Summary

An inbound decision (`POST /v1/inbound/checks`) approves a partner's request only when the policy approves it. Two
gaps remain:

- **G-143.** The decision record does not say who approved the request or when, so an auditor cannot tell whether a
  person approved it.
- **G-144.** The facts a policy relies on may come from the partner's own declaration. A declaration should be able to
  refuse a request but never to approve one.

This document recommends how both are closed in the long term, and what must be true before code is written.

## 2. Decisions

### G-143: approval record

| #   | Decision                                        | Recommendation                                                                                            |
| --- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Sign the approval fields, or only store them    | **Sign them.** A stored, unsigned field can be edited after the fact and proves nothing.                  |
| 2   | Record the approver ID only, or also the key ID | **Record both.** Keys are rotated and revoked; a record must show which key signed.                       |
| 3   | Allow an approval to be reused                  | **No. Single-use, tied to the approval ID.** A reusable approval is a standing permission nobody reviews. |

### G-144: facts from the business

| #   | Decision                                           | Recommendation                                                                                                                                                                                         |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Who registers a source, and how is ownership shown | Registered through maker-checker, **and** the registration is signed with a key the business controls. A Parmana checker does not decide ownership alone. Sources are re-approved on a fixed schedule. |
| 2   | Source trust and replacement                       | Each source has a registered public key, and every answer is signed and verified. Replacement uses a **bounded overlap**: the old key is accepted until an explicit end time, then refused.            |
| 3   | Read timeout                                       | **Per capability, set in the source registration.** Default 10 seconds, the same as the existing Razorpay read. Any failure, timeout or unverified answer **refuses**.                                 |
| 4   | Staleness                                          | Use the **source's own timestamp**, with a **maximum age per fact** in the policy. Reject timestamps more than a small clock allowance in the future.                                                  |
| 5   | A capability with no source for a declared fact    | **Enforced when the policy is approved, not at request time.** A policy that declares a sourced fact with no registered source cannot be approved.                                                     |

## 3. Background: what exists today

Facts established by reading the code on `main`:

- **Approval verification.** `ApprovalVerifier` reads the approver from `artifact.payload.issuer.approverId` and the
  issue time from `payload.issuedAt`. It checks the approver is trusted and not revoked, the signature, the expiry, the
  action, the resource and the value. A nonce is consumed when the approval is used (the approval is single-use within
  the same nonce store). Source: `packages/approval/src/ApprovalVerifier.ts`.
- **Decision step.** `decide()` returns `{ approved, reason }` only. The approver and issue time are not returned to the
  inbound check, so they are discarded. Source: `packages/api/src/routes/inbound-checks.ts`.
- **Inbound record.** `InboundCheckRecord` carries `policyName` and `policyVersion`, but no approver or approval time.
  The check signs the canonical bytes of the record (`canonicalCheckBytes`). Source:
  `packages/shared/src/repositories/inbound-decision-repository.ts`, `packages/api/src/routes/inbound-checks.ts`.
- **Business signal sources.** Registered through maker-checker at `/business-signal-sources/changes`, with a registered
  Ed25519 key. Answers are verified against that key (claim 2.54). Source:
  `packages/api/src/routes/business-signal-sources.ts`, `packages/runtime/src/business-validation/`.
- **Freshness.** The Razorpay source uses `validUntil` and a policy `maxAgeSeconds` (60 seconds), and a 10-second read
  timeout (`READ_TIMEOUT_MS`). Source: `packages/runtime/src/business-validation/razorpay-payment-source.ts` (on branch
  `feat/razorpay-payment-signal`; not on `main`).
- **Coverage today.** A capability with no bound policy is refused (`no_policy_bound`). The check does not yet refuse a
  capability for a declared fact with no source; that is G-144's gap.

## 4. Design

### 4.1 Approval record (G-143)

**Fields added to every inbound decision that approved on a human approval:**

| Field           | Value                            | Source                               |
| --------------- | -------------------------------- | ------------------------------------ |
| `approvedBy`    | The approver's ID                | `approval.payload.issuer.approverId` |
| `approvedKeyId` | The key that signed the approval | `approval.payload.issuer.keyId`      |
| `approvalId`    | The approval's ID                | `approval.payload.approvalId`        |
| `approvedAt`    | When the approval was issued     | `approval.payload.issuedAt`          |

**Rules.**

- The fields are set **only** when the decision is `approved` **and** the decision step reports it used a verified
  approval. Otherwise all four are absent.
- The values come from the verified approval object, never from the partner's request.
- All four fields are included in the canonical bytes that Parmana signs.
- A decision is `approved` on a single approval. If a policy needs several approvals, every one used is recorded; that
  case is not required now and is listed under open items.

**Decision step change.** `decide()` returns the approval it used, when it used one:

```
{ approved, reason, approval?: { approvalId, approverId, keyId, issuedAt } }
```

Its approval-free behaviour is unchanged.

**Single use (G-143 decision 3).** An approval is consumed by its `approvalId` in the approval nonce store, and a second
use is refused with a reason such as `approval_already_used`. The check must consume the approval **only** after the
decision is approved and recorded, so that a refused request does not burn an approval the business still needs.

**Schema version.** The new fields change the canonical bytes. Records written after the change carry a schema version
that says so. Records written before keep their existing canonical form, and keep verifying. _To confirm in the code:_
whether inbound records carry a schema version today (see section 8).

### 4.2 Business-confirmed facts (G-144)

**Source registration.**

1. A business operator proposes a source (maker). The proposal includes the source's endpoint, its public key, the facts
   it answers for, the capability it serves, its read timeout, and its maximum fact age.
2. The proposal is **signed with a key the business controls**. The signature shows the proposal came from the business,
   not from someone who only has Parmana access.
3. A Parmana checker reviews it and approves it with a step-up signature (existing maker-checker flow).
4. The source is active from approval. It is **re-approved every 12 months**; a source past its re-approval date is
   refused until re-approved. _The 12-month period is a proposal; the owner should confirm it._

**Source trust and replacement.**

- Every answer from a source is signed with the source's key, and Parmana verifies the signature before use.
- Replacement is a new registration with a new key, through the same flow.
- The old key remains valid for an **overlap window** that ends at an explicit timestamp, set at replacement time. After
  that timestamp the old key is refused. The window is capped (proposed: 7 days) so two keys cannot stay valid
  indefinitely.

**The check's use of a source (per fact, per request).**

1. Look up the fact's source for the capability. No source → refuse (see 4.2, coverage).
2. Ask the source about the exact business object in the request, with the source's timeout.
3. Verify the answer's signature against a currently valid source key.
4. Check the answer's timestamp: reject if it is more than the clock allowance in the future, or older than the fact's
   maximum age. Proposed clock allowance: 30 seconds.
5. Compare the source's value with the partner's declared value, if the partner declared one. A mismatch refuses, with
   reason `declared_fact_mismatch`.
6. Pass the source's value, not the partner's, to the policy.

**Failure behaviour (fail closed).** Every row below refuses the request.

| Condition                                                     | Reason recorded          |
| ------------------------------------------------------------- | ------------------------ |
| Source does not answer within the timeout                     | `source_timeout`         |
| Source answer fails signature check                           | `source_unverified`      |
| Source key expired or unknown                                 | `source_key_not_valid`   |
| Answer older than the maximum age, or timestamp in the future | `source_stale`           |
| Source reports the business object does not exist             | `source_not_found`       |
| Declared value differs from source value                      | `declared_fact_mismatch` |
| No source registered for a declared fact                      | `no_source_for_fact`     |

Each refusal is recorded in the signed decision record. No request is retried in a way that could approve a stale answer.

**Coverage at policy approval (G-144 decision 5).** When a policy version is proposed, the governance check lists every
fact the policy declares as sourced. For each, it confirms a registered, unexpired source exists for the capability.
If any does not, the policy **cannot be approved**. The check runs at approval, so the list of uncovered capabilities
is visible to the checker before the policy is live.

## 5. Compatibility

- **Existing records** keep their canonical form. They still verify. They do not gain the approval fields.
- **Existing inbound checks** that approve on declared facts only will, after this change, be refused for any fact that
  has no source. This is intended, and it must be a planned change: list the affected capabilities before enabling.
- **External verifiers** must be updated to read the new schema version before any new record is issued. This is a
  release dependency, the same kind as the existing G-121 gap.

## 6. Security considerations

- **A partner cannot cause approval** by declaring a fact. The source's signed answer is the only input that can approve.
- **A compromised source** can approve only the facts it answers for, only within its registered capability, and only
  until its key is revoked. Revocation is a maker-checker change, effective at approval.
- **A replayed approval** is refused by its `approvalId` consumption.
- **A replayed source answer** is refused by its timestamp and maximum fact age.
- **Keys are never sent in requests.** Only signatures and public-key identifiers appear in records.

## 7. Tests required before merge

1. Approval record: an approved decision that used a verified approval records all four fields; the signature covers
   them (changing any field breaks verification).
2. Approval record: an approved decision that used no approval records none of the four fields.
3. Approval record: a refused decision with an attached approval that fails verification records none of them.
4. Single use: a second request presenting the same approval is refused with `approval_already_used`, and the first
   approval is consumed only after it is recorded.
5. Partner declaration alone cannot approve: a fact declared true, with no source answer, refuses (`no_source_for_fact`
   or `source_timeout`).
6. Source answer signed by an unknown key refuses (`source_unverified`).
7. Source answer older than the maximum age refuses (`source_stale`); a timestamp beyond the clock allowance refuses.
8. Source timeout refuses (`source_timeout`) and records the reason.
9. Mismatch between declared and source value refuses (`declared_fact_mismatch`).
10. Replacement: during the overlap window both keys verify; after the end time the old key refuses.
11. Source past its 12-month re-approval date refuses.
12. Policy approval: a policy declaring a sourced fact with no registered source cannot be approved.

## 8. Open items to confirm in the code before building

These are facts this design relies on that were not verified while writing it:

- Whether inbound decision records carry a schema version, and how verifiers select a canonical form.
- Whether the approval nonce store is shared by the check and by `/execute`, and whether consuming an approval in the check
  would affect a later use in another path.
- Whether the business-signal-source registration flow can carry the fields listed in 4.2 (maximum fact age, per-fact
  mapping, timeout), or whether it needs extending.
- The exact per-capability fact list, which decides how many capabilities the coverage rule refuses on day one.

## 9. Owner decisions still needed

- Confirm or change the 12-month re-approval period (4.2).
- Confirm or change the 7-day overlap cap (4.2) and the 30-second clock allowance (4.2).
- Confirm the rule that an approval is consumed only after the decision is recorded (4.1).
- Confirm that a policy requiring several approvals is out of scope for this change (4.1).

## 10. Order of work, once decided

1. Decide section 9. Answer the open items in section 8 by reading the code, and record the answers in this document.
2. Extend `decide()` to return the approval used; add the four fields to the record and the canonical bytes; add the
   schema version (G-143).
3. Add single-use consumption of approvals in the check (G-143).
4. Extend the source registration fields and the signed registration (G-144).
5. Implement the per-fact checks and failure reasons (G-144).
6. Add the coverage check to policy approval (G-144).
7. Run the tests in section 7. Update external verifiers (release dependency).
8. Update CLAIMS, VERIFICATION-GAPS and the public inbound page in the same change.

## 11. Acceptance

G-143 and G-144 close when: every test in section 7 passes, the owner decisions in section 9 are recorded, the answers to
section 8 are recorded, the claims and gap records are updated, and at least one capability runs end to end with a
registered, signed business source.
