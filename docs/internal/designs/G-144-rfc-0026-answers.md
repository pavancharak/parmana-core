# G-144: proposed answers to RFC-0026's open questions

Status: proposal, for review. Not decided. Each answer names the mechanism it relies on, so a reviewer can
check it against the code rather than against this text.

Gap: `docs/internal/VERIFICATION-GAPS.md`, G-144. RFC: `docs/internal/rfcs/RFC-0026-Inbound-Facts-From-Business-Sources.md`.

## 1. Which source for each capability, and who checks it belongs to the business

**Proposal.** A source is registered through maker-checker, as RFC-0023 already requires for business signal
sources (`/business-signal-sources/changes`, approved by a checker in scope). Only a source approved this way can
answer for a policy. Changing a source is another change through the same flow, so there is no silent replacement.

**Mechanism.** `packages/api/src/routes/business-signal-sources.ts` and `packages/runtime/src/business-validation/`.

**Open point.** The check that a source really belongs to the business is a human check made during approval. The
claim should say so, rather than imply an automated check.

## 2. Source trust: authentication, and replacement

**Proposal.** Each source has an Ed25519 public key, registered with it. Every answer is signed, and the answer is
verified against that key before it is used (RFC-0023, claim 2.54). A replacement is a new registration with a new
key, approved through maker-checker. An answer signed with the old key after the replacement is refused.

**Mechanism.** The registered key and the answer check in the business validation code. Claim 2.54 states this.

## 3. Latency: timeout and refusal

**Proposal.** The source read has a fixed timeout, and an expired read is a refusal (fail closed, as in RFC-0026
point 4). The proposed value is 10 seconds, the same as the Razorpay read, unless the business says otherwise. The
check's own time limit (10 minutes, `CHECK_TTL_MS` in the inbound route) is separate and unchanged.

**Mechanism.** `READ_TIMEOUT_MS` in the Razorpay payment source is the model. Each new source sets its own timeout.

## 4. Staleness: how old a fact may be

**Proposal.** Use the source's own timestamp, not the time Parmana received the answer, and keep a maximum age per
fact in the policy, as `maxAgeSeconds` already does for the Razorpay source (60 seconds). A fact older than its
maximum age is refused.

**Mechanism.** `maxAgeSeconds` in the policy's `signalSources`, and the answer's `validUntil`.

## 5. Coverage: which capabilities need a source before approval

**Proposal.** A capability whose policy declares a fact with no registered source is refused, not approved on the
declared value. This is the design in RFC-0026, point 5, and it matches the existing rule that a capability with no
bound policy is refused (`no_policy_bound`). Before deciding, list the capabilities whose policies declare a
sourced fact and check each one has a registered source. That list has not been checked yet.

## What is still needed before G-144 can close

- A decision on each of the five proposals above (approval, not a rewrite).
- The refusal reason `declared_fact_mismatch` added to the decision record format (RFC-0026 acceptance).
- A test showing an approval on a declared fact alone is refused.
- At least one capability with a registered source end to end, which needs a business to register it.
