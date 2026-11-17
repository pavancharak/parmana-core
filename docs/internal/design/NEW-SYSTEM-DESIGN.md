# New system design: trusted and untrusted signals, from requirements

Status: design, derived from requirements only. It does not depend on the existing repository, its policies, or its adapters. Decisions marked "owner" were stated by the owner. Others are recommendations for finalisation.

## 1. Requirements

R1. Any business system can supply facts a decision depends on.
R2. A fact can justify an approval only if it is signed by a registered source, or is a verified human approval.
R3. Anything not verified (caller values, AI output, unsigned answers) can refuse or route a request. It never approves one. (owner)
R4. Every decision can be reproduced later from what was stored.
R5. Human involvement is proportionate to risk. Each action's owner sets its limits. (owner)
R6. When a required fact cannot be verified, the request is refused, not approved. (fail closed)

## 2. Parties

| Party        | Role                                                                                  | Trust                                                      |
| ------------ | ------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Source       | A business system that establishes facts, such as an order system or a ledger.        | Trusted if it signs its answers under a registered key.    |
| Approver     | A named person who signs an approval for one exact action.                            | Trusted if the approval verifies against a registered key. |
| Caller       | Any party that submits a request: an agent, an integration, a person, or an AI model. | Untrusted. All values it sends are untrusted.              |
| Action owner | The person accountable for an action's policy and limits.                             | Sets limits; a second person approves them.                |
| Source owner | The person accountable for a source's answers and its key.                            | Chooses how the source signs.                              |
| Reviewer     | A registered approver with a grant for the action, who is not the requester.          | Decides review items within their grant.                   |

Parties are the same in every domain. Nothing here is specific to payments.

## 3. Signing: one contract for every source

- Every source signs every answer it gives. There is no unsigned path.
- A source registers a key. Its answers are verified against that key, and the signature covers the value, the subject, the claim, the observation time, the expiry, the nonce and the transaction ID.
- A source that cannot sign natively can use an intermediary that signs on its behalf. The register records the signer as the intermediary, so the trust chain is visible. This is one contract, not a special case.
- Keys are registered, rotated and revoked through maker-checker. A revoked key makes every answer it signed unusable for new decisions.
- Until a source has a registered key and a verified answer, it is untrusted. Its values can refuse or route, not approve.

## 4. The register

Every source and every action is listed in a register, which is the only place that defines which source and claim a policy may use.

| Entry     | Fields                                                                                                                                                      |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source    | name, owner, signer (the system itself or a named intermediary), key identifier, status (trusted or untrusted), the claims it provides, units of each claim |
| Action    | capability name (`<system>:<action>`), owner, the tiers and thresholds in force                                                                             |
| Threshold | name, value, unit, owner, approver, reason, next review date                                                                                                |

A policy can name only registered sources, claims and capabilities. The validator checks this at load time (D19).

## 5. Policy format

The format is the version 2 specification (`POLICY-V2-SPEC.md` in this folder), built from first principles:

- Every value is declared with a provenance: sourced, approved, AI, or untrusted.
- Rules are in fixed tier order: refuse, review, tier 1, tier 2, reject.
- Rules compare a value only with a constant or a named threshold (D16, D18).
- Every number has a unit, and comparisons need matching units (D17).
- Approvals are exact: they name the value the approver saw (D12).
- AI values come from a closed set and can only refuse or route.

The validator enforces these rules when a policy is loaded and when it is proposed. A policy that breaks any of them is refused.

## 6. Decision flow

For a request to act on a target:

1. **Identify the policy.** Look up the capability in the register and load its approved policy version. If none is approved, refuse.
2. **Fetch sourced values.** For each sourced value, ask the registered source using the target and declared parameters. Verify the signature and freshness. If a source cannot answer, refuse as SOURCE_UNAVAILABLE.
3. **Check agreement.** If the caller proposed a value that a source also establishes, and they differ, refuse as INVALID. This is the only place where a caller value is compared with a sourced value (D16).
4. **Check approvals.** Verify any approval the policy requires, for the exact value, unused, unexpired, and from a currently registered approver.
5. **Evaluate tiers in order.** The first matching rule decides. Its tier and rule id are recorded.
6. **Record the decision.** Store the request, the values, the policy version and hash, the matched rule, the tier, and the outcome.

Possible outcomes: APPROVE, REJECT, REVIEW, and refusals for source unavailable, invalid agreement, or missing approval. Each has a reason.

## 7. Tiers, in practice

| Tier   | Applies when                                                                          | Outcome                |
| ------ | ------------------------------------------------------------------------------------- | ---------------------- |
| Refuse | A verified value says no, or a required verified value is missing.                    | Reject.                |
| Review | An untrusted or AI value would change the outcome.                                    | Review item.           |
| Tier 1 | Every value the rule reads is sourced and verified, and each is within its threshold. | Approve automatically. |
| Tier 2 | Everything in tier 1, plus a verified approval for the exact value.                   | Approve.               |
| Reject | Nothing else matched.                                                                 | Reject.                |

Thresholds decide where tier 1 ends. The owner sets them. Until a threshold has an approved value, the action cannot reach tier 1, and everything goes to tier 2 or review.

## 8. Review

- **Items** are stored durably and are append-only. Each holds the request, the matched rule, the reason, the values with their provenance, and the missing verified values.
- **Visibility.** Reviewers and operators see the full item. The caller sees only its status and a reason code.
- **Reviewers** hold a registered approver key with a grant for the action and an amount limit that covers the request. A reviewer may not be the requester. High-value items need two reviewers.
- **Decision.** A reviewer approves or rejects the exact value the source established. A reviewer cannot change a value. (owner)
- **Time.** Review window, escalation and expiry are set per action class within platform caps: at most three business days for a review window, and at most 60 minutes for an approval's validity. An undecided review expires as REVIEW_EXPIRED and is never approved by default.

## 9. Informed approval

- The approval tool shows the full request before signing: action, target, sourced values with their provenance, and the caller's reason.
- The approver confirms after reading. The tool records the confirmation and the approver's identity.
- The signature covers a digest of the displayed content. A change after display invalidates the approval.
- The approval is exact, single-use and short-lived.
- The review record keeps the digest, the confirmation time and the approver's identity.

Limit: the system proves what was shown and signed, not that it was understood.

## 10. Thresholds and their owners

- The action owner proposes each threshold with a reason.
- A second person, not the proposer, approves it through maker-checker.
- The risk function approves high-value thresholds.
- Each threshold has a next review date, and an earlier review after any incident involving a request near it.
- A change is a new policy version.

## 11. Evidence

- Each decision record stores the policy hash and the matched rule id. The tier is read from the policy version named by the hash.
- Provenance is derived from the policy and the request. It is not stored separately.
- Records are append-only. A record can be verified later without the original source being available, because the signatures on each sourced value are stored with the decision.

## 12. Parts that are not design

These are operational decisions, not part of the design. They are listed so they are not confused with it:

- Who owns each source and action (named in the register).
- Which threshold values are chosen (set by owners).
- How the system is deployed and when it goes live.
- When the first action goes live.

## 13. Build order

Order follows the design's dependencies, not any existing code:

1. Register: sources, keys, actions, thresholds, with their owners and approvers.
2. Source signing: the contract in section 3, with tests for unsigned, wrong key, replayed, expired and revoked answers.
3. Policy format and validator: section 5, with the checks in the spec.
4. Decision flow: section 6, with tests for each outcome.
5. Approvals: exact, informed, single-use (section 9).
6. Review: items, reviewers, windows and decisions (section 8).
7. Evidence and replay (section 11).

Each step is complete when its tests pass.

## 14. Decisions still to finalise

| ID  | Decision                                             | Recommendation                                            |
| --- | ---------------------------------------------------- | --------------------------------------------------------- |
| A   | Signer for sources that cannot sign natively         | Intermediary, recorded in the register. No special route. |
| B   | Review and approval windows                          | Per action class, within the caps in section 8.           |
| C   | Whether the REVIEW outcome is a separate record type | Yes.                                                      |
| D   | Whether provenance is stored or derived              | Derived.                                                  |
| E   | Owners of each source and action                     | Named by the business (section 12).                       |
| F   | Threshold values                                     | Set by owners (section 10).                               |
