# Consolidated design, decisions and open items

Status: complete as of this version. Nothing is built. This document is the single reference. It replaces reading the plan, spec, governance design and owner help guide separately. Where a detail is long, the source document is named.

Source documents (in this folder):

- `TRUSTED-UNTRUSTED-PLAN.md`: the plan, with phases, decisions and open items.
- `POLICY-V2-SPEC.md`: the policy format and validator checks.
- `GOVERNANCE-CONSOLE-DESIGN.md`: the governance console, roles, screens and alerts.
- `OWNER-HELP-GUIDE.md`: task-by-task instructions for owners.
- `NEW-SYSTEM-DESIGN.md`: the design from requirements.

## 1. Requirements

R1. Any business system can supply facts a decision depends on.
R2. A fact can justify an approval only if it is signed by a registered source, or is a verified human approval.
R3. Anything not verified (caller values, AI output, unsigned answers) can refuse or route a request. It never approves one.
R4. Every decision can be reproduced later from what was stored.
R5. Human involvement is proportionate to risk. Each action's owner sets its limits, and a second person approves them.
R6. When a required fact cannot be verified, the request is refused, not approved.

## 2. Definitions

- **Trusted value:** a value from a registered source that signed it under a registered key and verified at use, or a human approval that verifies.
- **Untrusted value:** any other value. This includes every caller value, every Intent value, every AI output, and every unsigned or wrongly signed answer.
- **Caller:** any party that submits a request: agents, integrations, people entering data, and AI models.
- **Trust comes from the signature, not the sender.**
- **Approval:** the caller carries an approval, but its trust comes from the signature. A verified approval is trusted. The caller's flag that an approval is attached is untrusted; it only asks Parmana to check the approval.
- **Trust in an approval does not prove** that the approver read the request. Informed approval (section 5.5) addresses this, but it cannot prove understanding.

## 3. Parties and roles

| Party           | Role                                                                                     |
| --------------- | ---------------------------------------------------------------------------------------- |
| Source          | A business system that establishes facts. Trusted if it signs under a registered key.    |
| Data owner      | The system whose data a source provides. Accountable for accuracy.                       |
| Signer          | The system itself, or a named intermediary that signs on its behalf.                     |
| Approver        | A named person who signs an approval for one exact action.                               |
| Caller          | Any party that submits a request. Untrusted.                                             |
| Action owner    | Accountable for an action's policy and limits.                                           |
| Source owner    | Accountable for a source's answers and key.                                              |
| Second approver | Approves changes proposed by another person.                                             |
| Risk function   | Approves high-value thresholds.                                                          |
| Reviewer        | A registered approver with a grant for an action, who is not the requester.              |
| Parmana owner   | Owns the platform: caps, go-live gates for approving sources, and decision confirmation. |
| Operations      | Runs the go-live gate and handles alerts that have no owner.                             |
| Auditor         | Reads everything. Changes nothing.                                                       |

Nine console roles are defined in the governance design (section 2): action owner, second approver, risk function, source owner, reviewer, approver, Parmana owner, auditor and operator.

## 4. Design

### 4.1 Signing

- Every source signs every answer. There is no unsigned path.
- A source registers a key. Each answer is signed over the value, subject, claim, observation time, expiry, nonce and transaction ID.
- A source that cannot sign natively may use an intermediary. The record names both the data owner and the signer.
- Keys are registered, rotated and revoked through maker-checker. A revoked key makes its answers unusable for new decisions.
- A source without a registered key and a verified answer is untrusted. It can refuse or route, never approve.

### 4.2 Register

The register is the only place that defines sources, claims, actions, thresholds and owners.

- **Source:** name, data owner, signer, route (native or intermediary), key identifier, status, claims, and the unit of each claim.
- **Action:** capability (`<system>:<action>`), owner, successor, tiers and thresholds, review settings, go-live status.
- **Threshold:** name, value, unit, owner, second approver, risk-function approval if high-value, reason, evidence, next review date, status.

A policy can name only registered sources, claims and capabilities. The validator checks this.

### 4.3 Policy format (version 2)

Specified in `POLICY-V2-SPEC.md`. In summary:

- Every value is declared with a provenance: sourced, approved, AI or untrusted.
- Rules are in a fixed tier order: refuse, review, tier 1, tier 2, reject.
- Each rule has an explicit tier field, checked by the validator.
- A rule compares a value only with a constant or a named threshold. It never compares two values (platform check instead).
- Every number in a rule is a named threshold, except zero.
- Every value and threshold has a unit. Comparisons need matching units.
- Approvals are exact.
- AI values come from a closed set and can only refuse or route.
- A policy with any placeholder cannot be approved (check 20).
- Twenty validator checks, listed in the spec (section 7).

### 4.4 Decision flow

1. Load the approved policy version for the capability. If none, refuse.
2. For each sourced value, ask the registered source. Verify signature and freshness. If it cannot answer, refuse as SOURCE_UNAVAILABLE.
3. If the caller proposed a value a source also establishes, and they differ, refuse as INVALID.
4. Verify any required approval: exact value, unused, unexpired, from a currently registered approver.
5. Evaluate the tiers in order. The first matching rule decides.
6. Record the decision: request, values, policy version and hash, matched rule, tier, outcome.

Outcomes: APPROVE, REJECT, REVIEW, and refusals for source unavailable, invalid agreement or missing approval.

### 4.5 Tiers

| Tier   | Applies when                                                        | Outcome                |
| ------ | ------------------------------------------------------------------- | ---------------------- |
| Refuse | A verified value says no, or a required verified value is missing.  | Reject.                |
| Review | An untrusted or AI value would change the outcome.                  | Review record.         |
| Tier 1 | Every value read is sourced and verified, and within its threshold. | Approve automatically. |
| Tier 2 | Everything in tier 1, plus a verified approval for the exact value. | Approve.               |
| Reject | Nothing else matched.                                               | Reject.                |

Until a threshold has an approved value, its action cannot reach tier 1.

### 4.6 Review

- A review is its own record type. It has its own lifecycle: opened, assigned, then decided or expired. It refers to the decision that opened it. The final approval or refusal is a separate record that refers back to it.
- Review items are append-only and durable. They hold the request, matched rule, reason, values with provenance, and missing verified values.
- Reviewers see the full item. The caller sees only status and a reason code.
- A reviewer approves or rejects the exact value the source established. A reviewer cannot change a value.
- An undecided review expires as REVIEW_EXPIRED and is never approved by default.

### 4.7 Informed approval

- The approval tool shows the full request before signing: action, target, values with provenance, and the caller's reason.
- The approver confirms after reading. The tool records the confirmation and the approver's identity.
- The signature covers a digest of the displayed content. A change after display invalidates the approval.
- Approvals are exact, single-use and short-lived.

### 4.8 Thresholds and tier 1

Set by the process in section 5.2. A change is a new policy version.

### 4.9 Evidence

- Each decision stores the policy hash and the matched rule id. The tier is read from the policy version named by the hash.
- Provenance is derived from the policy and request, not stored separately.
- Records are append-only. Each sourced value's signature is stored with the decision.

## 5. Governance

### 5.1 Owners

- Every action and every source has one named owner, recorded as a role with a named person and a successor.
- No action owner is an engineer who builds the system, unless the action is purely technical.
- Owners re-confirm quarterly. An unconfirmed owner suspends the action from tier 1, and a source stays untrusted.

### 5.2 Thresholds

- The action owner proposes each value with a reason and evidence.
- A second person, not the proposer, approves it through maker-checker.
- High-value thresholds also need the risk function.
- Each has a review date, and an earlier review after an incident near it.
- A standing group (action owner, risk function, second approver) reviews thresholds on a schedule.
- Engineering never sets or suggests a value.
- A threshold takes effect only as a new policy version.

### 5.3 Intermediaries

- The source owner names the intermediary and its operating team and named operator, recorded in the register.
- Its key is registered through maker-checker.
- It is reviewed yearly. Native signing is the goal.
- A source with no registered signer stays untrusted.

### 5.4 Sign-off for a new source

Sign-off depends on what the source can do, and the console determines the level from the policies that use it:

- A source that can only refuse or route: a second approver in the register approves it.
- A source that can approve (used in tier 1 or tier 2): the Parmana owner signs off.
- A new intermediary signer: the Parmana owner signs off.
- A key rotation follows the source's level. A rotation for an approving source or an intermediary needs the Parmana owner.

### 5.5 Reviewers, backups and high-value items

- High-value items need two reviewers. They must be different people, neither the requester nor the action owner who proposed the threshold. The risk function is a third approver for the highest risk class.
- The same person may not review a second time.
- Each action has at least two eligible reviewers besides its action owner, in the register. The go-live gate refuses fewer.
- A backup is alerted when the primary has not acted by half the review window.
- An item no one decides expires and is refused.
- Grants are reviewed quarterly. A reviewer who leaves their role loses the grant at once.

### 5.6 Review and approval windows (platform caps)

- Review window: at most three business days.
- Approval validity: at most 60 minutes.
- Each action class sets its values within the caps. A new action starts at the shortest values. A longer value needs a recorded reason and a second approver.
- The caps change only through a platform change approved by the Parmana owner.
- Defaults: one business day for review, 15 minutes for approval.

### 5.7 Go-live gate

An action goes live only when all of these are recorded in the register and tested:

- owner and successor named,
- every threshold approved, none a placeholder,
- every source it uses trusted, with signer named,
- review path set, windows within caps,
- at least two eligible reviewers,
- a test run recorded for each tier.

The gate owner is a role in Operations, with a named deputy. The gate owner signs off.

### 5.8 No existing data

- Nothing is live. No policy version is approved, and no customers or vendors use the system.
- There are no earlier decisions or approvals to carry over.
- Decision records are kept read-only, under the retention policy, from the first decision.

### 5.9 Decision confirmation

- The Parmana owner confirms each decision in a dated decision record. That record is the only place a decision is marked confirmed.
- A changed decision is recorded as a new decision.

### 5.10 Placeholders

Owner names, approvers, threshold values, units, dates, contacts and model names are placeholders written in `<angle-brackets>` until supplied. A placeholder cannot be approved or used for decisions.

## 6. Governance console

Full design in `GOVERNANCE-CONSOLE-DESIGN.md`. In summary:

**Screens.** Home (needs me, overdue, blocked, recent decisions); register (sources, actions, thresholds); change queue (maker-checker); review queue; informed approval; go-live gate; decisions and records (read-only); audit log (read-only).

**Permissions.** No one approves their own change or review. Every human action is written to an append-only audit log. No caller has access. No role can change a decision or an audit entry.

**States.** Review item: open, assigned, approved, rejected, expired. Proposed change: proposed, approved, rejected, withdrawn, published. Threshold: proposed, approved, active, superseded. Source: pending, trusted, untrusted, retired. Action: not live, live, suspended.

**Alerts.** Every pending item that needs attention creates an alert when the item is created. Each alert explains what is pending, why, who must act, the deadline, the consequence, and one next step.

- An alert cannot be dismissed, snoozed or hidden. It clears only when its task is complete, or the item is closed by its process (expired, withdrawn or replaced), with the reason logged.
- It stays in a fixed bar on every screen and reappears at each login until cleared.
- It escalates to the backup, then the Parmana owner, then Operations at the deadline.
- It is also sent through a second channel. A failed delivery becomes an alert to Operations.
- A pending item blocks what depends on it. If the console cannot show an alert, the action waits.
- A multi-step task keeps its alert open until the last step is done. Progress is saved after each step.

**Alert classes.** Immediate (review or approval deadline near, revoked key in use, live source down). Due (threshold review, owner re-confirmation, intermediary review, shown seven days before). Blocking (gate incomplete, placeholder, missing owner).

**Help.** Every owner task has an entry in `OWNER-HELP-GUIDE.md`. The console links each task to its entry and cannot offer a task that has none.

## 7. Decisions

| ID  | Decision                                                                                                 | Status                     |
| --- | -------------------------------------------------------------------------------------------------------- | -------------------------- |
| D1  | The validator applies to all policies. No grandfathering.                                                | Confirmed by owner         |
| D2  | Intent values are not trusted.                                                                           | Confirmed by owner         |
| D3  | A verified signed human approval is a trusted source.                                                    | Confirmed by owner         |
| D4  | The policy language is extended for AI values.                                                           | Confirmed by owner         |
| D5  | Every trusted source has a key.                                                                          | Confirmed by owner         |
| D6  | Provenance is derived from the policy, not stored.                                                       | Recommended, not confirmed |
| D7  | REVIEW is its own record type, referring to the decision that opened it.                                 | Recommended, not confirmed |
| D8  | An intermediary may sign for a source that cannot sign. The data owner and the signer are both recorded. | Recommended, not confirmed |
| D9  | Thresholds are set by the business through the process in 5.2.                                           | Recommended, not confirmed |
| D10 | The policy format is a new version (version 2). No compatibility constraint.                             | Recommended, not confirmed |
| D11 | Review and approval windows are set per action within the caps in 5.6.                                   | Recommended, not confirmed |
| D12 | Approvals are always exact.                                                                              | Recommended, not confirmed |
| D13 | Each rule has an explicit tier field, checked by the validator.                                          | Recommended, not confirmed |
| D14 | The policy format is fully redesigned, built in stages.                                                  | Recommended, not confirmed |
| D15 | External claims go through a claims review, linked to tests or documents.                                | Recommended, not confirmed |
| D16 | Rules never compare two values. Agreement with a sourced value is a platform check.                      | Recommended, not confirmed |
| D17 | Every numeric value and threshold has a unit. Comparisons need matching units.                           | Recommended, not confirmed |
| D18 | Every number in a rule is a named threshold, except zero.                                                | Recommended, not confirmed |
| D19 | Sourced values name a registered source and claim, checked at load time.                                 | Recommended, not confirmed |

Also confirmed by the owner: manager approval is trusted only when it verifies; the review design (who may review, what a reviewer may do, where items are stored); and the tiered approach.

## 8. Open items

### 8.1 Needs the business to supply

| Item                                                                                                   | Who supplies it              | Where it is recorded         |
| ------------------------------------------------------------------------------------------------------ | ---------------------------- | ---------------------------- |
| Owners and successors for each action                                                                  | Business leadership          | Register                     |
| Data owner and signer for each source                                                                  | Source owners                | Register                     |
| Threshold values, each with reason, evidence, second approver and risk-function approval if high-value | Action owners and approvers  | Register, as policy versions |
| Named intermediary operators                                                                           | Source owners                | Register                     |
| The go-live gate owner (a role in Operations, with a deputy)                                           | Operations                   | Register                     |
| Role-based contacts for the Parmana owner and Operations                                               | Parmana owner and Operations | Help guide                   |

### 8.2 Needs confirmation (recommendations)

| Item                    | Recommendation                                                                                        | Reference |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | --------- |
| D6 to D19               | As in section 7                                                                                       | Section 7 |
| Intermediaries          | Registered key, named operator, yearly review, native signing as goal                                 | 5.3       |
| Windows                 | Set per action within caps                                                                            | 5.6       |
| Go-live gate            | Gate owner in Operations, checklist in 5.7                                                            | 5.7       |
| No existing data        | Nothing live; no earlier records or approvals; records read-only and retained from the first decision | 5.8       |
| Decision confirmation   | Dated decision records by the Parmana owner                                                           | 5.9       |
| Platform caps           | Three business days for review, 60 minutes for approval validity                                      | 5.6       |
| High-value reviewers    | Two, distinct, neither requester nor proposer                                                         | 5.5       |
| Sign-off by source type | As in 5.4                                                                                             | 5.4       |
| Backup reviewers        | Two per action, alerted at half window                                                                | 5.5       |
| Alert rules             | As in section 6                                                                                       | 6         |
| Website                 | Claims review first, rewrite after version 2                                                          | D15       |
| Policy redesign scope   | Full version 2, staged, validator first                                                               | D14       |

### 8.3 Not yet done

- **Build.** Nothing is built. The build order is in section 9. It waits for your go-ahead.
- **Validation.** The two example policies in the spec have not been run through a validator, because none exists yet. The first validator tests should run them.
- **Help contacts.** The contacts in the help guide are placeholders.

## 9. Build order

Each step is complete when its tests pass. Each is reviewed before the next begins.

1. **Register:** sources, keys, actions, thresholds, with owners and approvers.
2. **Source signing:** the contract in 4.1, with tests for unsigned, wrong key, replayed, expired and revoked answers.
3. **Policy format and validator:** section 4.3, with the 20 checks in the spec. Run the two spec examples through it.
4. **Decision flow:** section 4.4, with tests for each outcome.
5. **Approvals:** exact, informed, single-use (4.7).
6. **Review:** items, reviewers, windows and decisions (4.6, 5.5, 5.6).
7. **Governance console and alerts:** section 6.
8. **Evidence and replay:** section 4.9.

Phase 1 of the old plan (the validator) corresponds to step 3 here. It does not depend on any open item in section 8.2.

## 10. Risks

- **Availability.** Until sources are registered and thresholds approved, most actions cannot approve. This must be planned with the business before go-live.
- **Source trust.** A source is only as trustworthy as its key and its owner's process.
- **Intermediaries.** An intermediary is trusted for the sources it signs. Its key and code need review like any trusted code.
- **Approver key theft.** A stolen approver key can sign until revoked. Mitigated by prompt revocation, short validity, exact approvals and separation of duties.
- **Approvals without reading.** The system proves what was shown and signed, not that it was understood.
- **Reviewer load.** Review queues can become a bottleneck. Measure from the first release.
- **Threshold ownership.** If owners do not set thresholds, nothing reaches tier 1.
- **Alert fatigue.** Non-dismissable alerts must be rare and actionable, or people will route around them. Track alert volume from the first release.

## 11. Out of scope

- Naming owners and setting threshold values. These are business decisions.
- Deployment and the first go-live of each action.
- Hardware-bound approver keys (RFC-0030). Not being implemented.
- Visual design of any public website, which follows D15.
