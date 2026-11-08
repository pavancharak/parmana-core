# G-143: record who approved an inbound decision, and when

Status: design, for review. No code changes yet.
Gap: `docs/internal/VERIFICATION-GAPS.md`, G-143. Parent: G-129, issue #421.

## Problem

An inbound decision record (`InboundCheckRecord`, `packages/shared/src/repositories/inbound-decision-repository.ts`) carries `policyName` and `policyVersion`, but not who approved the request or when. The columns exist (claim 3.31), and nothing writes `approved_by` or `approved_at`. The check has no approval step of its own.

## Where approval already happens

A policy can require a signed human approval in `approvalSignals`. `ApprovalSignalVerifier` checks that approval: the approver is trusted and not revoked, the signature is valid, the approval has not expired, and it covers this action, resource and value. Its result already contains the approver id (`artifact.payload.issuer.approverId`, `ApprovalVerifier.ts` line 129) and the approval's issue time (`payload.issuedAt`). The inbound check runs the same policy through `decide()`, so the approval is verified on that path too.

What is missing is that `decide()` returns only `{ approved, reason }`, so the approver and issue time are discarded before the check sees them.

## Proposal

1. `decide()` returns the approval it used, when it used one: `{ approved, reason, approval?: { approverId, issuedAt } }`. It returns nothing extra when no approval was used. Its behaviour is otherwise unchanged.
2. The inbound check writes two fields on a decision only when all of these hold:
   - the outcome is `approved`, and
   - `decide()` returned an approval.
     Then `approvedBy = approverId` and `approvedAt = issuedAt`. In every other case both fields are absent. They are never filled in from the partner's declared values.
3. Both fields are included in the canonical bytes that are signed, so a record cannot be changed afterwards without breaking its signature.
4. Storage: the `approved_by` and `approved_at` columns already exist. The repositories gain the two fields, with a migration only if the columns are missing (to be confirmed in the migration files).

## What this does not do

- It does not add an approval step for inbound requests. A request that needs a human still gets a refusal (`policy_rejected`) when no approval is attached. A human-in-the-loop flow (a request that waits for approval) is a separate design, and is not needed to close G-143.
- It does not change how approval is verified. It only keeps a result that is already produced.

## Compatibility

- Existing records have no `approvedBy` or `approvedAt`. They still verify, because the new fields are only signed on new records.
- The signed canonical form changes for new records. Any verifier that rebuilds the canonical bytes must know the two new fields. Verifiers outside this repository are not updated by this change. This needs a decision (see open questions).

## Tests to add

- An approved inbound decision whose policy used a verified approval records that approver and time, and the signature covers them. A change to either breaks verification.
- An approved decision that used no approval records neither field.
- A rejected decision records neither field, even when an approval was attached but failed verification.
- A partner-declared value cannot set `approvedBy`.

## Open questions for you

1. Should the two fields be signed (as proposed), or only stored? Signed means an external verifier must be updated before it can check new records. Stored only means the record cannot prove who approved.
2. Is the approver id enough, or should the record also name the approval's key id?
3. Should an approval used on an earlier request be refused on a later one? (The approval is single-use in `ApprovalSignalVerifier`; this design relies on that.)
