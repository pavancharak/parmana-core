# Plan: trusted and untrusted signals for a new policy system

Status: plan, not started. No code has been written. Derived from requirements alone. The design it implements is in `NEW-SYSTEM-DESIGN.md` and the policy format in `POLICY-V2-SPEC.md`, both in this folder.

## 1. Requirements

R1. Any business system can supply facts a decision depends on.
R2. A fact can justify an approval only if it is signed by a registered source, or is a verified human approval.
R3. Anything not verified (caller values, AI output, unsigned answers) can refuse or route a request. It never approves one.
R4. Every decision can be reproduced later from what was stored.
R5. Human involvement is proportionate to risk. Each action's owner sets its limits, and a second person approves them.
R6. When a required fact cannot be verified, the request is refused, not approved.

## 2. Definitions

- **Trusted value**: a value from a registered source that signed it under a registered key, verified at use, or a human approval that verifies.
- **Untrusted value**: any other value. This includes every caller value, every Intent value, every AI output, and every unsigned or wrongly signed answer.
- **Caller**: any party that submits a request. Agents, integrations, people entering data, and AI models are all callers.
- **Trust comes from the signature, not the sender.** A value's trust is decided by whether it verifies, never by who supplied it.
- **Manager or approver approval**: the caller carries the approval, but its trust comes from the signature. A verified approval is trusted. The caller's flag that an approval is attached is untrusted, and only asks Parmana to check it.
- **What trust in an approval does not prove**: that the approver read the request. Section 4.7 addresses this with informed approval.

## 3. Parties

| Party        | Role                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------- |
| Source       | A business system that establishes facts. Trusted if it signs its answers under a registered key. |
| Approver     | A named person who signs an approval for one exact action.                                        |
| Caller       | Any party that submits a request. Untrusted.                                                      |
| Action owner | Accountable for an action's policy and limits. Sets them, with a second approver.                 |
| Source owner | Accountable for a source's answers and key. Chooses how the source signs.                         |
| Reviewer     | A registered approver with a grant for the action, who is not the requester.                      |

## 4. Design

### 4.1 Signing: one contract for every source

- Every source signs every answer. There is no unsigned path.
- A source registers a key. Each answer is signed over the value, subject, claim, observation time, expiry, nonce and transaction ID.
- A source that cannot sign natively may use an intermediary that signs on its behalf. This is the same contract, with two named parties. The register and every decision record name the **data owner** (the system whose data it is) and the **signer** (the intermediary). The data owner stays accountable for accuracy. The signer proves only that the data arrived from the source and was passed on unchanged.
- Native signing is the goal. Each intermediary is reviewed yearly, and retired when its source can sign natively.
- Keys are registered, rotated and revoked through maker-checker. A revoked key makes its answers unusable for new decisions.
- A source without a registered key and a verified answer is untrusted. Its values can refuse or route, never approve.

### 4.2 The register

The register is the only place that defines which sources, claims and capabilities exist.

- **Source**: name, data owner, signer (the system itself, or a named intermediary and its operator), key identifier, route (native or intermediary), status, claims provided, and the unit of each claim.
- **Action**: capability (`<system>:<action>`), owner, tiers and thresholds in force.
- **Threshold**: name, value, unit, owner, approver, reason, next review date.

A policy can name only registered sources, claims and capabilities. The validator checks this at load time.

### 4.3 Policy format

The format is the generic version 2 specification (`POLICY-V2-SPEC.md`):

- Every value declared with a provenance: sourced, approved, AI, or untrusted.
- Rules in fixed tier order: refuse, review, tier 1, tier 2, reject.
- Rules compare a value only with a constant or a named threshold.
- Every number has a unit. Comparisons need matching units.
- Approvals are exact.
- AI values come from a closed set and can only refuse or route.
- The validator checks these at load time and at proposal time. A policy that breaks any check is refused.

### 4.4 Decision flow

1. Load the approved policy version for the capability. If none is approved, refuse.
2. For each sourced value, ask the registered source. Verify the signature and freshness. If a source cannot answer, refuse as SOURCE_UNAVAILABLE.
3. If the caller proposed a value that a source also establishes, and they differ, refuse as INVALID.
4. Verify any required approval: exact value, unused, unexpired, and from a currently registered approver.
5. Evaluate the tiers in order. The first matching rule decides.
6. Record the decision: request, values, policy version and hash, matched rule, tier, outcome.

Outcomes: APPROVE, REJECT, REVIEW, and refusals for source unavailable, invalid agreement, or missing approval. Each carries a reason.

### 4.5 Tiers

| Tier   | Applies when                                                        | Outcome                |
| ------ | ------------------------------------------------------------------- | ---------------------- |
| Refuse | A verified value says no, or a required verified value is missing.  | Reject.                |
| Review | An untrusted or AI value would change the outcome.                  | Review item.           |
| Tier 1 | Every value read is sourced and verified, and within its threshold. | Approve automatically. |
| Tier 2 | Everything in tier 1, plus a verified approval for the exact value. | Approve.               |
| Reject | Nothing else matched.                                               | Reject.                |

Until a threshold has an approved value, the action cannot reach tier 1.

### 4.6 Review

- **Record type.** A review is its own record type, separate from approvals and refusals. It has its own lifecycle: opened, assigned, then decided (approved, rejected) or expired. The review record refers to the decision that opened it. The final outcome, an approval or a refusal, is a separate record that refers back to the review.
- **Storage and content.** Review items are append-only and durable. Each holds the request, matched rule, reason, values with provenance, and missing verified values.
- **Visibility.** Reviewers and operators see the full item. The caller sees only its status and a reason code.
- **Who may review.** A registered approver with a grant for the action and an amount limit covering the request. Not the requester. High-value items need two reviewers.
- **What a reviewer may do.** Approve or reject the exact value the source established. Nothing else.
- **Time.** Review window and approval validity are set per action class, within platform caps: a review window of at most three business days, and an approval validity of at most 60 minutes. Defaults are one business day and 15 minutes. An undecided review expires as REVIEW_EXPIRED and is never approved by default.

### 4.7 Informed approval

- The approval tool shows the full request before signing: action, target, sourced values with provenance, and the caller's reason.
- The approver confirms after reading. The tool records the confirmation and the approver's identity.
- The signature covers a digest of the displayed content. A change after display invalidates the approval.
- Approvals are exact, single-use, and short-lived.
- The review record keeps the digest, the confirmation time, and the approver's identity.

### 4.8 Thresholds and tier 1

- The action owner proposes each threshold with a reason.
- A second person, not the proposer, approves it through maker-checker.
- The risk function approves high-value thresholds.
- Each threshold has a next review date, and an earlier review after an incident near it.
- A change is a new policy version.

### 4.9 Evidence

- Each decision stores the policy hash and the matched rule id. The tier is read from the policy version named by the hash.
- Provenance is derived from the policy and request, not stored separately.
- Records are append-only. Each sourced value's signature is stored with the decision, so the record can be verified later.

### 4.10 Owners and threshold process

This is the permanent process. The business supplies the names and values. The system enforces the process.

**Owners**

- Every action and every source has one named owner, recorded in the register. The owner is a role, such as "head of refunds", with a named person in that role.
- No action owner is an engineer who builds the system, unless the action is purely technical.
- Every owner has a named successor. An action with no owner cannot reach tier 1. A source with no owner stays untrusted.
- Owners are reviewed when their role changes, and when an action or source changes its scope.

**Threshold values**

- The action owner proposes each value, with a stated reason and the evidence behind it, such as past losses or the cost of a wrong approval.
- A second person, not the proposer, approves it through maker-checker. For high-value thresholds, the risk function also approves.
- Values are reviewed on a schedule, and after any incident near the threshold.
- Until a value is approved, the action cannot reach tier 1. Engineering never sets or suggests a value in the system.

**Agreeing the register**

The business decides, once, the following, and records each as it is agreed:

1. The list of actions that need owners.
2. For each action, the owner's role and name, and the successor.
3. For each source, the data owner and its signer.
4. For each threshold, the proposed value, the reason and the approver.

The system does not need all of these before go-live. It needs them before an action or source is allowed to approve.

**Placeholders.** Until the business supplies them, every owner name, threshold value, unit, date and model name is a placeholder written as `<angle-brackets>`, for example `<action owner>`. A placeholder is never a real value. An approved policy or register entry that still contains a placeholder is refused, and the refusal names the placeholder.

### 4.11 Intermediaries, windows, go-live, existing data and confirmation

**Intermediaries.** The source owner names the intermediary and the team that operates it in the register. Its key is registered through maker-checker. Each intermediary is reviewed yearly, and the goal is native signing. A source with no registered signer stays untrusted.

**Review and approval windows.** The action owner sets them within the platform caps: three business days for review, and 60 minutes for approval validity. A new action starts at the shortest values. A change needs a second approver. The caps change only through a change to the platform, approved by the Parmana owner.

**Go-live.** An action goes live only when its owner, thresholds, sources and review path are recorded in the register and tested. Operations names one person to own this gate.

**Existing data.** Existing decision records are kept read-only and retained under the retention policy. No approval from before go-live is reused. A request that was in progress at go-live is decided again under the new system, not carried over.

**Confirmation of decisions.** The Parmana owner confirms each decision (D6 to D19) in a dated decision record. That record is the only place a decision is marked confirmed. A decision that changes later is recorded as a new decision, not edited in place.

### 4.12 Governance console: reviewers, sign-off, backups and alerts

The full design is in `GOVERNANCE-CONSOLE-DESIGN.md`, and the task-by-task instructions for owners are in `OWNER-HELP-GUIDE.md`, both in this folder. The rules below are the ones this plan depends on.

**Reviewers for high-value items.**

- Every high-value item needs two reviewers. They must be different people, and neither may be the requester or the action owner who proposed the threshold.
- The business marks a threshold as high-value. The two-reviewer rule is fixed by the platform.
- For the highest risk class, the risk function is a third approver.
- The same person may not review a second time.

**Sign-off for a new source.** Sign-off depends on what the source can do, and the console works it out from the policies that use the source. A requester cannot choose it.

- A source that can only refuse or route: a second approver in the register approves it.
- A source that can approve (used in tier 1 or tier 2): the Parmana owner signs off.
- A new intermediary signer: the Parmana owner signs off.
- A key rotation follows the source's level. A rotation for an approving source or an intermediary needs the Parmana owner.

**Backup reviewers.**

- Each action has at least two eligible reviewers besides its action owner, named in the register.
- The go-live gate refuses an action with fewer than two.
- A backup is alerted when the primary reviewer has not acted by half of the review window.
- An item no one decides expires and is refused. It is never approved by default.
- Grants are reviewed quarterly. A reviewer who leaves their role loses the grant at once.

**Alerts.**

- Every pending item that needs attention now creates an alert, when the item is created.
- Each alert explains what is pending, why, who must act, the deadline, what happens if nothing is done, and the single next step.
- An alert cannot be dismissed, snoozed or hidden. It clears only when its task is complete, or when its item is closed by its own process (expired, withdrawn or replaced), with the reason logged.
- An alert stays in a fixed bar on every screen, and reappears at each login until cleared.
- An alert escalates to the backup, then the Parmana owner, then Operations at the deadline. Each escalation is logged.
- Each alert is also sent through a second channel. If delivery fails, that failure becomes an alert to Operations.
- A pending item blocks what depends on it. If the console cannot show an alert, the action it concerns waits, and the failure is itself an alert.
- An alert for a multi-step task stays open until its last step is done, and progress is saved after each step.

**Help.** Every task an owner can do has a help entry. The console links each task to its entry, and cannot offer a task that has no entry. The task-by-task instructions for each owner role are in `OWNER-HELP-GUIDE.md`.

**Roles and screens.** The console has nine roles: action owner, second approver, risk function, source owner, reviewer, approver, Parmana owner, auditor and operator. Its screens are the register (sources, actions and thresholds), the change queue (maker-checker), the review queue, informed approval, the go-live gate, decisions and records, and the audit log. No role can change a decision or an audit entry, and no caller has access to the console.

## 5. Decisions

| ID  | Decision                                                                                                                                                                                                                                                                                                      | Status                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| D1  | Validator applies to all policies. No grandfathering.                                                                                                                                                                                                                                                         | Confirmed by owner                              |
| D2  | Intent values are not trusted.                                                                                                                                                                                                                                                                                | Confirmed by owner                              |
| D3  | A verified signed human approval is a trusted source.                                                                                                                                                                                                                                                         | Confirmed by owner                              |
| D4  | The policy language is extended for AI values.                                                                                                                                                                                                                                                                | Confirmed by owner                              |
| D5  | Every trusted source has a key.                                                                                                                                                                                                                                                                               | Confirmed by owner                              |
| D6  | Provenance is derived from the policy, not stored.                                                                                                                                                                                                                                                            | Recommended, not yet confirmed                  |
| D7  | REVIEW is a first-class outcome with its own record type, which refers to the decision that opened it.                                                                                                                                                                                                        | Recommended long-term answer, not yet confirmed |
| D8  | An intermediary may be the signer of record for a source that cannot sign. The register and every decision name both the data owner and the signer. The data owner stays accountable for accuracy. Native signing is the goal, and each intermediary is reviewed yearly.                                      | Recommended long-term answer, not yet confirmed |
| D9  | The business sets thresholds, not engineering. Each action has a named owner. Each threshold has a second approver, a reason and a review date. High-value thresholds need the risk function. A standing group of the action owner, the risk function and a second approver reviews thresholds on a schedule. | Recommended long-term answer, not yet confirmed |
| D10 | The policy format is new. No compatibility constraint is part of the design.                                                                                                                                                                                                                                  | Recommended, not yet confirmed                  |
| D11 | Review window and approval validity are set per action class, within platform caps: a review window of at most three business days, and an approval validity of at most 60 minutes. A new action class starts at the shortest values, and lengthening needs a recorded reason.                                | Recommended long-term answer, not yet confirmed |
| D12 | Approvals are always exact.                                                                                                                                                                                                                                                                                   | Recommended, not yet confirmed                  |
| D13 | Tier is explicit in each rule, and the validator checks it.                                                                                                                                                                                                                                                   | Recommended, not yet confirmed                  |
| D14 | The policy format is fully redesigned.                                                                                                                                                                                                                                                                        | Recommended, not yet confirmed                  |
| D15 | External claims go through a claims review, linked to tests or documents.                                                                                                                                                                                                                                     | Recommended, not yet confirmed                  |
| D16 | Rules never compare two values. Agreement with a sourced value is a platform check.                                                                                                                                                                                                                           | Recommended, not yet confirmed                  |
| D17 | Every numeric value and threshold has a unit. Comparisons need matching units.                                                                                                                                                                                                                                | Recommended, not yet confirmed                  |
| D18 | Every number in a rule is a named threshold, except zero.                                                                                                                                                                                                                                                     | Recommended, not yet confirmed                  |
| D19 | Sourced values name a registered source and claim, checked at load time.                                                                                                                                                                                                                                      | Recommended, not yet confirmed                  |

Confirmed by the owner, in addition to the table above: manager approval is trusted only when it verifies; the review design (who may review, what a reviewer may do, where items are stored); and the tiered approach, with human approval only where risk needs it.

## 6. Build order

Order follows the design's dependencies.

1. **Register**: sources, keys, actions, thresholds, with owners and approvers.
2. **Source signing**: the contract in 4.1. Tests for unsigned, wrong key, replayed, expired and revoked answers.
3. **Policy format and validator**: 4.3, with the checks in the spec.
4. **Decision flow**: 4.4. Tests for each outcome.
5. **Approvals**: exact, informed, single-use (4.7).
6. **Review**: items, reviewers, windows and decisions (4.6).
7. **Evidence and replay** (4.9).

Each step is complete when its tests pass. Each step is reviewed before the next begins.

## 7. Risks

- **Availability.** Until sources are registered and thresholds are set, most actions cannot be automated. This must be planned with the business before go-live.
- **Source trust.** A source is only as trustworthy as its key and its owner's process.
- **Intermediaries.** An intermediary that signs for a system is trusted for that system. Its key and code need the same review as any trusted code.
- **Approver key theft.** A stolen approver key can sign approvals until it is revoked. Mitigation: prompt revocation, short validity, exact approvals, and separation of duties.
- **Reviewer load.** Review queues can become a bottleneck. Measure them from the first release.
- **Threshold ownership.** If owners do not set thresholds, nothing reaches tier 1. Engineering cannot fill that gap.
- **Approvals without reading.** The system proves what was shown and signed, not that it was understood. Informed approval reduces this risk but does not remove it.

## 8. Out of scope

- Which owners are named, and which threshold values are set. These are business decisions.
- Deployment and go-live, including how any data that exists before go-live is handled. These are operational decisions.
- Hardware-bound approver keys (RFC-0030). Not being implemented.
- Visual design of any public website. The claims process (D15) applies first.

## 9. Open items

| Item                                                                       | Owner                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Owner and successor for each action; data owner and signer for each source | The business, recorded in the register (4.10)                                               |
| Threshold values, with reason and evidence                                 | Action owners proposed; a second person approves; risk function for high-value (4.10)       |
| Intermediary for each source that cannot sign                              | Source owners name it in the register; registered key; yearly review (4.11)                 |
| Review and approval windows per action class                               | Action owners, within the platform caps; second approver for changes (4.11)                 |
| Go-live and treatment of existing data                                     | Operations names one gate owner; existing records read-only; no old approvals reused (4.11) |
| Confirmation of D6 to D19                                                  | Parmana owner, in a dated decision record; changes are new decisions (4.11)                 |
