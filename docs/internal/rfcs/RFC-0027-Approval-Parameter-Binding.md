# RFC-0027 — Bind approvals to every parameter

Status: Proposed. Nothing is built yet.

Created: 2026-11-11

Target Version: unset.

Related: THREAT-MODEL.md T2 and T3 (residual risk), §7 (prompt injection), RFC-0026 (facts from business sources).

---

# Summary

An approval today names the action, the resource and, for some actions, the amount. Every other
parameter of the request is outside what the approver signed. An agent that was approved to post a
message to a Slack channel can post any text. An agent approved to update a HubSpot deal can set any
field the capability allows.

This RFC proposes that each approval also carry a hash of the full parameter set that will be executed.
The gateway releases the action only when the executed parameters hash to the value the approver
signed. The approver then signs exactly what runs.

# Problem

T2 in THREAT-MODEL.md records the residual risk: "An approval names the action and resource, not every
parameter (for example Slack message text, a HubSpot stage). Parameters it does not cover are the
agent's choice."

Three consequences follow.

1. **An approved action can carry unapproved content.** A person approves "post to #finance" and the
   message body that runs is not the one they read. This is the most direct route for a prompt-injected
   agent to act within an approval it was given.
2. **Approval fatigue has no check.** Even a careful approver cannot compare what they see with what runs,
   because the approval does not record the parameters.
3. **The signed record is weaker than it looks.** The Execution Trust Record proves an approval existed and
   named the action. It does not prove the approved content is the content that was sent.

# Proposal

**Approval carries a parameter hash.** An approval gains a field `parametersHash`, the SHA-256 of the
canonical serialization of the action's parameters. The canonical serialization is the one
`@parmana/crypto` already uses for the signed fields, so no new serialization is introduced.

**The gateway checks it.** Before release, the gateway recomputes the hash from the Intent that will
execute and refuses the release on mismatch, with a distinct refusal code (`PARAMETERS_CHANGED`). This
extends the existing re-check of signed signals (T7, 2.29) to the parameters themselves.

**The approver sees the parameters.** The approval interface shows the full parameter set, not only the
action and resource. Where a previous approval exists for a similar action, the interface shows the
difference. The approver signs the hash of what they were shown, so the display and the signature cannot
diverge without the gateway refusing the release.

**Versioned approval format.** Approvals gain a format version. Version 2 includes `parametersHash`.
Version 1 approvals remain valid only for actions whose policy has not opted into parameter binding, and
the policy records the opt-in per capability. This lets existing policies move one at a time.

**Explicit exclusions.** Some parameters change on every call, such as request timestamps or nonces, and
cannot be bound. A policy may list them as excluded. Each exclusion is written into the approval and into
the record, so a reader can see what was not bound. An exclusion is never silent.

## Options considered

**A. Full parameter hash, with explicit exclusions. Recommended.** Binds everything except what a policy
excludes by name. Simple to check, and the exclusions are visible.

**B. Schema-level binding.** Each capability's schema marks which fields are bound. Less friction for
volatile fields, but it moves the decision of what matters into schema authors, and an unmarked field
becomes an unbound field by default. Rejected as the default, though the exclusion list in A is a
narrow form of it.

**C. Document only.** State the limit in THREAT-MODEL.md, as the interim measure, and leave approvals as
they are. No engineering cost and no enforcement. This is the current state and is not an end state.

## Trade-offs

- Any change to a parameter after approval, however harmless, now requires a new approval. This is the
  intended effect, and it increases approval volume for agents that revise their output. It is the cost of
  binding.
- The approval format changes. Version 1 stays readable, so existing records still verify.
- The governance interface must show full parameters. Long fields, such as message bodies, need a
  readable display and a way to see the whole value.

# Privacy

An approval must not copy sensitive parameter values into a long-lived record. The approval and the record
store the hash and the list of bound field names. The values are kept only where the business already keeps
them, and only for as long as the business needs them. This matches the minimum-detail rule in RFC-0024,
decision 8.

# Open questions

1. **Canonicalization of nested and optional fields.** The rule for absent versus null fields, and for
   numbers and dates, must be fixed and tested before the format is released. Proposed: reuse the rule in
   `@parmana/crypto` and add test vectors for each field type.
2. **Exclusions and abuse.** An author could exclude a sensitive field to get around binding. Proposed: an
   exclusion needs maker and checker approval, the same as a policy change (T11), and each exclusion appears
   in the policy approval log.
3. **Interaction with RFC-0026.** A parameter that a policy sources from a business system is already
   refused if the agent proposes another value. Confirm that the bound hash uses the sourced value, not the
   agent's.
4. **Interface cost.** Showing full parameters for every approval may slow approvers. Decide whether the
   difference view is required in version 2 or can follow.
5. **Connector-side check.** Should the connector also check the hash, as a second check at the business
   system (E5)? Proposed: yes, for capabilities whose connector is in this repository, and as an option for
   external connectors.

# Non-goals

- Judging whether the approved content is good. The approver still decides.
- Detecting prompt injection in the parameter text. This RFC does not depend on classifying content.
- Binding parameters that the policy does not name for an action. Those stay as they are today, and the
  policy must opt in.

# Acceptance

The RFC is ready to build when:

- the canonicalization rule and its test vectors are written (open question 1);
- the exclusion rule is agreed (open question 2);
- the interaction with RFC-0026 is confirmed (open question 3);
- at least one capability (Slack `slack:post-message` is the proposed first) runs end to end with a bound
  approval, and a changed message is refused with `PARAMETERS_CHANGED`.

# Still to do

- Canonicalization rule and test vectors.
- Approval format version 2 and the gateway check.
- Governance interface: full parameter display and the difference view.
- Policy opt-in field and its validation.
- A changed-parameter test for each opted-in capability.
