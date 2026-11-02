# RFC-0025 — Inbound decision issuance: Parmana issues the decision before an inbound refund

Status: Accepted for the test service. Implemented in steps 1 to 3 and the outcome endpoint; deployed to a test service. Not yet approved for production.

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

# Implementation status (2026-11-02)

| Part                                        | Where                                                                     | State                                                                                             |
| ------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Decision route `POST /v1/inbound/decisions` | `packages/api/src/routes/inbound-decisions.ts`, mounted in `app.ts`       | Built, 8 unit tests. Mounted only when `INBOUND_AUDIENCE` is set.                                 |
| Limit from the grant                        | Authority grant `inbound:refund`, `parameters.amountInr.max`              | Built. Current, not revoked, within validity.                                                     |
| Signing                                     | Gateway key from `PARMANA_KEY_MATERIAL_JSON`, id `PARMANA_GATEWAY_KEY_ID` | Built. Server refuses to start if the key is missing.                                             |
| Decision table                              | `inbound_decisions` (migration `20261102120000`)                          | Applied to the sandbox database. Postgres tests pass there.                                       |
| Outcome route `POST /v1/inbound/outcomes`   | `packages/api/src/routes/inbound-outcomes.ts`                             | Built, 9 unit tests. Stores through `inbound_outcomes` (migration `20261102130000`).              |
| Outcome table                               | `inbound_outcomes`, one outcome per decision                              | Applied to the sandbox database. Postgres tests pass there.                                       |
| Pilot                                       | `pavancharak/for-pilots`                                                  | Requests decisions and reports outcomes when `PARMANA_BASE_URL` and `PARMANA_CALLER_KEY` are set. |
| Test service                                | Render, `https://parmana-core.onrender.com`                               | Live. Uses `PARMANA_STORAGE=supabase` and the sandbox database.                                   |
| End-to-end                                  | Pilot to Parmana to Razorpay Test Mode                                    | Run once: decision `dec-59d145ea-6f7e-4dba-89d5-42b9e5755823`, refund `rfnd_TvAk5OOPhADmIh`.      |

## Known gaps and limits

1. **The decision does not sign the amount.** The gate checks the amount against the limit only.
   Adding `amountInr` to the signed fields would bind the decision to one amount. Open.
2. **Outcomes are not signed by Parmana.** They are stored, and the pilot's local log is
   tamper-evident, but Parmana does not sign an outcome record. Open.
3. **Grant changes lose their state if the store is in memory.** A redeploy cleared a pending
   change. Set `PARMANA_STORAGE=supabase` on every hosted service. Mitigated by configuration; no
   code change.
4. **Step-up signatures expire after 120 seconds.** Sign and submit in one step.
5. **Raw caller keys were pasted into a chat during setup.** Rotate them. Open.
6. **Production is not approved.** The test service uses the sandbox database, which is labelled
   production, and test keys. Live use needs its own decision, a separate database, and key
   ceremony under `docs/runbooks/CREDENTIAL-CEREMONY.md`.

## Production status (2026-11-02)

| Item                                                              | State                                                                                                          |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Production API `parmana-api-real` (Vercel)                        | Live. Health `UP` after redeploy.                                                                              |
| `INBOUND_AUDIENCE` on production                                  | Set to `refunds.parmanasystems.com`, Config type.                                                              |
| Production database `parmana-production-db`                       | `inbound_decisions` and `inbound_outcomes` applied and checked with `to_regclass`.                             |
| Production keys (`PARMANA_KEY_MATERIAL_JSON`, `PARMANA_API_KEYS`) | Set earlier. Contents not re-verified in this record. The key ceremony runbook (PR #281) governs any new keys. |
| Inbound route answering an authenticated request on production    | Not yet verified. Checked when the first production grant exists.                                              |
| Production partner grants                                         | None. No inbound decision can be issued on production yet.                                                     |
| Partner onboarding                                                | Documented in `for-pilots/docs/PARTNER-ONBOARDING.md`.                                                         |

Open: live Razorpay keys for the pilot; a persistent store for pilot records; the production order
feed; and the ceremony PR #281 review.
