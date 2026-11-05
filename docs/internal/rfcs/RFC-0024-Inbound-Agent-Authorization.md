# RFC-0024 — Inbound agent authorization: checking agents that reach your systems directly

Status: Draft

Created: 2026-11-01

Target Version: unset — scoping document only, no implementation started

Gap: G-129 in `docs/internal/VERIFICATION-GAPS.md`

---

# Summary

Parmana checks and records actions that leave through its gateway. An agent run by a customer
or a partner that calls one of your systems directly never passes through Parmana. No policy
decides that call, no approval is required, and no Trust Record is written. This RFC scopes the
options for closing that gap. It does not choose one.

# Problem

Parmana's outbound model assumes that the business system does not call Parmana and that the
caller does not call the system directly. That protects the path Parmana controls. It does not
cover an external agent that reaches a business system on its own: a customer's agent asking a
billing system to refund an order, or a supplier's agent changing a purchase order.

On that path the business system is the only control left. If it accepts the request, the
action runs, and nothing signed records the decision. The same kind of action, taken by one of
the business's own agents, would have been refused by policy.

The DSCI discussion paper _AI Liability: Industry Guidance for Agentic AI_ (section "Inbound AI
from customers and partners", category 11 of its enterprise routes) names this route as one that
carries its own liability question. Its concern is "whose authority, and whose reliance?"

# Options

**A. Gate at your systems.** Each business system that accepts external agent requests calls
Parmana to check the request before acting, the same way the gateway checks outbound actions.
Parmana returns allow, refuse or needs-approval, and writes a record. Strongest, but every
system needs a change.

**B. Edge checkpoint.** A proxy in front of the public APIs of the business systems checks every
inbound agent request before it reaches the system. No change to each system, but the proxy is
the only enforcement point, so any route that skips it is uncovered.

**C. Document only.** State the limit (done with G-129) and leave enforcement to the business
system. No engineering cost, and no enforcement either.

Recommendation for discussion: C now, with A or B scoped as a later phase. A phase that only
records and does not refuse would let the business see the inbound traffic before any rule is
enforced on it.

# Decisions so far

Status as of 2026-11-05. Every answer below was decided by the project owner and is recorded in merged
pull requests (#436, #437, #438, #439) or on the branch for the next pull request. Nothing below is built yet.

1. **Approach.** The limit is documented now (option C). The chosen design to build is option A: each
   business system that accepts external agent requests calls Parmana before it acts.
2. **No bypass.** A partner's agent must not be able to reach a business system without Parmana's check.
   Option C alone does not meet this.
3. **Identity (question 1), interim.** An external agent is identified by the partner's API key. This
   allows no per-agent grant and no revocation of a single agent, so it is a stopgap until option A is built.
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
     The record does not contain the partner's internal reasoning, which the business cannot see. Personal
     details are kept to the minimum needed.

Questions 1 to 6 are all answered. Option A is not built, and the probe that checks no-bypass does not
exist yet.

# Questions to settle before building

1. **Identity.** What identifies an external agent: a Parmana caller key (G-93 covers per-agent
   grants for internal callers), a signed agent certificate, or the partner's API key? Who issues
   it, and how is it revoked?
   Answered: see Decisions so far, item 3.

2. **Authority.** Who decides what an external agent may do: the business, the partner, or both?
   Where is that written down, and who signs it?
   Answered: see Decisions so far, item 4.

3. **Refusals and approvals.** Refused inbound requests need a record the same way refusals do
   (RFC-0021). Does a request that needs approval wait in the business system, or in Parmana?
   Answered: see Decisions so far, item 5.

4. **Bypass.** Option A and B only work if the business system cannot be reached without them.
   How is that checked, and what does the record show when it is not true?
   Answered: see Decisions so far, item 6.

5. **Reversibility.** The DSCI guidance orders controls from design out, to constrain, to
   confirm, to observe, to halt. Which tier applies to each inbound action type?
   Answered: see Decisions so far, item 7.

6. **Scope of the record.** The record would show what was asked, decided and done. It would not
   show the external agent's internal reasoning, which the business cannot see.
   Answered: see Decisions so far, item 8.

# Non-goals

- Checking how an external agent works inside, or whether its reasoning was sound.
- Enforcing policy on a partner's systems. Parmana protects the business's own systems.
- Replacing identity and access control already in place for human users.

# Acceptance (for a later RFC, not this one)

A design is ready to build when the six questions above have written answers, the options are
compared on the same test cases as the outbound path, and the bypass question has a checkable
answer in the deployment runbook.
