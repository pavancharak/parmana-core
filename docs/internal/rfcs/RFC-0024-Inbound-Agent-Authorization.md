# RFC-0024 — Inbound agent authorization: checking agents that reach your systems directly

Status: Decided in part. The design is chosen (option A) and all six questions are answered. Nothing
is built yet.

Created: 2026-11-01

Last updated: 2026-11-05

Target Version: unset. The design is decided; no implementation has started.

Gap: G-129 in `docs/internal/VERIFICATION-GAPS.md`

---

# Summary

Parmana checks and records actions that leave through its gateway. An agent run by a customer or a
partner that calls one of your systems directly never passes through Parmana. No policy decides that
call, no approval is required, and no record is written.

This RFC records the decision for closing that gap. Each business system that accepts external agent
requests will check the request with Parmana before it acts (option A). No route into the system may
bypass that check. The limit is documented publicly now, while option A is built.

# Problem

Parmana's outbound model assumes that the business system does not call Parmana and that the caller
does not call the system directly. That protects the path Parmana controls. It does not cover an
external agent that reaches a business system on its own: a customer's agent asking a billing system
to refund an order, or a supplier's agent changing a purchase order.

On that path the business system is the only control left. If it accepts the request, the action runs,
and nothing signed records the decision. The same kind of action, taken by one of the business's own
agents, would have been refused by policy.

The DSCI discussion paper _AI Liability: Industry Guidance for Agentic AI_ (section "Inbound AI from
customers and partners", category 11 of its enterprise routes) names this route as one that carries its
own liability question. Its concern is "whose authority, and whose reliance?"

# Options considered

**A. Gate at your systems. Chosen.** Each business system that accepts external agent requests calls
Parmana to check the request before acting, the same way the gateway checks outbound actions. Parmana
returns allow, refuse or needs-approval, and writes a record. Every system needs a change.

**B. Edge checkpoint. Not chosen.** A proxy in front of the public APIs of the business systems checks
every inbound agent request before it reaches the system. No change to each system, but any route that
skips the proxy is uncovered, which does not meet the no-bypass decision below.

**C. Document only. Done now, as an interim measure.** The limit is stated publicly, and enforcement is
left to the business system. No engineering cost, and no enforcement either. It does not meet the
no-bypass decision, so it is not the end state.

# Decisions

Each decision below was made by the project owner. Each is recorded in the merged pull requests
#436, #437, #438, #439 and #440.

1. **Approach.** Option A is the design to build. Option C is the interim measure until it exists.
2. **No bypass.** A partner's agent must not be able to reach a business system without Parmana's
   check. Option C alone does not meet this.
3. **Identity (question 1), interim.** An external agent is identified by the partner's API key. This
   allows no per-agent grant and no revocation of a single agent. It is a stopgap until option A is
   built, and option A will need a per-agent identity.
4. **Authority (question 2).** An external agent may only propose an action. The business decides
   whether it runs. A proposal is never permission to act.
5. **Records of refusals and approvals (question 3).** Inbound requests, including refusals and
   approvals, are recorded as signed records, the same way outbound refusals are (RFC-0021).
6. **Verifying no bypass (question 4).** The business system refuses any request that does not carry a
   valid Parmana approval. A scheduled probe sends a direct request with no approval and expects a
   refusal, in the same pattern as the kill-switch probe. A probe that gets through is recorded as a
   signed record and raised as an alert. A bypass the probe does not see cannot be known to Parmana, so
   the record must say "not verified" rather than imply coverage.
7. **Which actions need a human (question 5).** Set per action in the policy. Each action's policy states
   whether a human approval is needed, and the record shows the approval used. The same policy applies to
   an outside agent's request as to one of the business's own agents.
8. **What the record of an outside request contains (question 6).** Every record of an outside request
   contains:
   - who asked: the partner's key identifier;
   - what was proposed: the action, the resource it touches, and the amount where there is one;
   - which rule applied: the policy and its version;
   - the decision: approved, refused, or waiting for a person;
   - who approved it, if a person did, and when;
   - whether the check was in place: "verified" or "not verified".

   The record does not contain the partner's internal reasoning, which the business cannot see.
   Personal details are kept to the minimum needed.

# Questions (all answered)

1. **Identity.** What identifies an external agent, and who issues and revokes it? Answer: partner API
   key, interim (decision 3).
2. **Authority.** Who decides what an external agent may do? Answer: the business decides, and the agent
   only proposes (decision 4).
3. **Refusals and approvals.** How are they recorded, and where does a request waiting for approval
   sit? Answer: as signed records, the same as outbound (decision 5).
4. **Bypass.** How is no-bypass checked, and what is recorded if it fails? Answer: a scheduled probe, and
   "not verified" when a bypass cannot be seen (decision 6).
5. **Reversibility.** Which tier applies to each inbound action type? Answer: set per action in the
   policy (decision 7).
6. **Scope of the record.** What does a record of an outside request contain? Answer: the six items in
   decision 8.

# Still to do before this is built

- **Option A itself.** Each business system that accepts external agent requests calls Parmana before it
  acts. Not started.
- **The no-bypass probe.** A scheduled check, as in decision 6. Not started.
- **The no-bypass check in the deployment runbook.** Acceptance requires that a checkable answer exists
  there. Not written.
- **A per-agent identity** to replace the interim partner API key (decision 3).
- **Comparison on the same test cases.** Acceptance requires option A to be tested on the same cases as
  the outbound path. Not done.

# Non-goals

- Checking how an external agent works inside, or whether its reasoning was sound.
- Enforcing policy on a partner's systems. Parmana protects the business's own systems.
- Replacing identity and access control already in place for human users.

# Acceptance

The design is ready to build when all six questions have written answers (done), the options are compared
on the same test cases as the outbound path (not done), and the bypass question has a checkable answer in
the deployment runbook (not done).
