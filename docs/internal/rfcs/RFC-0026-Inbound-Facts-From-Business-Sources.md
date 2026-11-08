# RFC-0026 — Inbound checks: facts from the business, not from the partner

Status: Draft. No implementation has started.

Created: 2026-11-05

Target Version: unset

Depends on: RFC-0023 (business validation), RFC-0024 (inbound authorization), RFC-0025 (inbound decisions).

Gap: G-129 in `docs/internal/VERIFICATION-GAPS.md`

---

# Summary

The inbound check (`POST /v1/inbound/checks`) can evaluate the policy for a capability only on facts
it has. Today those facts are declared by the partner, in the same way `/execute` accepts declared
signals. A declared fact can refuse a request, but it must never be the reason a request is approved.
This RFC proposes the permanent source of those facts: the business's own records, read through the
business validation sources that RFC-0023 already defines.

# Problem

If a partner's agent declares that an order is valid, a payment is settled, or a refund is within
limit, and the policy approves on that declaration, the partner decides its own approval. That is the
gap the inbound design exists to close. Declared facts are not evidence. The business system is the
only party that knows whether the order exists, and it must be the one that says so.

# Proposal

1. **Facts a policy needs are named in the policy.** Each capability's policy declares the facts it
   approves on, as it already does for signals, with the source each fact must come from.
2. **Each fact comes from a registered business validation source (RFC-0023).** For an inbound check,
   Parmana asks the source for the fact about the exact business object in the request, and evaluates
   the policy on the value the source returns. The partner's declared value is only compared with it.
3. **A mismatch refuses.** If the partner's declared value differs from the source's value, the
   request is refused, with reason `declared_fact_mismatch`.
4. **Fail closed.** If a required source does not answer, or answers with an error or a stale value,
   the request is refused. A missing source is never treated as a passing fact.
5. **The record shows where each fact came from.** The decision records, for each fact, the source name
   and the time it was read, so an auditor can see that the business confirmed it.

# What this does not change

- The grant limits (RFC-0024) still apply. A fact cannot widen a grant.
- A capability with no registered source for a fact cannot be approved on that fact. It can still be
  refused.

# Open questions

1. **Which source for each capability.** The business registers the sources. Who checks that a source
   really belongs to the business, and who can change it?
2. **Source trust.** A source is an endpoint the business runs. How is it authenticated, and what
   happens when it is replaced?
3. **Latency.** A source read adds a round trip to every check. What is the timeout, and what is the
   refusal when it expires?
4. **Staleness.** How old may a fact be before it no longer counts? A fixed window, or the source's own
   timestamp?
5. **Coverage.** Which capabilities need a source before they can be approved at all? Until every
   approved capability has one, the check refuses those capabilities rather than approving them on
   declared facts.

# Non-goals

- Verifying the partner's own records. Parmana checks the business's records, not the partner's.
- Replacing the policy engine. It still evaluates the policy; only the source of the facts changes.

# Acceptance

The design is ready to build when the five open questions have written answers, the refusal reasons
are added to the decision record format, and a test shows that an approval on a declared fact alone
is refused.
