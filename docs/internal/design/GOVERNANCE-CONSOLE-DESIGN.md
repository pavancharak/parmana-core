# Governance console: design

Status: design for finalisation. Derived from the plan (`TRUSTED-UNTRUSTED-PLAN.md`) and the spec (`POLICY-V2-SPEC.md`). Covers the register and the review and approval queue. No code.

## 1. Purpose

One console where the business manages who owns what, which sources and thresholds are in force, and what needs a person's decision now. It is not a place where the system's decisions are made or edited. Decisions are made by the policy. The console only records human choices: changes to the register, reviews, and informed approvals.

## 2. Roles and permissions

| Role | Can see | Can do |
|---|---|---|
| Action owner | Their actions, thresholds, review windows | Propose threshold and window changes; propose a successor |
| Second approver | Proposed changes to any action they are assigned | Approve or reject a proposed change |
| Risk function | Proposed high-value thresholds | Approve or reject high-value thresholds |
| Source owner | Their sources, signer, key status | Propose signer and key changes |
| Reviewer | Review items they are granted for, within their amount limit | Approve or reject a review item |
| Approver (signer) | Requests they are asked to approve | Confirm, then sign an informed approval |
| Parmana owner | Everything | Approve platform caps and go-live gates; confirm decisions |
| Auditor | Everything, read-only | Export records |
| Operator | Health, queues, overdue items | Nothing that changes a decision or a register entry |

Rules that hold for every role:

- No one approves their own proposal, change, or review.
- A reviewer may not be the requester.
- Every change and every human decision is written to an append-only audit log, with the actor, time and reason.
- No caller has access to the console. Callers see only status through the API.

## 3. Screens

### 3.1 Home

Four tiles, each linking to a list:

- Needs me: review items, proposed changes and approvals waiting for the current user.
- Overdue: reviews past their window, thresholds past their review date, owners not re-confirmed this quarter, intermediaries due for yearly review, keys due for rotation.
- Blocked: actions and sources that cannot reach tier 1 or approve, with the reason (no owner, no threshold, placeholder, unsigned source).
- Recent decisions: the last human decisions made in the console.

### 3.2 Register

Three tabs.

**Sources.** One row each: name, data owner, signer (system or named intermediary and operator), route, key status, claims with units, status (trusted, untrusted, revoked), next review date. Opening a source shows its history of signer, key and status changes.

**Actions.** One row each: capability (`<system>:<action>`), action owner, named successor, tiers in force, review window, approval validity, go-live gate status (see 3.6).

**Thresholds.** One row each: name, value, unit, owner, second approver, risk-function approval if high-value, reason, next review date, status (proposed, approved, active, superseded). A threshold is never edited in place. A change creates a proposal.

Every row that still holds a placeholder is marked, and the console refuses to publish it (spec check 20).

### 3.3 Changes (maker-checker)

A queue of proposed changes: new threshold value, window change, new owner or successor, new source or signer, key rotation, policy version.

Each proposal shows:

- the change, as a before and after comparison,
- the proposer, the reason, and the evidence attached,
- who must approve, including the risk function where required.

The approve button is disabled for the proposer. A rejected proposal stays visible with its reason. An approved change takes effect only when it is published as a new policy or register version.

### 3.4 Review queue

Items for the current reviewer, within their grant and amount limit.

Each item shows, in plain language:

- what was requested, the target, and the caller's reason,
- the values the source established, each with its provenance and the source's claim,
- the values that are missing or untrusted, marked as such,
- the rule that opened the review and why,
- the deadline, and whether it will expire.

Actions: approve the exact value shown, or reject. There is no field to change an amount. A reviewer who wants a different value rejects, and the source path provides the correct one.

The item shows a warning if the reviewer is the requester, and then offers no action.

### 3.5 Informed approval

The approval screen is the only place an approver signs.

1. Show the full request as in 3.4, including the values and their provenance.
2. The approver scrolls to the end and presses a confirm control that records the time and identity.
3. The console computes the digest of exactly what was shown and displays it.
4. The approver signs. The signature covers the digest, the exact value, the scope, and a single-use short validity.
5. The approval is shown once, for the caller to attach. It can be downloaded but not edited.

If the request changes after step 1, the screen blocks signing and asks the approver to reload.

### 3.6 Go-live gate

One checklist per action, all items required before the action can approve:

- owner named, successor named,
- every threshold approved, none placeholder,
- every source it uses trusted, with signer named,
- review path set, with window and approval validity within the caps,
- a test run recorded for each tier.

The gate owner, named by Operations, signs off. Sources are signed off as set out in 9.2. The gate refuses an action with fewer than two eligible reviewers (9.3).

### 3.7 Decisions and records

Read-only. Filter by action, tier, outcome, date, and source. Open a decision to see the policy version and hash, the matched rule and its tier, each value with provenance, the signatures and whether they verify, and any linked review record.

Review records and approval records link to the decision that opened them, as the spec requires.

### 3.8 Audit

Read-only log of every change and human decision, with actor, time, reason and before and after. Exportable for auditors. The log cannot be edited.

## 4. States

- **Review item:** open, assigned, approved, rejected, expired. Expired is never approved.
- **Proposed change:** proposed, approved, rejected, withdrawn, published.
- **Threshold:** proposed, approved, active, superseded.
- **Source:** pending, trusted, untrusted (no signer, revoked, or key expired), retired.
- **Action:** not live (gate incomplete), live, suspended (owner missing, or a source untrusted).

## 5. Alerts and reminders

- Review item at half its window, and at expiry.
- Threshold at its next review date, and after an incident flagged near it.
- Owner not re-confirmed this quarter. The action is suspended from tier 1 until re-confirmed.
- Intermediary due for its yearly review.
- Key due for rotation or past its end date.

## 6. Content rules

- Plain language. Reasons are written by people, and shown as written.
- Amounts and values always show their unit.
- Times show the time zone.
- A placeholder is shown as a placeholder, never as a value.
- Every decision shows the exact text the policy used as its reason.

## 7. Errors and edge cases

- A source that cannot answer appears in the review item as unavailable, with the time it failed. It is not shown as an empty value.
- A reviewer who is unavailable is replaced by a backup reviewer in the grant, with the change logged.
- If no reviewer is available, the item expires and is refused. It is never approved by default.
- If an approver's key is revoked while they are signing, the signing is refused and the reason is shown.

## 8. Out of scope

- Making or changing a decision.
- Editing an audit entry or a decision record.
- Caller-facing screens.
- Visual design, which follows the claims process in the plan (D15).

## 9. Reviewer, sign-off and backup rules

These rules are set by the platform. The business supplies only the values they apply to.

**9.1 Reviewers for high-value items**

- Every high-value item needs two reviewers. They must be different people, and neither may be the requester or the action owner who proposed the threshold.
- The business marks a threshold as high-value. The two-reviewer rule is fixed by the platform.
- For the highest risk class, the risk function is a third approver.
- The console shows the reviewers' identities in the audit log. It refuses a second review by the same person.

**9.2 Sign-off for a new source**

Sign-off scales with what the source can do:

- A source that can only refuse or route: a second approver in the register approves it. No Parmana owner sign-off.
- A source that can approve (used in tier 1 or tier 2): the Parmana owner signs off.
- A new intermediary signer: the Parmana owner signs off, because it changes the trust base.
- A key rotation: follows the source's level. A rotation for an approving source or an intermediary needs the Parmana owner.

The console determines the level from the policies that use the source. The requester cannot choose it.

**9.3 Backup reviewers**

- Each action has at least two eligible reviewers besides its action owner, named in the register with their grants.
- The go-live gate (3.6) refuses an action with fewer than two.
- When a primary reviewer has not acted by half of the review window, the console alerts the backup.
- If no eligible reviewer acts before expiry, the item expires and is refused. It is never approved by default.
- Grants are reviewed quarterly. A reviewer who leaves their role loses the grant at once.

## 10. Help and instructions

- Every task an owner can perform is written up in `OWNER-HELP-GUIDE.md`, in this folder. Each entry gives who does it, what to check first, the steps, what success looks like, and what to do if it fails.
- The console links each task from the screen where it is done. The link opens the same text, so instructions and screens cannot drift apart.
- A task with no help entry cannot be published. The console refuses to offer it, so a role is never asked to do something it has no instructions for.
- Help is written in plain language and never refers to internal file names, except where an owner needs to find a document.
- Help is reviewed with each change to the console, and whenever a decision in the plan changes.

## 11. Pending actions and alerts

**11.1 What is an alert.** Any pending item that needs a person's attention now is an alert. This includes a review waiting for a decision, a change waiting for approval, an approval needed before a request can proceed, a source that cannot answer, a key that is expiring or revoked, an owner who has not re-confirmed, a threshold review that is due, an intermediary review that is due, a go-live gate that is incomplete, and a placeholder that blocks publication.

**11.2 When an alert appears.** An alert is created when the pending item is created, not when someone notices it. No pending item is allowed to exist without an alert.

**11.3 What an alert contains.** Every alert gives, in plain language:

- what is pending, and the item's reference,
- why it needs attention,
- who must act (the named person, and their backup),
- the deadline, and the time remaining,
- what happens if nothing is done (for example, the request expires and is refused),
- the single next step, with a direct link to the task and its help entry (see the owner help guide).

**11.4 Cannot be dismissed.** An alert cannot be dismissed, snoozed, hidden or marked read. The only ways it clears are:

- the task is completed, or
- the item is closed by its own process (expired, withdrawn, or superseded). Each of these is recorded in the audit log with a reason.

Closing a browser window, logging out or navigating away does not clear it.

**11.5 Always visible.** An alert for a person appears in a fixed bar on every screen of the console until it is cleared, and again at each login. It cannot be scrolled out of view.

**11.6 Escalation.** If an alert is not acted on by its escalation point, it goes to the backup, then to the Parmana owner. At the deadline, it also goes to Operations. Each escalation is recorded.

**11.7 Outside the console.** Each alert is also sent to the assigned person by a second channel (email and phone, as set by the register). If delivery fails, that failure becomes an alert to Operations, so no alert is silently lost.

**11.8 Blocking.** A pending item blocks what depends on it. An action with an open alert about its gate, owner, or a source cannot approve, and the console shows the blocking alert beside the action.

**11.9 Multi-step tasks.** An alert stays open until the last step of its task is done. Progress is saved after each step, and the alert shows the next step. An interrupted task resumes at the saved step.

**11.10 No silent failure.** If the console cannot create or show an alert, for example because its store is unavailable, the action that needs the alert waits. The failure is itself an alert to Operations. A request is never decided while its alert cannot be shown.

**11.11 Audit.** The creation, display, reminder, escalation, delivery and clearance of every alert are recorded in the audit log.

**11.12 Alert classes and urgency.**

| Class | Examples | Urgency |
|---|---|---|
| Immediate | A review or approval whose deadline is near; a revoked key in use; a source down for a live action | Shown at once, escalated at half the window |
| Due | A threshold review date, an owner re-confirmation, a yearly intermediary review | Shown seven days before the date, escalated on the date |
| Blocking | A gate incomplete, a placeholder, a missing owner | Shown until the action is unblocked |
