# Beyond Trust But Verify

## Why Autonomous AI Needs Verifiable Execution

**A Parmana Systems Research Publication**

---

## Abstract

As artificial intelligence systems move from generating recommendations to taking actions, the question of accountability is changing.

AI policy increasingly emphasizes safety frameworks, risk assessments, transparency reports, incident reporting and independent evaluation. These mechanisms are important. They help establish what developers say about their systems, what risks they have assessed and how others can scrutinize those assessments.

But a further question emerges when AI systems are connected to business operations:

**How can an organization establish that every action taken by an autonomous system was within the authority it had actually been given?**

An AI agent may be permitted to process refunds, initiate payments, update customer records or manage procurement. Its ability to perform an action does not establish its authority to perform that action. Nor does an instruction asking the agent to respect business rules guarantee that those rules will be enforced.

This paper examines the gap between AI assurance and business execution accountability. It proposes a complementary control architecture in which business authority is explicitly declared, authorization is evaluated independently of the AI agent, execution is restricted to the approved action, and evidence is generated for independent verification.

The central proposition is straightforward:

**AI can propose. Business authority must be established elsewhere. Execution must be controlled. Evidence must make accountability verifiable.**

---

## 1. The accountability question is changing

For much of the development of AI, the primary question was what a system could produce.

Could it answer accurately? Could it summarize a document? Could it write code? Could it generate a useful recommendation?

As AI systems become agents, these questions are no longer sufficient.

An agent connected to a business application may initiate a refund, approve a purchase, change a supplier record, modify a customer account or trigger a financial transaction.

The consequences are no longer limited to the quality of an answer. They extend to the actions taken by the system and the authority under which those actions occur.

Consider a simple example.

A company deploys an AI agent to handle supplier payments. The organization permits the agent to initiate payments up to ₹50,000 to approved suppliers. Payments above that amount require additional approval.

The agent receives a request to pay a supplier ₹75,000.

It may understand the request. It may have access to the payment API. It may even generate a convincing explanation for why the payment should proceed.

But none of those facts establishes that the agent has authority to make the payment.

The relevant question is not whether the agent can perform the transaction. It is whether the organization authorized that specific transaction under its declared rules.

This is the difference between capability and authority.

A system can possess the capability to perform an action without possessing the authority to perform it.

---

## 2. What the report and California's framework establish

In *Trust But Verify: Implementing Frontier AI Policy in California and Beyond*, Scott R. Singer and co-authors examine how frontier AI policy can move beyond voluntary commitments toward transparency, assessment and accountability [1]. The report builds on the June 2025 *California Report on Frontier AI Policy* [2], whose "trust but verify" approach relies on developers' technical knowledge while ensuring that their claims can be independently validated [2].

The report's framework covers SB 53 [3], which took effect in 2026, and two laws signed in September 2026: SB 813 [4], which sets up independent verification organizations (IVOs), and AB 1405 [5], which sets up registration for AI auditors. The report describes the latter two as "initial, high-level rules" [1]. Four points from the report are directly relevant to the accountability of increasingly autonomous systems.

### 2.1 Commitments need evidence

The report says SB 53's transparency reports "are designed to translate developers' broader safety commitments into model-specific evidence" [1]. It also notes that SB 53 "has no explicit requirements to conduct assessments or evaluations beyond companies' own commitments" [1]. Stated commitments therefore need to be checked against evidence, and that evidence needs to come from outside the developer.

### 2.2 Internal deployment is within policy scope

SB 53 requires developers to address "the risk that their models may circumvent internal oversight mechanisms" when assessing internal deployments [1]. Important AI activity increasingly occurs inside organizations, where systems may have access to internal infrastructure, tools and operational processes. Policy therefore has to address internal use as well as public release [1].

### 2.3 Independent assessment needs access

The report states that third-party assessors "need access to AI companies' systems, documents, and other information," but that "access is limited, ad hoc, and controlled by AI companies." It adds that "SB 53, SB 813, and AB 1405 do not provide specific legal rules to ensure access" [1]. An assessor who cannot examine enough of a system cannot form a well-supported judgment.

### 2.4 Evaluation results need methodological rigor

The report finds that "existing evaluation results may not be sufficiently precise and robust to support effective risk management," and it identifies methodological quality of AI evaluations as an open implementation challenge [1]. SB 813 defines IVOs by their expertise in "the metrics and methodologies" used to assess AI risk [1][4]. A score or declaration is only as informative as the method and limitations behind it.

### 2.5 This paper's reading

The following is this paper's reading, not a finding attributed to the report. Verification is only as strong as the evidence and independence behind it. The report's points on commitments, internal deployment, access and methodology all lead to the same question: can an outside party confirm what a system was permitted to do, and what it actually did? This paper examines a related but distinct problem: enforcing authority when AI systems take consequential business actions, rather than evaluating model behavior.

---

## 3. The gap between AI assurance and execution accountability

AI assurance and business execution accountability address different questions.

AI assurance examines the properties, capabilities, risks and behavior of an AI system.

Execution accountability examines whether a specific action was permitted, whether the authorization conditions were satisfied, whether execution matched the authorization and whether the resulting evidence can be independently checked.

| AI assurance | Execution accountability |
|---|---|
| What can the system do? | What is the system permitted to do? |
| How does the model behave? | Was this specific action authorized? |
| What risks have been evaluated? | Were the declared limits enforced? |
| How reliable are the assessments? | Did execution match the approved request? |
| What does the assessment establish? | What evidence establishes what happened? |

These questions are complementary.

A model may perform well in safety evaluations and still be connected to a business application with excessive permissions.

An organization may publish a comprehensive AI policy and still lack a reliable mechanism to enforce that policy at the point of execution.

An independent assessment may establish important properties of a model without establishing whether a particular payment, refund or account change was authorized.

The distinction is not a criticism of AI evaluation. It is a recognition that evaluating a system and controlling its authority are different responsibilities.

**A system can be assessed as capable and still be granted more operational authority than the business intended.**

---

## 4. Why asking AI to respect authority is insufficient

Organizations often express restrictions through instructions.

An agent may be told:

- Do not make payments above a specified amount.
- Only work with approved suppliers.
- Ask for approval before issuing a large refund.
- Never modify a protected customer record.
- Do not execute actions outside your assigned responsibility.

These instructions can help shape agent behavior. They are not, by themselves, enforcement mechanisms.

An AI system interprets instructions. Its interpretation may be incomplete, inconsistent or incorrect. It may encounter conflicting instructions, unexpected conditions or changes in the surrounding environment.

The fundamental problem is assigning the system responsibility for deciding whether it has permission to take an action.

An agent should not be the final authority on the limits of its own authority.

The organization must define those limits independently. The system that controls execution must evaluate them without relying on the agent's own interpretation as proof of permission.

This leads to a simple distinction:

**Asking an agent not to exceed its authority is different from making it technically incapable of executing beyond that authority.**

The second requires control over the execution path, not merely better instructions.

---

## 5. Authority must exist outside the agent

Business authority already exists in organizations.

It is expressed through roles, delegated responsibilities, financial limits, approval hierarchies, contractual obligations and operational policies.

When AI agents begin performing work previously carried out by people or conventional software, these existing authority structures need to become explicit and enforceable within the systems that execute actions.

For example, a business may define:

- Which agent can initiate supplier payments.
- Which suppliers are eligible.
- The maximum permitted transaction amount.
- Which accounts the agent can access.
- Which actions require human approval.
- Which circumstances invalidate or revoke permission.

The agent can interpret a business request and propose an action. But it should not be able to redefine these permissions.

A separate control mechanism must evaluate the proposed action against the organization's declared authority.

The authority decision must not depend on whether the agent can produce a convincing explanation for its request.

It must depend on whether the request satisfies the declared conditions.

---

## 6. A reference architecture for verifiable execution

This paper proposes a four-stage model:

**Declared → Authorized → Executed → Proven**

Each stage has a distinct responsibility.

### 6.1 Declared: Establish business authority

The organization defines what an autonomous system is permitted to do.

Authority should be expressed in operational terms that can be evaluated deterministically.

A payment policy, for example, might specify:

- Agent identity.
- Permitted action.
- Approved supplier.
- Maximum transaction amount.
- Currency.
- Approval requirements.
- Validity period.
- Conditions for revocation.

The authority definition should be versioned so that a later reviewer can establish which rules applied when an action was evaluated.

The AI agent may receive information about its permitted scope, but it must not control the underlying authority definition.

### 6.2 Authorized: Evaluate the proposed action independently

The agent submits a proposed action to an independent control layer.

The control layer evaluates the request against the declared authority.

It checks whether the agent is permitted to perform the requested action, whether the transaction parameters satisfy the applicable conditions, and whether additional approval is required.

The result is an explicit authorization decision.

If the request is outside the declared authority, the action is rejected.

If the request is incomplete, invalid or cannot be evaluated safely, it should not proceed by default.

The control decision should be independent of the agent's reasoning or explanation.

### 6.3 Executed: Enforce the authorization

Authorization is meaningful only when execution is bound to it.

The system must ensure that the action reaching the business application is the action that was authorized.

For example, approval for a payment of ₹25,000 to one supplier must not be reusable to execute a payment of ₹45,000 to another supplier.

A change to a material transaction parameter must require a new authorization decision.

The execution gateway must also prevent the agent from bypassing the control layer and directly accessing the underlying business operation.

Without this enforcement, the system has a policy check but not a dependable execution boundary.

### 6.4 Proven: Preserve evidence for verification

The system should generate evidence throughout the authorization and execution process.

A useful evidence record may include:

- Agent identity.
- Requested action.
- Transaction parameters.
- Applicable authority policy and version.
- Authorization result.
- Approval information, where required.
- Execution request.
- Actual execution result.
- Evidence that the executed action matched the authorized action.
- Cryptographic integrity information.

The evidence should be protected against undetected alteration and should support independent verification.

This allows an organization, auditor or other authorized reviewer to examine not only what the agent requested, but also what authority applied, what decision was made and what actually happened.

Cryptographic integrity is important here, but its limits must be understood.

A valid cryptographic proof can establish the integrity and provenance of recorded evidence. It does not, by itself, prove that the original business policy was appropriate, that the underlying data was truthful or that the organization's decision was substantively correct.

Those questions require their own controls and oversight.

---

## 7. A practical example: An AI-initiated supplier payment

Consider a procurement agent connected to a company's payment workflow.

The organization has declared that the agent may initiate payments up to ₹50,000 to approved suppliers. Payments above that limit require additional human approval.

The agent proposes a payment of ₹75,000.

The control layer evaluates the request and determines that it exceeds the agent's permitted authority.

The payment is rejected before reaching the payment provider.

The system records the request, the applicable policy version, the authorization result and the reason for rejection.

The same architecture can handle an authorized payment of ₹25,000. In that case, the gateway permits execution only for the transaction parameters that were approved.

This simple example establishes several testable properties:

1. The agent cannot increase its own payment limit.
2. The agent cannot bypass the authorization mechanism.
3. Approval for one transaction cannot be reused for a materially different transaction.
4. Revoked authority cannot continue to authorize new actions.
5. A reviewer can verify the evidence associated with the authorization and execution.

The objective is not to demonstrate that the AI agent always behaves correctly.

It is to demonstrate that the business does not have to rely on the agent behaving correctly in order to enforce its authority boundaries.

---

## 8. What must be tested

An execution accountability system should be tested against the conditions most likely to expose weaknesses in its control boundary.

| Test | Expected system behavior |
|---|---|
| Action within declared limits | Authorize and permit the exact action |
| Amount exceeds authority | Reject before execution |
| Unauthorized supplier | Reject before execution |
| Required approval missing | Do not execute |
| Transaction changed after authorization | Require fresh authorization |
| Agent authority revoked | Reject subsequent unauthorized requests |
| Policy unavailable or invalid | Fail closed |
| Evidence record altered | Independent verification detects the change |
| Agent attempts direct access to execution provider | Access denied by the execution architecture |

These tests are more meaningful than demonstrating only that an agent can complete a successful transaction.

They establish whether the business control remains effective when the agent proposes an action it should not be allowed to perform.

The architecture must also account for operational concerns such as duplicate requests, retries, timeouts, concurrent policy changes, identity compromise and failure of downstream systems. A rejected or uncertain transaction must not accidentally become an executed transaction through retry or fallback behavior.

---

## 9. The role of independent oversight

The execution architecture does not replace independent AI assessment.

Independent evaluators examine AI systems, their capabilities, methods, risks and safeguards. Auditors examine whether organizations have implemented appropriate controls. Regulators establish obligations and determine whether organizations have met them.

Execution accountability can provide an additional source of evidence for these activities.

Instead of relying exclusively on policies, declarations or retrospective explanations, an organization can preserve records of:

- The authority granted to an agent.
- The action it requested.
- The authorization decision.
- The action that reached the execution system.
- The outcome of that execution.

This evidence can support internal reviews, external audits, incident investigations and regulatory inquiries.

It can also help insurers and business partners understand how an organization controls autonomous activity.

However, evidence quality depends on the system producing it. Independent reviewers must still examine the control design, access arrangements, policy administration, key management, evidence generation and the possibility of bypass.

A system should not claim independent accountability merely because it generates cryptographically signed logs.

The control architecture and its evidence must themselves be open to meaningful examination.

---

## 10. Where this matters first

The distinction between capability and authority becomes especially important when AI systems can trigger actions with financial, operational or legal consequences.

### Banking and payments

Agents may initiate payments, issue refunds, change beneficiaries or perform account operations.

The organization needs to establish which transactions an agent can initiate, under what conditions, and whether the actual transaction matched the approved authority.

### Enterprise resource planning

Agents may create purchase orders, modify supplier records, change inventory allocations or update financial entries.

Business rules must remain enforceable even when an agent has broad access to enterprise workflows.

### Customer operations

Agents may issue refunds, change subscriptions, modify customer information or provide account credits.

Organizations need to distinguish between what an agent can technically access and what it is permitted to change.

### Procurement and supply chains

Agents may select suppliers, negotiate terms and initiate purchases.

Authority must remain connected to approved suppliers, spending limits, contractual terms and human approval requirements.

These are practical starting points because the relevant actions, limits and approval structures are already familiar to business operators.

---

## 11. The accountability infrastructure for autonomous systems

The emerging AI assurance ecosystem is addressing important questions about model capabilities, safety, risk assessment, transparency and independent evaluation.

But autonomous business execution creates an additional requirement.

Organizations need a way to translate business authority into enforceable technical boundaries and preserve evidence that those boundaries were respected.

This is the problem Parmana Systems is designed to address.

Parmana focuses on the control boundary between an AI-generated proposal and a consequential business action.

Its role is to:

1. Make business authority explicit.
2. Evaluate proposed actions against that authority.
3. Enforce authorization before execution.
4. Bind execution to the approved action.
5. Generate independently verifiable evidence of the decision and execution.

This is not a claim that every risk associated with AI can be solved by an execution control layer.

It is a narrower and more testable proposition: an organization should not have to rely on an autonomous agent to determine whether its own actions are authorized.

**Authority defines the boundaries. Parmana enforces them. Evidence establishes accountability.**

---

## 12. Conclusion: Move from declared behavior to controlled execution

Trustworthy autonomous systems require more than instructions, policies and declarations.

They require a clear separation between the intelligence that proposes an action and the authority that permits it.

AI systems can interpret context, generate recommendations and initiate workflows. But the organization must retain control over what those systems are allowed to execute.

That control cannot depend solely on the agent's interpretation of instructions or its willingness to follow them.

Authority must be explicit. Authorization must be independently evaluated. Execution must remain within the approved parameters. Evidence must be available for independent verification.

The progression is:

**Declared → Authorized → Executed → Proven**

The question for organizations deploying autonomous systems is no longer only whether their AI behaves as expected.

It is whether they can establish that every consequential action remained within the authority they granted.

Do not ask AI to decide whether it has authority.

Make authority explicit.

Make authorization deterministic.

Make execution provable.

---

## About Parmana Systems

Parmana Systems builds accountability infrastructure for autonomous systems.

It helps organizations establish explicit authority, enforce it at the point of execution and produce independently verifiable evidence of what autonomous systems were permitted to do and what they actually did.

**Authority defines the boundaries. Parmana enforces them. Evidence establishes accountability.**

---

## Research basis and scope

This paper draws on Scott R. Singer's *Trust But Verify: Implementing Frontier AI Policy in California and Beyond* [1], published by the Carnegie Endowment for International Peace in 2026, and on the *California Report on Frontier AI Policy* [2] that the report builds on.

The report examines frontier AI policy implementation, transparency, independent assessment, internal deployment oversight and the institutional conditions required for credible verification.

The execution accountability architecture developed in this paper is Parmana Systems' proposed complementary approach. It should not be interpreted as a framework prescribed or endorsed by the Carnegie Endowment or the report's author.

The architecture is a conceptual reference model. Its effectiveness in a particular deployment depends on implementation, identity and access controls, policy correctness, execution-path integrity, cryptographic key management, operational resilience and independent testing.

---

## References

1. Singer, S. R., et al. *Trust but Verify: Implementing Frontier AI Policy in California and Beyond*. Carnegie Endowment for International Peace, published November 10, 2026. https://carnegieendowment.org/research/2026/11/trust-but-verify-implementing-frontier-ai-policy-in-california-and-beyond

2. *The California Report on Frontier AI Policy*. June 17, 2025. Commissioned by Governor Gavin Newsom. https://www.gov.ca.gov/wp-content/uploads/2025/06/June-17-2025-–-The-California-Report-on-Frontier-AI-Policy.pdf (also arXiv:2506.17303, https://arxiv.org/abs/2506.17303)

3. California Senate Bill 53 (2025), frontier artificial intelligence models. Signed September 29, 2025; effective January 1, 2026. https://open.pluralpolicy.com/ca/bills/20252026/SB53

4. California Senate Bill 813 (2026), Independent verification organizations. Approved by the Governor and chaptered September 9, 2026, as Chapter 179, Statutes of 2026 (per the Legislature's bill status page, https://leginfo.legislature.ca.gov/faces/billStatusClient.xhtml?bill_id=202520260SB813). Requires the state to develop, by January 1, 2028, a process for designating third-party organizations as independent verification organizations (IVOs) (per [1]; bill text not yet checked).

5. California Assembly Bill 1405 (2026). Signed September 2026 (per [1]). Requires third-party AI auditors to register with the state beginning January 1, 2029. Confirm against the chaptered text at https://leginfo.legislature.ca.gov.

*Source 1 was checked against the report's full text. Source 4's enactment details come from the Legislature's bill status page; its text, and source 5's text, could not be read from this session.*
