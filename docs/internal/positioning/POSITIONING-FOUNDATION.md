# Parmana positioning foundation

- **Status:** approved by the owner, Pavan Charak, on 2026-11-19. Approved with one wording change: "business" is replaced with "institution" in the copy. The category name is "Institutional Authority Layer" (renamed from "Business Authority Layer" at the owner's request). Assets in the repository are revised against this document, one at a time.
- **Date:** 2026-11-19
- **Scope:** marketing content in this repository: the docs site home and comparison pages (`docs/site/`), and the README introduction. Technical reference (concepts, architecture, SDKs, the handbook, the claims register) is not marketing and is not rewritten here.
- **Evidence rule:** every capability named below is cited to the claim in `docs/internal/CLAIMS.md` that supports it. Anything not yet built is marked as roadmap or as a conceptual proposal.

## 1. Positioning statement

Parmana is the Institutional Authority Layer for Autonomous Systems: it makes the authority an institution delegates to AI agents explicit, checks each action against that authority before it runs, and produces evidence that anyone can verify.

## 2. Value proposition

Make sure every action stays within what your institution allows, and keep signed proof that it did.

## 3. Primary customer problem

AI agents are moving from suggesting actions to taking them: issuing refunds, paying vendors, changing records and configuration, and calling partners' systems. Access controls answer one question: can this agent reach this system? They do not answer the question the institution actually cares about: is this specific action, with this amount and in these circumstances, within the authority the institution delegated? Today that boundary is usually a prompt instruction the agent can ignore, or a log written by the system that acted. Neither gives the institution control before execution or proof after it.

This is a distinct problem. Parmana does not claim to solve every AI security or AI failure. It addresses authority: what was delegated, whether this action is within it, and whether that can be proven.

## 4. Target buyer and ideal customer profile

- **Economic buyer:** the executive who owns the process an agent would act on. Chief financial officer, chief operating officer, or head of operations, for payments, refunds, procurement and approvals.
- **Technical buyer:** the leader who would connect agents to institutional systems. Chief technology officer, head of platform, or an engineering lead.
- **Evidence consumer:** internal audit, risk, or compliance, who needs records that do not depend on the system that acted.

**Ideal customer profile.** An organization that runs, or is piloting, AI agents that take actions in finance, ERP, CRM, or infrastructure systems; that has an approval or audit obligation for those actions; and that can run a self-hosted service. The product is at prototype stage: no customers, deployments or certifications are claimed in this document or on the site.

## 5. Three core differentiators

1. **Authority is explicit and decided deterministically, not inferred.** Policy is an ordered, versioned set of rules. The first match decides, and no matching rule refuses. The same policy and inputs give the same decision, with no model call in the decision path. (Claims 2.3 Deterministic Policy Evaluation, 2.12 Fail-Closed Authorization on Rejection.)
2. **The agent cannot grant itself authority.** A fact the agent declares never counts as an institutional fact (2.44). A human approval must be signed by a trusted approver, bound to the action, the resource and the amount, and single use (2.42, 2.47). A rule change needs a second, different person to approve it (2.26). The gateway holds connector credentials, so the agent does not (credential isolation, handbook chapter 11).
3. **Proof that does not depend on trusting Parmana.** Each decision and release produces a signed record. Anyone can verify it offline with the public key they choose to trust (2.5 Verifiable Execution Evidence, 2.6 Independent Verification, 2.11 Trust Record Bound to Its Authorization).

## 6. Institutional leader messaging

- **Headline:** Keep institutional authority in human hands, even when execution becomes autonomous.
- AI agents can propose and start actions. The institution decides what authority to delegate, and writes it down as rules.
- Before any action runs, Parmana checks it against those rules. If a rule needs a person, a named approver must sign that exact action.
- Every decision and every release leaves a signed record. Auditors and regulators can check it without access to your systems.
- Parmana does not replace your identity, security or AI governance tools. It answers a different question: is this action within what we delegated, and can we prove it?

## 7. Engineering leader messaging

- **Enforcement boundary.** Parmana is an execution control layer in front of connectors. The gateway is the only release path in the default server, and it re-verifies the signed authorization before it releases anything (concepts: the gateway).
- **Policy evaluation.** Ordered rules, first match wins, default deny. Policy versions are pinned and checked at execution time (2.27). Policy changes are maker checker, with a step-up signature on the approver's own key (2.26).
- **Request normalization and canonical serialization.** Requests are serialized canonically before hashing and signing, so the content hash binds the exact request (crypto canonical reference). Signatures bind the authorization to that content, and the gateway re-derives the hash itself.
- **Deterministic authorization.** No randomness or model calls in the decision path. The clock and identifiers are injected (determinism and clocks).
- **Cryptography and trust roots.** Approvals are Ed25519-signed and verified against a trusted approver key (2.47). ML-DSA-65 is selectable (2.14). Trust records are verified offline against a public key the verifier chooses (2.6). Signing keys load from a secret manager at startup (claim 2.58, "Signing Keys Are Loaded From a Secret Manager", 2026-11-07), and the signing key can sit in AWS KMS (2.37).
- **Failure semantics.** Fail closed. A missing rule refuses. Unreadable signal or authority state refuses (2.29; claim 2.55 gives `AUTHORITY_UNCLEAR`). Intents are signed before release, and an intent with an unknown outcome has a repair path (2.39).
- **Known limits, stated plainly.** Parmana checks only actions that pass through its gateway. It does not inspect model text. The operator kill switch (claim 2.58, "An Operator Can Stop All Execution") is built and tested, but it does not recall actions already released, and it halts every caller at once, not one agent.

## 8. Five concrete use cases

Status tags follow the site convention: AVAILABLE means built and tested; PARTIAL means it exists with stated gaps; ROADMAP means designed, not built.

1. **Refunds within a limit.** A support agent may refund up to a set amount. Above that, a named manager signs an approval for that order and amount, valid for 15 minutes and usable once. AVAILABLE with the policy written by the institution. The refund connector is the institution's own.
2. **Vendor payments.** An agent prepares a payment. Parmana releases it only to a vendor the policy allows, within the approved amount, after a signed approval. AVAILABLE as a reference policy (`vendor-payment`). The payment connector is the institution's own.
3. **ERP or CRM record changes.** An agent may update a deal stage. A discount above a threshold needs a signed approval from the sales lead. AVAILABLE as a policy pattern. The CRM connector is registered as an external endpoint (ADR-0013).
4. **Infrastructure changes.** An agent may restart a staging service. A production change needs a signed approval from the on-call lead. AVAILABLE for the policy and approval. The infrastructure connector is the institution's own.
5. **Per-agent authority grants.** The warehouse agent may release goods up to a set amount per request until a stated date. PARTIAL: grants, their maker checker and their checks are implemented (2.55), but they are opt-in per policy and no shipped policy requires one yet.

## 9. 30-second verbal pitch

AI agents are starting to take real actions: refunds, payments, changes to records and infrastructure. The question for an institution is no longer only whether an agent can reach a system. It is whether this specific action is within what we allowed. Parmana is the layer that answers that. You write the authority you delegate as rules. Before an action runs, Parmana checks it against those rules, and asks a named person to sign anything above the line. Then it gives you a signed record that anyone can verify. Your agents propose. You keep the authority.

## 10. 2-minute founder pitch

Here is a problem most companies will meet this year. They want AI agents to do work that moves money or changes institutional records. The agents are capable. What is missing is a control that sits between the agent and the action.

Access control does not solve it. A refund agent that can reach the refunds system has access. It does not follow that a 40,000 refund, to an account the institution has not verified, is within what the institution delegated. Access tells you who can reach a system. Authority tells you what a specific action is permitted to do, under what conditions, and who approved it. Most institutions have authority written in policy documents and in people's heads, and nothing enforces it at the moment an agent acts.

Parmana is the institutional authority layer for autonomous systems. Here is what it does, in order. The institution declares its authority as versioned rules. An agent proposes an action. Parmana evaluates the action against those rules. If a rule requires a person, the action waits for a signed approval from a trusted approver, for that action and that amount. Only an approved action is released, and the gateway holds the credentials, so the agent never does. Then Parmana produces a signed record of the decision and the release. Anyone can check that record offline, without trusting us or having access to your systems.

We are honest about where we are. This is a prototype. It checks actions that go through its gateway, and it does not read model output for harmful content. Some controls are built and tested, and some are still scoped: per-agent grants exist, but no shipped policy requires them yet. We would rather you check our claims than take our word. Every claim has its evidence and its limits written down.

The point of the work is simple. Keep institutional authority in human hands, even when execution becomes autonomous.

## 11. Messaging to avoid

- "AI security platform", "AI governance suite", or "zero trust for AI". Parmana is none of these, and does not replace them.
- "Prevents every AI attack", "agent-proof", "unhackable", or "stops prompt injection". Parmana does not read text and does not claim this.
- "Replaces IAM" or "identity for agents". Parmana sits after identity, not in place of it.
- "Production-ready", "enterprise-proven", "trusted by", or any customer, deployment or certification name. None is established.
- "Tamper-proof" or "immutable". Use "append-only" and "tamper-evident", which is what the claims support (ADR-0005).
- "Agents that govern themselves", or any wording that lets an agent decide its own authority.
- "Visa for AI" and similar network analogies. They imply scale and a payments role Parmana does not have.
- "Guaranteed compliance" or "meets regulation X". Parmana produces evidence that can support an audit; it does not certify compliance.
- Jargon in headlines: "execution trust record", "gateway attestation", "session credential vault".

## 12. Contradictions, unsupported claims and unclear language

| #   | Where                                                                         | Finding                                                                                                                                          | Recommendation                                                                                       | Status                        |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| 1   | `docs/site/why-parmana-is-built-this-way.mdx`, section 8                      | Says the kill switch is "designed, and not yet shipped". Claim 2.58 says it is implemented, tested and probed in production, with stated limits. | Correct to match 2.58 and list its limits.                                                           | Applied                       |
| 2   | `docs/site/index.mdx`                                                         | Links evaluators to "Evaluate Parmana", which is not a page in the navigation.                                                                   | Point to the comparison page and the verification guide.                                             | Applied                       |
| 3   | `docs/site/index.mdx`                                                         | "Under 10 minutes" for the quickstart is not supported by a measured run in the evidence.                                                        | Remove the timing claim.                                                                             | Applied                       |
| 4   | `docs/site/index.mdx`                                                         | "Visa" analogy. It implies a payments network role.                                                                                              | Replace with a concrete refund example.                                                              | Applied                       |
| 5   | `docs/site/index.mdx`                                                         | "Every stage is real, tested code" sits next to a connector that is a reference mock.                                                            | Say which connector is a mock; connectors are the institution's own.                                 | Applied                       |
| 6   | `docs/internal/CLAIMS.md`, section 1                                          | Category is "Execution Trust Infrastructure". The new positioning replaces it.                                                                   | Owner decision. Change through the claims changelog. Not changed here.                               | Open, owner                   |
| 7   | `README.md`                                                                   | Says "Not ready for public use", while the site and the positioning speak of an institution layer.                                               | Keep the prototype status on the README and on the home page. Owner to confirm the status line.      | Open, owner                   |
| 8   | `docs/site/how-parmana-compares.mdx`                                          | Accurate table, but it has no "AI security" or "AI governance" column, so the four categories are not separated.                                 | Add a short four-question section.                                                                   | Applied                       |
| 9   | `docs/site/index.mdx`                                                         | "No AI agent action is authorized without a signed human approval" is true under claim 2.47, which is scoped to policies that pass validation.   | Keep, with the scope stated in the same sentence.                                                    | Applied                       |
| 10  | Across the site                                                               | "Execution Trust Record", "Execution Gateway" and similar terms appear in the first screen.                                                      | Plain words first, the term in brackets on first use. Technical pages keep their terms.              | Applied on the home page only |
| 11  | `docs/site/why-parmana-is-built-this-way.mdx`                                 | Four ADR links pointed at `docs/adr/`, which does not exist. The ADRs live in `docs/internal/adr/`.                                              | Point the links at `docs/internal/adr/`.                                                             | Applied on this page          |
| 12  | `docs/internal/adr/ADR-0017-Operator-Kill-Switch.md`                          | Status line says "not merged, not deployed". Claim 2.58 records the kill switch wired and probed in production on 2026-10-20.                    | Update the ADR status line. The decision record is not a marketing asset, so it is not changed here. | Open, engineering             |
| 13  | `docs/site/handbook/12-connectors.mdx`, `docs/site/integrations/overview.mdx` | Link to `docs/adr/ADR-0018-...` and `docs/adr/ADR-0013-...`, which do not exist.                                                                 | Repoint to `docs/internal/adr/`. Technical pages, so not changed here.                               | Open, engineering             |
| 14  | `docs/internal/CLAIMS.md`                                                     | Claim numbers 2.58 and 2.59 are each used twice (kill switch and signing keys; policy change approval and hybrid records).                       | Renumber through the claims changelog. Pages should cite claims by title until then.                 | Open, owner                   |

## 13. Decisions for the owner

1. Approve the positioning statement and value proposition in sections 1 and 2 as the foundation for the site and the README.
2. Approve the category change in claims section 1 (item 6), or keep "Execution Trust Infrastructure" as the technical category beneath the institutional positioning.
3. Confirm the public status line (item 7). This document recommends "prototype" on the home page and README.
4. Confirm that the five use cases in section 8 may be shown publicly, with the statuses given.
