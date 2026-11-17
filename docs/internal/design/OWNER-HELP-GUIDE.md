# Owner help guide

Status: draft for finalisation. Written for the console's help section. Each task lists who does it, what to check first, the steps, what success looks like, and what to do if it fails. The console links each task from the screen where it is done.

How to use this guide: find your role in the contents, then the task. If a step says "the console shows", the console is the only place to do it. Do not make the change any other way.

## How alerts work

Anything that needs your attention now appears as an alert.

- **What you see.** A bar across the top of every screen, showing each open alert assigned to you. Each alert says what is pending, why, who must act, the deadline, what happens if nothing is done, and the next step.
- **You cannot dismiss it.** There is no close, snooze or "mark as read". Navigating away or logging out does not clear it. It reappears at your next login until it is cleared.
- **How it clears.** Complete the next step, and the alert clears when the last step of its task is done. Progress is saved after each step, so you can stop and resume.
- **Items closed by the system.** An alert also clears if its item expires, is withdrawn or is replaced. The console records the reason. You will see this in the audit log.
- **If you cannot act.** Hand the task to the named backup from the alert itself. If you cannot do either before the deadline, the alert escalates automatically to the backup, then to the Parmana owner, and to Operations at the deadline. You do not need to do anything for this to happen.
- **If the console cannot show an alert.** The action it concerns waits. Report it to Operations at once; this failure is itself an alert.

## Contents

- For everyone: reading a decision, reading a refusal, checking a signature
- Action owners: proposing a threshold, changing a review window, naming a successor, re-confirming ownership
- Source owners: registering a source, registering an intermediary, rotating a key, revoking a key or source, responding to an unavailable source
- Reviewers: deciding a review item, handing over a review
- Approvers: signing an informed approval, reporting a lost or stolen key
- Second approvers and risk function: approving a change
- Operations: running the go-live gate, handling alerts
- Parmana owner: confirming a decision, changing platform caps

## For everyone

### Read a decision

**Who:** anyone with a read role. **When:** you need to know why a request was approved, refused or sent for review.

**Before you start:** you need the transaction ID, or the decision reference.

**Steps:**

1. Open Decisions and records. Search by the transaction ID.
2. Open the decision. Read the outcome, the matched rule, its tier and its reason.
3. Check the values list. Each value shows where it came from: sourced, approved, AI or untrusted.
4. Check the policy version and hash shown. These identify the exact rules that ran.

**Success:** you can say, in one sentence, why the decision was reached.

**If it fails:** if the matched rule is missing, the decision is incomplete. Report the transaction ID to Operations.

### Read a refusal

**Who:** an owner whose action was refused. **When:** a request was refused and the caller asks why.

**Steps:**

1. Open the decision and read the outcome reason.
2. Identify the tier. A refuse-tier reason means a verified value said no, or a required verified value was missing. A review-tier reason means the request needs a person.
3. Read the missing values list. Each one names the source that could not confirm it.

**What it means:**

- A refusal from a verified value is final. Do not retry under the same transaction ID.
- A refusal because a value was missing or a source could not answer may succeed later. Retry with a new transaction ID once the source is available.
- A refusal because an approval is needed: an approver must sign for the exact value, then the request is sent again with a new transaction ID.

### Check a signature

**Who:** an auditor or owner. **When:** you need to confirm that a recorded value or approval really came from the source or approver it names.

**Steps:**

1. Open the decision, and select the value.
2. Select Verify signature. The console shows the source or approver, the key identifier, and whether the signature verifies.
3. If it does not verify, do not rely on the value. Report it to Operations.

**Success:** the console shows "verified" with the key identifier.

## Action owners

### Propose a threshold

**Who:** the action owner. **When:** a limit on an action needs to be set or changed.

**Before you start:**

- You are the named owner of the action (check Actions).
- You have the reason and the evidence, such as past losses or the cost of a wrong approval.
- You have the unit, and you know it matches the source's unit.
- You know who the second approver is. You cannot approve your own proposal.

**Steps:**

1. Open Register, then Thresholds, then New proposal.
2. Enter the name, value, unit, reason and evidence. Attach the evidence file.
3. Choose the review date. The console suggests a date based on the action's class.
4. If the value is high-value, the console adds the risk function as an approver.
5. Submit. The console shows the proposal in Changes with its status "awaiting approval".

**Success:** the proposal appears in Changes, with the second approver and any risk approver listed.

**If it fails:**

- "Placeholder found": a field still contains a placeholder such as `<action owner>`. Replace it with the real value.
- "Unit mismatch": the threshold's unit does not match the source's unit. Check the source's unit in the register.
- "Reason required": write the reason in your own words. Do not leave it blank or copy a placeholder.

**Next:** the second approver reviews it (see Approve a change). The threshold takes effect only when it is published.

### Change a review window or approval validity

**Who:** the action owner. **When:** the current review window or approval validity does not suit the action.

**Before you start:** the new value must be within the platform caps: three business days for review, 60 minutes for approval validity. You need a reason.

**Steps:**

1. Open Register, then Actions, then the action, then Review settings.
2. Choose Propose change. Enter the new value and the reason.
3. Submit. The console refuses any value above the cap and shows which cap applies.

**Success:** the change appears in Changes, awaiting a second approver.

**If it fails:** "Above cap": the value is larger than the platform allows. Choose a smaller value. If you need a longer window, ask the Parmana owner to review the cap. Do not try to work around it.

### Name or change a successor

**Who:** the action owner. **When:** you are leaving the role, or someone else is taking it over.

**Steps:**

1. Open Register, then Actions, then the action, then Owner.
2. Choose Propose successor. Enter the name, the role and the start date.
3. Submit. A second approver confirms.

**Success:** the action shows the successor from the start date.

**Important:** an action with no owner cannot reach tier 1. Name the successor before you leave.

### Re-confirm ownership

**Who:** the action owner or source owner. **When:** every quarter, or when prompted by an alert.

**Steps:**

1. Open the alert "Re-confirm ownership" from Home, under Overdue.
2. Check that the owner, successor and claims shown are still correct. Change any that are not.
3. Choose Confirm.

**Success:** the alert closes, and the action or source keeps its status.

**If it fails:** if you do not confirm, the action cannot reach tier 1 and the source stays untrusted until you do.

## Source owners

### Register a source

**Who:** the source owner, with the second approver in the register. The Parmana owner is also needed if the source can approve (see the rule in the governance design, 9.2).

**Before you start:**

- You know the claims the source provides, and the unit of each.
- You know who signs the source's answers: the system itself, or a named intermediary and its operator.
- You have a key identifier, and the public key for the signer.

**Steps:**

1. Open Register, then Sources, then New source.
2. Enter the name, data owner (you), signer, route (native or intermediary), key identifier, and the public key.
3. For each claim, enter its name and unit.
4. Submit. The console shows the source as "pending" and asks for the approvals its level needs.

**Success:** after the approvals, the source shows "trusted". Its claims can now be used in policies.

**If it fails:**

- "Key rejected": the public key is not in the required format. Export it again from the signing system.
- "Signer not found": an intermediary must be registered first (see the next task).
- "Placeholder found": replace any placeholder before you submit.

### Register an intermediary

**Who:** the source owner, and the Parmana owner. **When:** the source cannot sign its own answers.

**Before you start:** you need the name of the team that operates the intermediary, and a named person on it.

**Steps:**

1. Open Register, then Signers, then New intermediary.
2. Enter the name, the operating team, the named operator, the key identifier, and the public key.
3. Enter the next review date. The console sets it one year away by default.
4. Submit. The Parmana owner approves it.

**Success:** the intermediary shows "active" with its review date.

**Important:** the data owner stays accountable for the accuracy of the data. The intermediary only passes on what it receives. Native signing is the goal.

### Rotate a key

**Who:** the source owner (or the intermediary's operator). **When:** the key is due for rotation, or the key may be exposed.

**Steps:**

1. Open the source, then Keys, then Rotate.
2. Register the new public key. The console shows both keys as valid during the change window.
3. Switch the signing system to the new key.
4. When the change window ends, the console retires the old key.

**Success:** new answers verify against the new key, and the old key is shown as retired.

**If it fails:** if answers stop verifying during rotation, check which key the signing system uses. Do not retire the old key until the new one verifies.

### Revoke a key or source

**Who:** the source owner, or the Parmana owner. **When:** the key is lost, exposed, or the source is no longer valid.

**Steps:**

1. Open the source, then Keys or Status, then Revoke.
2. Enter the reason. Confirm.
3. The console marks the key or source revoked immediately.

**Result:** every answer signed with the revoked key is refused for new decisions. Actions that depend on the source stop reaching tier 1 at once.

**Important:** revoke first, then investigate. A revocation cannot be undone; a new key must be registered.

### Respond to an unavailable source

**Who:** the source owner. **When:** an alert says a source did not answer, or the review items show it as unavailable.

**Steps:**

1. Open the alert. Check the time it failed and the error shown.
2. Check the source's status page, or the signing system's health check.
3. Fix the cause. Do not change the policy to avoid the source.
4. When the source answers, the console clears the alert.

**Result:** requests that depend on the source are decided normally again. Requests refused while it was down must be sent again with a new transaction ID.

## Reviewers

### Decide a review item

**Who:** a reviewer with a grant for the action and an amount limit that covers the request. **When:** a review item is assigned to you.

**Before you start:**

- You are not the requester. If the console shows a warning, you cannot decide the item. Pass it to a backup reviewer.
- You have time before the deadline shown.

**Steps:**

1. Open Review queue. Open the item.
2. Read the request, the caller's reason, and each value with its source.
3. Check the values marked as missing or untrusted. These are the reasons the item was sent to you.
4. Choose Approve or Reject. Approve applies only to the exact value shown.
5. Write the reason in your own words.
6. Confirm.

**Success:** the item shows "approved" or "rejected" with your name, the time and your reason. The final outcome is recorded as a separate record.

**If it fails:**

- No amount field is shown: this is correct. A reviewer cannot change a value. If the value is wrong, reject and let the source send the correct value.
- "Expired": the window closed. The item was refused. Ask the requester to submit again if the request is still needed.
- "Second review needed": the item is high-value. A second reviewer must decide it too.

### Hand over a review

**Who:** the reviewer. **When:** you cannot decide an item before its deadline.

**Steps:**

1. Open the item. Choose Hand over.
2. Choose a backup reviewer from the grants listed for this action.
3. Add a note for the backup.

**Result:** the backup is assigned. The handover is recorded in the audit log.

## Approvers

### Sign an informed approval

**Who:** the approver named in the request. **When:** a request needs your signed approval for an exact value.

**Before you start:**

- You have your signing key on the approval device.
- You have time before the approval's validity ends (shown on the screen, at most 60 minutes).

**Steps:**

1. Open Approvals. Open the request.
2. Read the full request, every value and its source, and the caller's reason. Scroll to the end.
3. Choose Confirm I have read this. The console records the time and your identity.
4. Check the digest shown. It must match the digest the request displays.
5. Choose Sign. Enter your key passphrase or device confirmation.
6. Download the approval. Attach it to the request, and send the request again with a new transaction ID.

**Success:** the approval shows as signed, with its validity end time.

**If it fails:**

- "Request changed": the request changed after you opened it. Reload and read it again.
- "Key revoked": your key cannot sign. Report it to the Parmana owner.
- "Approval expired": the validity ended. Ask for the request to be submitted again for a new approval.

**Important:** sign only what you have read. You are confirming that you read it.

### Report a lost or stolen key

**Who:** the approver, immediately. **When:** a device holding your key is lost, stolen, or may be compromised.

**Steps:**

1. Tell the Parmana owner by phone, not only by email.
2. The Parmana owner revokes your key in the console.
3. Note the time you noticed the loss.

**Result:** approvals signed with the key after the revocation are refused. Any approval signed before the revocation should be reviewed by the Parmana owner.

## Second approvers and risk function

### Approve a change

**Who:** the second approver, or the risk function for high-value changes. **When:** a change is awaiting your approval in Changes.

**Before you start:** you did not propose the change. The console prevents you from approving your own.

**Steps:**

1. Open Changes. Open the proposal.
2. Read the before and after, the reason, and the evidence attached.
3. Check the unit, the review date, and that no placeholder remains.
4. Choose Approve or Reject. Write the reason.

**Success:** the change moves to "approved" and is published when its effective date comes.

**If it fails:** "Cannot approve": you proposed this change or you are not assigned to it. Ask the Parmana owner to assign another approver.

## Operations

### Run the go-live gate

**Who:** the gate owner named by Operations. **When:** an action is ready to go live.

**Steps:**

1. Open Register, then Actions, then the action, then Go-live gate.
2. Check each item: owner and successor named, every threshold approved with no placeholder, every source trusted with a named signer, review path and windows set within the caps, at least two eligible reviewers, and a test run recorded for each tier.
3. For any item that is not ticked, the console shows the task that fixes it. Follow the link.
4. When all are ticked, choose Sign off. The console records the gate owner and the time.

**Success:** the action shows "live". Its tier 1 and tier 2 rules can now approve.

**If it fails:** an unticked item means the action cannot go live. Do not tick an item without its evidence.

### Handle an alert

**Who:** the owner named on the alert, or Operations. **When:** an alert appears under Home, Overdue or Blocked.

**Steps:**

1. Open the alert. Read what it says is overdue or blocked, and the date.
2. Open the linked task. The task says what to do.
3. Complete the task, or hand it over to the named backup.
4. The alert closes when the task is done.

**If you cannot complete it:** tell the Parmana owner before the deadline.

## Parmana owner

### Confirm a decision

**Who:** the Parmana owner. **When:** a decision in the plan or the design is ready for confirmation.

**Steps:**

1. Open the decision list. Open the decision.
2. Read the recommendation and the reason it was recommended.
3. Choose Confirm, Change, or Defer. Enter the date and the reason.

**Result:** the decision is recorded with its date. A change to a confirmed decision is recorded as a new decision.

### Change a platform cap

**Who:** the Parmana owner. **When:** the review window or approval validity cap needs to change.

**Steps:**

1. Open Settings, then Platform caps.
2. Propose the new value and the reason. A second approver confirms it.
3. The console applies the new cap to new items only. Existing items keep the cap they were given.

**Important:** a cap change is a change to the platform. It is recorded in the audit log and cannot be reversed without a new change.

## Contents check

Every task above is needed by at least one role. If a task you need is not listed, report it to the Parmana owner, who will add it to this guide.
