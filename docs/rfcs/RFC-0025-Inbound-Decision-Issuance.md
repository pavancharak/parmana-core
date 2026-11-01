# RFC-0025 — Inbound decision issuance: Parmana issues the decision before an inbound refund

Status: Draft (scoping; no implementation started)

Created: 2026-11-02

Target Version: unset

Depends on: RFC-0024 (design decisions), gap G-129.

---

# Summary

For the inbound refund pilot, the decision that authorizes a refund is currently signed by the
pilot's own test tool, not by Parmana. This RFC proposes that Parmana issues the decision: the
pilot asks Parmana to approve a refund request, and Parmana returns a signed decision. Only
Parmana's signature is then trusted by the business system.

# Problem

If the pilot signs its own decisions, a refund authorized by the pilot is indistinguishable
from one Parmana approved. That defeats the point of the check. It also leaves nothing in
Parmana's record for an outcome endpoint to match, so outcome reporting cannot be verified.

# Proposal

**Endpoint:** `POST /v1/inbound/decisions`, caller-authenticated (existing caller API keys).

**Request:** `{ partnerId, orderId, paymentId, amountInr, audience }`.

**Parmana checks, in order:**

1. The caller is the registered caller for `partnerId` (the caller key maps to the partner).
2. `partnerId` has an active policy grant (per-partner limits, RFC-0023 phase 3 concept).
3. `amountInr` is within the partner's limit. If above it, the decision is `rejected` with reason
   `approval_required`.
4. `paymentId` and `amountInr` are recorded on the decision. They are part of what is signed.

**Response:** a decision `{ decisionId, outcome, reason?, partnerId, paymentId, limitInr,
expiresAt, audience, signature }`, signed with Parmana's key. Expiry is short (10 minutes).

**Record:** every decision issued, approved or rejected, is written to Parmana's record store
(append-only), so the outcome endpoint can later match against it.

# Out of scope for this RFC

- The outcome endpoint (follows once decisions exist).
- Per-partner keys beyond the existing caller keys (open question below).
- Any change to the business system's verification (it already verifies Parmana's signature).

# Decisions (approved 2026-11-02)

1. One caller key per partner, so the key proves the partner.
2. An approval-required rejection also notifies the approver through the existing notifier.
3. Parmana's existing Ed25519 signing key signs inbound decisions.
4. Decisions are stored through the existing repository layer, with a migration applied before deploy.

# Open questions (resolved above)

1. **Partner-to-caller mapping.** Does each partner get its own caller key, or do partners share
   one with `partnerId` in the request? Recommend one caller key per partner, so the caller key
   itself proves the partner.
2. **Approval over the limit.** Is a rejected decision with reason `approval_required` enough, or
   should Parmana also notify the approver through the existing `approval.needed` path (G-65)?
   Recommend yes, using the existing notifier.
3. **Signing key.** Parmana's existing Ed25519 signing key, or a separate key for inbound
   decisions? Recommend the existing key, so one verification key covers everything.
4. **Storage.** The decision record needs a table. Recommend the existing repository layer,
   with a migration applied before deploy.

# Acceptance

- A rejected request, an approved request within the limit, and an approval-required request
  each produce a signed decision with the expected outcome.
- The signature verifies with Parmana's public key, and the pilot's gate accepts it unchanged.
- A decision with no matching caller, or a partner without a grant, is refused with 403.
- Each issued decision appears in the record store.
