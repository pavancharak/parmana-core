# From Delegated Authority to Verifiable Execution

## A Deterministic Authorization Model for AI Agents

**Authors:** Parmana Systems Research. [Individual author names and affiliations to be added.]
**Research Area:** AI Agent Security, Access Control, Distributed Systems, Cryptographic Verification
**Manuscript Status:** Research Draft v0.1. Not peer-reviewed. The proposed experiments have not been run. Claims about related work are subject to verification against the full texts of the cited papers.
**Keywords:** AI agents, delegated authority, deterministic authorization, capability-based security, runtime enforcement, execution integrity, cryptographic evidence, authorization verification

**Disclosure.** This paper is written by Parmana Systems Research and describes the authorization model underlying Parmana, a commercial product. The authors have a commercial interest in the approach. The paper proposes an evaluation framework and reports no experimental results.

---

## Abstract

AI agents are increasingly being integrated into business systems to perform consequential operations, including initiating payments, approving refunds, modifying customer records, accessing sensitive information and coordinating actions across enterprise applications. These capabilities introduce a fundamental authorization problem. An agent may possess valid credentials and successfully invoke a business application programming interface without necessarily having the authority to perform the particular action requested.

Existing approaches address parts of this problem through identity management, access control, capability-based security, runtime policy enforcement and audit logging. However, the existence of a valid identity, credential or authorization decision does not independently establish that the action ultimately executed by a protected business system was identical to the action that was authorized.

This paper proposes a deterministic authorization model that connects delegated business authority to verifiable execution. The model represents authority as an explicit, bounded and revocable grant associated with a principal, an agent, permitted operations, protected resources, constraints and validity conditions. A deterministic authorization function evaluates each consequential action against the applicable grant and execution context before the action reaches the protected system.

The proposed model further introduces an authorization-to-effect evidence relationship. This relationship binds the authority grant, policy version, authorization decision, exact action parameters and execution outcome into a verifiable evidence record. Where supported by the protected system, an execution receipt or independently observed state transition provides evidence of the resulting effect.

The paper defines the system model, threat model, authorization properties, protocol stages and verification conditions. It proposes an experimental evaluation covering out-of-scope operations, expired and revoked authority, parameter manipulation, replay attacks, multi-agent delegation, evidence tampering and divergence between authorized actions and actual business-system effects.

The central proposition is that consequential agent actions should be authorized independently of the agent's reasoning, enforced at a protected execution boundary and verifiable against evidence of the resulting effect. The paper provides a formal and empirical research agenda for evaluating this proposition.

---

# 1. Introduction

## 1.1 Background

Artificial intelligence systems are moving beyond generating recommendations and responses. Increasingly, AI agents can invoke tools, interact with external services, retrieve information, modify records and initiate transactions.

An agent operating inside a financial institution, for example, may be able to:

- Initiate a payment to a registered vendor.
- Approve a refund below a specified threshold.
- Retrieve customer information.
- Modify an account record.
- Create or update an invoice.
- Delegate part of a workflow to another agent.

These operations are different from generating text. They produce effects in systems that hold business value, personal information, financial resources and operational authority.

A central question therefore emerges:

**How can an organization establish that an AI agent's actual actions remained within the authority explicitly delegated to it?**

Traditional authentication answers who or what is making a request. Authorization determines whether a particular operation is permitted under a defined set of rules. Auditing provides records of activity.

However, these functions do not automatically establish an end-to-end relationship between the authority granted to an agent, the exact action approved, and the effect produced by the business system.

For example, an AI agent may receive permission to initiate vendor payments up to ₹50,000. It may possess a valid API credential and successfully authenticate to a payment service. These facts do not establish that a payment of ₹75,000 was authorized.

Similarly, a policy engine may approve a payment request of ₹40,000, but the downstream execution system might receive a modified request, process it twice, or execute a different operation.

The problem is therefore not limited to whether an agent has access to a tool. It concerns whether each consequential action is authorized within explicit business limits and whether the resulting execution can be independently verified.

## 1.2 The authorization gap

We identify four distinct stages in an agent's interaction with a business system:

1. **Delegation:** A principal grants an agent a defined set of permissions.
2. **Authorization:** A specific requested action is evaluated against those permissions.
3. **Execution:** The protected system performs the authorized operation.
4. **Verification:** Evidence is examined to establish what was authorized and what actually occurred.

These stages are frequently implemented by different components.

An identity provider may authenticate an agent. A credential manager may provide access tokens. An orchestration framework may construct tool calls. A policy engine may evaluate requests. A business application may execute operations. An audit service may retain records.

The separation of these components creates important assurance questions:

- Was the agent acting under a valid delegation?
- Did the delegation cover the requested operation and resource?
- Were the action parameters evaluated before execution?
- Could the action be modified after authorization?
- Could a revoked grant still be used through an existing session?
- Could a delegated agent exceed the authority of its parent?
- Does the retained evidence establish the actual business-system effect?

A successful authentication event cannot answer all these questions. Neither can a policy decision or an agent-generated execution trace.

The research problem is to connect these stages through explicit authorization semantics and verifiable evidence.

## 1.3 Research objective

This paper proposes a deterministic authorization model for AI agents that binds delegated business authority to exact requested actions and connects authorization decisions to evidence of actual execution.

The model has four objectives:

1. Represent business authority as explicit, bounded and revocable grants.
2. Evaluate consequential agent actions through deterministic authorization rules.
3. Bind authorization decisions cryptographically to the exact action approved.
4. Enable independent verification of the relationship between the authorized action and the resulting business-system effect.

The proposed architecture separates probabilistic agent reasoning from deterministic authorization.

An AI agent may interpret a business request, formulate a plan and propose an operation. However, the agent's interpretation does not itself establish permission to execute that operation.

Authority must be represented and evaluated independently.

## 1.4 Research questions

This study investigates five research questions.

**RQ1:** How can delegated business authority be represented as a machine-verifiable structure for AI agents?

**RQ2:** How can authorization be evaluated deterministically at the execution boundary, independently of an agent's reasoning?

**RQ3:** How can an authorization decision be cryptographically bound to the exact action and its parameters?

**RQ4:** How can expiration, revocation and authority constraints be preserved across multi-agent delegation chains?

**RQ5:** What evidence is required for an independent verifier to establish whether an executed action corresponded to the original authorization?

## 1.5 Research contributions

The proposed contributions are:

**C1. Formal representation of delegated business authority.**
A structured model representing principals, agents, grants, delegation relationships, scopes, policies, actions and execution contexts.

**C2. Deterministic execution authorization.**
A model in which consequential actions are evaluated against explicit authorization conditions before reaching the protected execution system.

**C3. Authorization-to-action binding.**
A cryptographic relationship between the authorization decision and the exact normalized action, including its parameters and relevant context.

**C4. Authorization-to-effect verification.**
A verification model that compares the authorized action with evidence obtained from the protected execution system or an independent observer.

**C5. Experimental evaluation framework.**
A reproducible set of adversarial and operational experiments for evaluating authorization correctness, delegation containment, execution correspondence and evidence integrity.

The paper does not claim that access control, capability tokens, cryptographic signatures, policy enforcement points or tamper-evident logs are individually new. Its proposed contribution is their integration around the end-to-end authorization-to-effect relationship, together with a testable evaluation model.

---

# 2. Related Work

## 2.1 Traditional access control

Access control has long provided mechanisms for restricting operations on protected resources.

Role-Based Access Control (RBAC) associates permissions with roles and users or other principals. Attribute-Based Access Control (ABAC) evaluates attributes of the subject, resource, action and environment against defined policies.

These models provide foundations for representing enterprise permissions. However, agentic systems introduce additional questions concerning dynamic delegation, autonomous action selection, multi-step execution and the relationship between a policy decision and a downstream effect.

The proposed model builds on these established access-control principles rather than replacing them.

## 2.2 Capability-based security

Capability-based security represents authority through possession of an unforgeable reference or token that grants specified rights over a resource.

Capabilities are relevant to AI agents because they can provide bounded authority without requiring an agent to receive unrestricted credentials for an entire application.

However, the existence of a capability does not automatically prove that every operation performed using it is appropriate. Its scope, validity, delegation rules, revocation semantics and enforcement boundary must be defined.

The proposed model treats capabilities as one possible representation of delegated authority. It additionally requires an explicit relationship between the grant, the requested action and the resulting effect.

## 2.3 Tool-using AI agents and runtime enforcement

Recent research has explored runtime policy enforcement for tool-using agents.

Wang, Zhu and Li (2026) propose a policy enforcement point for MCP-based agents, combining declarative runtime rules, information-flow labels and a SHA-256 hash-chained audit log [1]. Their work demonstrates the value of enforcing policies at the tool-call boundary rather than relying exclusively on model instructions.

This provides an important foundation for the present research. However, the assurance question extends beyond intercepting a tool call. The relationship between the authorized request and the effect produced by a downstream business system must also be evaluated.

## 2.4 Cryptographically verifiable agent authorization

Llambí-Morillas and Fernández-Fernández (2026) propose a preliminary formal abstraction for cryptographically verifiable agent authorization, with candidate security properties and a zero-knowledge proof of concept [2].

It also formalises the structural separation among identity binding, authorization-request binding and runtime execution binding as a central open problem.

The present work builds on that distinction. Its focus is the relationship between the authorization decision and the actual effect in the protected business system, including the limitations of evidence when execution and observation occur in separate components.

## 2.5 Capability delegation and data-flow enforcement

Recent work on purpose-bound capabilities for delegated LLM agent workflows, such as DelegateGuard, derives a root grant from the user's authorization, allows child capabilities only to narrow it, and checks each data-moving action with a reference monitor outside the language model [3].

This illustrates that capability attenuation, policy enforcement and runtime monitoring are active areas of research.

The present study therefore does not claim novelty from the use of capability tokens or delegation constraints alone. It investigates whether the complete relationship between a business grant, a specific action, its authorization and its resulting effect can be established through independently verifiable evidence.

## 2.6 Research gap

The literature establishes that several individual mechanisms are available:

- Identity and credential management.
- Role- and attribute-based access control.
- Capability-based authorization.
- Runtime policy enforcement.
- Cryptographic authorization evidence.
- Tamper-evident audit records.
- Agent security benchmarks.

The remaining research question addressed here is how these mechanisms can be composed into a verifiable execution relationship.

In particular, an authorization record proves that a decision was recorded. A hash chain can reveal certain subsequent alterations to retained records. Neither alone proves that a protected business system executed the exact action represented by that authorization.

The proposed model therefore distinguishes three claims:

1. **Authorization claim:** The action satisfied the applicable authority and policy.
2. **Execution claim:** The protected system performed an operation.
3. **Correspondence claim:** The operation performed corresponds to the action that was authorized.

The third claim is the primary focus of this study.

---

# 3. Problem Definition

## 3.1 System context

We consider an organization that delegates limited business authority to an AI agent.

The agent receives a task and proposes one or more operations against protected resources. A separate authorization mechanism evaluates each consequential operation before it reaches the protected system.

The protected system may be a payment service, CRM, ERP, banking application, customer database or another enterprise service.

The system includes the following logical components:

- Principal and delegation authority.
- Agent identity and credential management.
- Delegation and capability registry.
- Policy decision component.
- Policy enforcement component.
- Action normalization and binding.
- Protected execution service.
- Evidence recording service.
- Independent verification component.

The components may be implemented as separate services or combined within a trusted application boundary.

## 3.2 Entities and definitions

Let the system contain the following entities.

| Symbol  | Entity          | Definition                                                         |
| ------- | --------------- | ------------------------------------------------------------------ |
| \(P\)   | Principal       | Human or organizational authority granting permission              |
| \(A_g\) | Agent           | Autonomous software acting under delegated authority               |
| \(G\)   | Grant           | Explicit representation of delegated authority                     |
| \(D\)   | Delegation      | Transfer or restriction of authority between principals and agents |
| \(S\)   | Scope           | Permitted operations, resources and constraints                    |
| \(\Pi\) | Policy          | Deterministic rules governing authorization                        |
| \(X\)   | Action          | Specific operation requested by an agent                           |
| \(C\)   | Context         | Relevant execution conditions                                      |
| \(E\)   | Effect          | Actual change produced in the protected system                     |
| \(R\)   | Evidence record | Structured record connecting authority, decision and execution     |
| \(V\)   | Verifier        | Independent component evaluating evidence and correspondence       |

### 3.2.1 Principal

A principal is an entity with the authority to grant permissions.

A principal may be an individual, an organization or an organizational role acting under a defined authorization process.

### 3.2.2 Agent

An agent is a software entity capable of generating or initiating operations against protected resources.

An agent may act directly or delegate a permitted subset of its authority to another agent.

### 3.2.3 Grant

A grant represents a bounded authorization from a principal to an agent.

A grant is defined as:

\[
G =
(
id,
P,
A*g,
S,
t*{start},
t*{expiry},
v*{\Pi},
status
)
\]

Where:

- \(id\) is a unique grant identifier.
- \(P\) is the granting principal.
- \(A_g\) is the authorized agent.
- \(S\) is the permitted scope.
- \(t\_{start}\) is the start of validity.
- \(t\_{expiry}\) is the expiration time.
- \(v\_{\Pi}\) identifies the applicable policy version.
- \(status\) represents the grant's lifecycle state.

The grant may also contain restrictions on delegation, transaction value, frequency, resource ownership and approval requirements.

### 3.2.4 Scope

Scope represents the operations and resources an agent is permitted to access.

We define:

\[
S =
(
O,
R_s,
L,
T,
D_s
)
\]

Where:

- \(O\) is the set of permitted operations.
- \(R_s\) is the set of permitted resources.
- \(L\) is the set of quantitative or qualitative limits.
- \(T\) represents temporal constraints.
- \(D_s\) represents delegation restrictions.

For a financial workflow, an example scope could permit payment initiation for approved vendors, with a maximum transaction value of ₹50,000 per transaction and a total daily limit of ₹200,000. These figures are hypothetical and are used for illustration only.

### 3.2.5 Action

An action represents a concrete operation proposed by an agent.

An action is defined as:

\[
X =
(
id,
A_g,
op,
resource,
parameters,
context
)
\]

For example:

\[
X =
(
agent_17,
payment.create,
vendor_42,
amount=40000,
currency=INR
)
\]

The action must be represented in a canonical form before authorization and cryptographic binding.

### 3.2.6 Effect

An effect represents the actual change produced by the protected system.

For example, a payment request may result in:

- A transaction being created.
- A payment being accepted.
- A payment being settled.
- A transaction being rejected.
- No state change.

These states must not be treated as interchangeable.

The effect should therefore be represented using the business system's actual execution semantics.

---

# 4. Threat Model and Assumptions

## 4.1 Threat model

The model considers an environment in which an AI agent may behave incorrectly, receive malicious instructions, be manipulated by untrusted content or generate actions that exceed its delegated authority.

The following threats are considered.

### T1. Out-of-scope action

An agent attempts an operation that is not included in its delegated authority.

### T2. Parameter manipulation

An action is modified after authorization, including changes to transaction amount, destination, account, vendor or resource identifier.

### T3. Expired authority

An agent attempts to use a grant after its validity period.

### T4. Revoked authority

An agent attempts to execute an operation after the relevant grant has been revoked.

### T5. Replay

A previously authorized request is submitted again to cause duplicate execution.

### T6. Delegation escalation

An agent delegates authority beyond the limits of the authority it received.

### T7. Evidence modification

An attacker attempts to alter, delete, reorder or substitute evidence records.

### T8. Execution divergence

The protected system performs an action that differs from the action approved by the authorization component.

### T9. Enforcement bypass

An agent or compromised component attempts to reach the protected system without passing through the required authorization mechanism.

### T10. Context manipulation

An attacker manipulates contextual attributes used in authorization, such as resource ownership, transaction status, time or approval state.

## 4.2 Adversary capabilities

The adversary may:

- Influence the agent through malicious prompts or retrieved content.
- Cause the agent to generate unauthorized actions.
- Modify action parameters before submission.
- Replay previously observed requests.
- Attempt to exploit stale credentials or cached grants.
- Compromise an agent or a subordinate agent.
- Attempt to bypass the designated enforcement boundary.
- Attempt to modify evidence after an event.

The model does not assume that the AI agent is a trusted authorization authority.

## 4.3 Trusted components

The initial model assumes that:

1. The principal's delegation process is authenticated.
2. Grant creation and revocation are protected by appropriate authorization.
3. The authorization mechanism evaluates a defined and versioned policy.
4. Cryptographic keys used by trusted components are appropriately protected.
5. The protected execution system exposes a trustworthy means of confirming execution outcomes.
6. The verifier can obtain the relevant grant, policy and execution evidence.

These assumptions are part of the assurance boundary. They must be tested or explicitly acknowledged in any implementation.

## 4.4 Limitations of the threat model

Cryptographic evidence does not automatically establish that a real-world event occurred.

For example, a signed record generated by an application may prove that the application signed a particular statement. It does not independently prove that the statement accurately reflects an external bank settlement.

Similarly, a hash-chained audit log can make certain modifications detectable, but it cannot prove that an event was never omitted before entering the log.

Accordingly, the strength of the execution claim depends on the trustworthiness of the execution witness, the observation mechanism and the protected system.

---

# 5. Formal Model of Delegated Authority

## 5.1 Authorization function

We define authorization as a deterministic function:

\[
Authorize(G,X,C,t)
\rightarrow
\{ALLOW,DENY\}
\]

Where:

- \(G\) is the applicable grant.
- \(X\) is the requested action.
- \(C\) is the execution context.
- \(t\) is the authorization evaluation time.

The function returns ALLOW only when all mandatory authorization conditions are satisfied.

Formally:

\[
ALLOW \iff
I(G)
\land
T(G,t)
\land
S(G,X)
\land
P(G,X,C)
\land
D(G)
\]

Where:

- \(I(G)\) verifies grant identity, integrity and applicability.
- \(T(G,t)\) verifies temporal validity.
- \(S(G,X)\) verifies that the action falls within scope.
- \(P(G,X,C)\) evaluates applicable policy conditions.
- \(D(G)\) verifies that the grant and its delegation chain remain valid.

If any mandatory condition fails, the result is DENY.

The authorization function must not rely on an LLM-generated judgment that the action is permissible.

## 5.2 Determinism

For a fixed set of canonical inputs, policy version and authorization state, the authorization function must produce the same decision.

\[ Authorize(G,X,C,t,\Pi) = Authorize(G,X,C,t,\Pi) \]

This property is meaningful only when the inputs are stable and their semantics are defined.

The implementation must therefore specify:

- Canonical input serialization.
- Data types and numeric representations.
- Time and validity semantics.
- Policy versioning.
- Resource identity.
- Missing-value handling.
- Error handling.
- Revocation-state evaluation.

An authorization decision must fail closed if a mandatory condition cannot be evaluated.

## 5.3 Scope containment

An action is within scope when all relevant operation, resource and constraint conditions are satisfied.

\[
S(G,X)=
O(X)\in O_G
\land
R(X)\in R_G
\land
L(X)\leq L_G
\]

This is an illustrative simplified expression. Actual scope evaluation may include multiple constraints, resource relationships, transaction limits, approval requirements and business-state conditions.

For a payment action:

\[
amount(X)\leq maxAmount(G)
\]

and:

\[
vendor(X)\in approvedVendors(G)
\]

Both conditions must be satisfied if both restrictions are mandatory.

## 5.4 Temporal validity

A grant is temporally valid when:

\[
t*{start}\leq t < t*{expiry}
\]

The system must define the clock source, time precision, permitted skew and treatment of requests that remain in progress when a grant expires.

A valid authorization decision at time \(t_1\) does not necessarily establish that execution at time \(t_2\) remains authorized.

For high-risk operations, the system may require revalidation immediately before execution.

## 5.5 Revocation

Let \(Revoked(G,t)\) indicate whether a grant has been revoked at the authorization boundary by time \(t\).

Then:

\[
Revoked(G,t)=TRUE
\Rightarrow
Authorize(G,X,C,t)=DENY
\]

The implementation must define how revocation is propagated to enforcement points and how stale or cached grants are handled.

A revocation guarantee cannot be stronger than the consistency and availability of the revocation mechanism.

The paper therefore distinguishes:

- Revocation recorded.
- Revocation observed by the enforcement point.
- Subsequent execution denied.

These are separate events and should be measured separately.

## 5.6 Delegation containment

Suppose agent \(A_1\) delegates authority to agent \(A_2\).

The delegated grant must not expand the authority of the original grant.

Let \(G_1\) represent the parent grant and \(G_2\) the delegated grant.

Then:

\[
Authority(G_2)\subseteq Authority(G_1)
\]

The delegated grant must also preserve relevant restrictions on:

- Expiration.
- Resource access.
- Transaction limits.
- Permitted operations.
- Further delegation.
- Revocation dependencies.

Where the parent grant prohibits onward delegation, no subordinate grant may be created.

---

# 6. Deterministic Authorization Architecture

## 6.1 Architectural overview

The proposed architecture separates agent reasoning from authorization and execution.

The agent is responsible for interpreting a task and proposing an action. A deterministic authorization layer evaluates that action against an explicit grant and policy before the action reaches the protected execution system.

The logical execution path is:

**Principal → Delegation → Agent → Action Proposal → Authorization → Controlled Execution → Evidence → Verification**

The principal and agent do not need to share the same execution environment. The architecture can operate across multiple services, provided the enforcement and evidence boundaries are clearly defined.

## 6.2 Delegation registration

Before an agent can perform consequential operations, a principal or authorized delegation service creates a grant.

The grant must identify:

- The granting principal.
- The receiving agent.
- Permitted operations.
- Permitted resources.
- Quantitative limits.
- Validity period.
- Delegation restrictions.
- Applicable policy version.
- Revocation status.

The grant is stored in an authoritative registry or represented by a verifiable signed object.

The implementation must ensure that the agent cannot modify its own authority.

## 6.3 Action proposal

The agent generates a structured action request.

For example:

```json
{
  "agent_id": "agent_17",
  "action_id": "action_9821",
  "operation": "payment.create",
  "resource": "vendor_42",
  "parameters": {
    "amount": 40000,
    "currency": "INR"
  }
}
```

This example is illustrative.

The action must be converted into a canonical representation before authorization. The canonicalization specification must define field ordering, number representation, string encoding, null handling and other relevant serialization semantics.

## 6.4 Authorization decision

The authorization component retrieves the relevant grant and policy.

It evaluates:

1. Whether the grant is valid.
2. Whether the requesting agent matches the grant.
3. Whether the operation is permitted.
4. Whether the target resource is permitted.
5. Whether the parameters satisfy the limits.
6. Whether the grant remains active.
7. Whether delegation restrictions are satisfied.
8. Whether required contextual and approval conditions are met.

The component produces an ALLOW or DENY decision.

An ALLOW decision must be bound to the exact action that was evaluated.

## 6.5 Execution enforcement

The enforcement component ensures that an action cannot reach the protected execution service without the required authorization evidence.

A critical invariant is:

\[
Executed(X)\Rightarrow
ValidAuthorization(X)
\]

This guarantee depends on complete mediation: all relevant execution paths must pass through the enforcement boundary or be independently protected by the resource.

An architecture that intercepts only one tool interface cannot claim complete mediation if another interface can produce the same protected effect.

The enforcement mechanism must also address time-of-check-to-time-of-use risks.

If an action is checked and subsequently modified before execution, the original authorization cannot be treated as authorization for the modified action.

Where possible, the enforcement layer should pass the exact immutable normalized action that was authorized. Where the downstream system transforms the request, the transformation must be specified and verified.

## 6.6 Execution result

The protected system returns an execution result.

The result should distinguish at least:

- **Accepted:** the system has received the request but has not yet applied it.
- **Rejected:** the system refused the request.
- **Pending:** the operation has started but its outcome is not yet final.
- **Completed:** the system reports the intended state change as final.
- **Failed:** the operation did not produce the intended state change.
- **Reversed:** a completed operation has since been undone by a defined process.
- **Unknown:** the enforcement point cannot determine the outcome.

For a financial transaction, Accepted and Completed are distinct states. A payment accepted for processing has not necessarily settled. An authorization decision establishes that the request was permitted. It does not establish which of these states the business system eventually reached.

The result must be bound to the action identifier of the request it answers. A result that cannot be bound to a specific authorized action is recorded as Unknown, not as success.

Unknown is a first-class outcome. An implementation that maps timeouts or missing responses to Failed or Completed, without evidence, overstates what is known about the effect.

## 6.7 Authorization-to-action binding

The authorization decision must be bound to the exact action it evaluated. We propose the following binding.

Let \(h_X = H(canon(X))\) be a cryptographic digest of the canonical form of action \(X\), where \(H\) is a collision-resistant hash function and \(canon\) is the canonicalization function defined in section 6.3.

On a decision of ALLOW, the authorization component issues an authorization token:

\[
A =
Sign*{k}(
id_G,
h_X,
v*{\Pi},
decision,
t\_{auth},
n
)
\]

Where:

- \(k\) is the signing key of the authorization component.
- \(id_G\) identifies the grant evaluated.
- \(v\_{\Pi}\) identifies the policy version evaluated.
- \(t\_{auth}\) is the time of the decision.
- \(n\) is a single-use nonce.

The execution enforcement point releases an action only if:

1. The signature on \(A\) verifies under a trusted key.
2. The digest of the action about to be executed equals \(h_X\) in \(A\).
3. The nonce \(n\) has not been used before.
4. The execution time is within the validity window defined by policy.

Requirement 2 addresses parameter manipulation after authorization (threat T2). Requirement 3 addresses replay (threat T5). Requirement 4 limits the window in which an authorization can be used.

The binding is only as strong as the enforcement point's guarantee that the action it executes is the action whose digest it checked. Where the downstream system transforms the request, the transformation must be fixed in the policy and verified. Otherwise the binding protects only the stage before transformation.

## 6.8 Evidence record

For each release, the system produces an evidence record:

\[
R*i =
(
A,
h_X,
result,
t*{exec},
receipt,
h\_{i-1},
\sigma_i
)
\]

Where:

- \(A\) is the authorization token from section 6.7.
- \(result\) is the execution result from section 6.6.
- \(t\_{exec}\) is the time of execution.
- \(receipt\) is a reference to any receipt issued by the protected system, or a null value.
- \(h\_{i-1}\) is the hash of the previous record in the append-only log.
- \(\sigma_i\) is a signature over the record by the evidence component.

The hash chaining makes certain alterations detectable, including modification of a record and reordering of records. It does not detect omission of a record before it enters the chain (section 4.4). Omission must therefore be addressed by an independent commitment, such as a periodic publication of the chain head to a party that does not operate the log.

Records must not contain credentials, personal data beyond what is necessary, or the agent's internal reasoning. Retention periods and minimisation are policy decisions and are outside the scope of this model.

## 6.9 Effect witness and correspondence

A record shows what was authorized and what the system reported. The correspondence claim requires an additional witness of the effect.

We distinguish three sources of effect evidence:

1. **Protected-system receipt:** a signed statement by the protected system that it applied a specific action with specific parameters.
2. **Independent observation:** a read of the resulting state by a component that does not operate the enforcement point.
3. **None:** no effect evidence is available.

Let \(W\) be a witness of the effect, and let \(X*{c}\) be the canonical action whose digest is \(h_X\). The enforcement component retains \(X*{c}\) or a commitment to it, so that the verifier can compare parameters. The correspondence predicate holds when the parameters of the witnessed effect equal those of \(X\_{c}\):

\[
Corr(R, W) = TRUE
\iff
params(W) = params(X\_{c})
\]

For each record, the verifier assigns one of four outcomes:

- **Verified:** a witness exists and the correspondence predicate holds.
- **Divergent:** a witness exists and the correspondence predicate does not hold.
- **Unverified:** the record exists, but no witness is available.
- **Unknown:** the witness cannot be obtained or its validity cannot be established.

Only a Verified outcome supports the correspondence claim. An Unverified outcome must be reported as such, and must not be presented as correspondence.

A witness obtained from the same component that produced the record provides weaker assurance than one obtained from an independent source. The verifier must record which source was used.

## 6.10 Verification procedure

An independent verifier evaluates a record without trusting the runtime or database that produced it. The procedure is:

1. Verify the signature on the authorization token under a trusted key.
2. Verify the signature on the evidence record and the hash chain up to the published head.
3. Confirm that the grant and policy version in the token existed and were valid at \(t\_{auth}\).
4. Confirm that the nonce appears once in the chain.
5. Obtain the witness, if any, and evaluate the correspondence predicate.
6. Output the verdict, with the claim it supports and the claim it does not.

The verdict must state its scope. For example: "The action was authorized under policy version v3 and executed once; the effect was verified against a receipt from the protected system; the policy's correctness is not established by this verdict."

The verifier does not establish that the signing key belongs to a particular organisation. That requires a separate trust-establishment process, which is outside the model.

# 7. Proposed Evaluation

**Status.** The criteria and thresholds in this section are proposals by the drafting author. They are not agreed targets. The authors must review and adopt them before any data are collected, and any change after data collection must be reported.

This section describes an evaluation that has been designed but not run. No results are reported. The criteria below are stated in advance so that they cannot be adjusted after the data are collected.

## 7.1 Objectives

The evaluation tests whether the model achieves the three claims in section 2.6: authorization, execution and correspondence. It also tests whether the model's guarantees hold under the threats in section 4.

## 7.2 Test environment

We propose a controlled environment with:

- A simulated payment service and a simulated customer-record service, with defined state transitions.
- An agent driven by a fixed set of tasks, some benign and some designed to produce unauthorised actions.
- A policy with explicit amount limits, approved-payee lists and approval thresholds.
- A protected execution system that issues signed receipts, and a separate observer that reads state.

Test traces and seeds will be published so that results can be reproduced.

## 7.3 Scenarios

Each threat in section 4.1 is mapped to one or more test scenarios:

| Threat                    | Scenario                                                   | Primary measure                              |
| ------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| T1 Out-of-scope action    | Request outside the grant's operations and resources       | False allow rate                             |
| T2 Parameter manipulation | Modify the amount or payee after authorization             | Divergence detection rate                    |
| T3 Expired authority      | Use a grant after expiry, and during a request in progress | False allow rate                             |
| T4 Revoked authority      | Use a grant after revocation, with cached state            | Revocation latency; false allow rate         |
| T5 Replay                 | Resubmit a previously released action                      | Duplicate execution count                    |
| T6 Delegation escalation  | Child grant exceeding parent authority                     | Rejection rate                               |
| T7 Evidence modification  | Alter, reorder or delete records                           | Detection rate, by modification type         |
| T8 Execution divergence   | Protected system applies different parameters              | Divergence detection rate                    |
| T9 Enforcement bypass     | Route a request around the gateway                         | Proportion of bypasses that reach the system |
| T10 Context manipulation  | Alter ownership, status or approval fields                 | False allow rate                             |

## 7.4 Baselines

To show what each component contributes, the evaluation compares the full model against four baselines:

1. **Prompt-only:** the policy is stated in the agent's instructions.
2. **Permission-only:** the agent holds scoped API credentials, with no per-action check.
3. **Policy without binding:** a policy engine evaluates requests, but the release is not bound to the evaluated action's digest.
4. **Full model:** the complete authorization, binding and verification design.

## 7.5 Metrics and criteria

The following criteria are set in advance:

- **False allow rate:** the proportion of unauthorised actions that are executed. The full model should be zero for scenarios where the policy is enforced at the gateway.
- **False deny rate:** the proportion of authorised actions that are refused. This should be reported, not minimised at the cost of safety.
- **Divergence detection rate:** the proportion of executions whose effect differs from the authorised action that the verifier labels Divergent.
- **Tamper detection rate:** the proportion of evidence modifications detected, by type.
- **Revocation latency:** the time between revocation and the first denied request.
- **Overhead:** the per-decision latency of authorization and verification.

Negative results must be reported with the same prominence as positive ones.

## 7.6 Reproducibility

Each run records its seed, policy version, scenario identifier and software version. Traces, evidence records and verifier outputs will be published alongside the paper.

# 8. Discussion and Limitations

## 8.1 Complete mediation

The model's strongest claim depends on complete mediation. An agent that reaches a protected system through a path that does not pass the enforcement point is outside the model's guarantees. The model can state this limitation, but it cannot remove it. Assurance requires that the protected resource itself accepts only authorised requests, or that all routes are mediated.

## 8.2 Time of check and time of use

The binding in section 6.7 protects the action from the point of authorization to the point of release. It does not protect the state of the protected system between the two. A payee may be removed from an approved list, or a balance may change, after authorization. Such conditions must be rechecked where they are material.

## 8.3 Revocation consistency

Revocation can be guaranteed only up to the consistency of the revocation mechanism. A revocation recorded at the authority registry but not yet observed by an enforcement point is a window of exposure. Section 5.5 separates these events so that the window can be measured.

## 8.4 Witness trust

The correspondence claim is only as strong as the witness. A receipt from the protected system relies on that system's integrity. An observer relies on its own access and on the state it reads. The verifier reports the witness source so that these dependencies are visible.

## 8.5 Policy correctness

The model establishes that an action satisfied a policy. It does not establish that the policy was correct, lawful or appropriate. Those questions belong to governance and legal review, and the verdict must say so.

## 8.6 Privacy

Evidence records can contain personal data. The model requires minimisation, but it does not specify how records should be protected across organisations or how long they should be kept. These are open questions.

## 8.7 Multi-organisation delegation

The model has been described for delegation within one organisation. Delegation across organisations introduces different trust roots, legal terms and revocation dependencies. Extending the model to that setting is future work.

## 8.8 Performance

The overhead of authorization, binding and verification has not been measured. Section 7.5 proposes to measure it. Claims about latency should not be made until the measurements are available.

# 9. Conclusion

This paper has proposed a deterministic authorization model that connects delegated business authority to the effect produced by a protected system. The model separates the authorization claim, the execution claim and the correspondence claim, and it treats correspondence as the central problem.

The contribution is the composition of these elements: explicit grants, deterministic evaluation, a binding between the authorized action and the released action, an evidence record, and a verification procedure that reports what it does and does not establish.

The proposed evaluation tests the model against the threats in section 4. Until it has been run, the model's guarantees are design claims, not empirical findings. We have stated the criteria in advance so that the evaluation can show the model to be wrong as well as right.

## References

[1] S. Wang, S. Zhu, and R. Li, "Runtime policy enforcement for MCP-based LLM agents," _Electronics_, 2026, doi: 10.3390/electronics15132829.

[2] M. Llambí-Morillas and D. Fernández-Fernández, "Cryptographically verifiable authorization for autonomous AI agents: A falsifiable hypothesis and proof of concept," arXiv:2607.21325, Jul. 2026.

[3] P. T. Tran-Truong, H. Vo, N. Tran, K. Vo, and T.-M. Truong, "DelegateGuard: Purpose-bound capabilities for delegated LLM agent workflows," arXiv:2610.16005, Oct. 2026.

---

_Research draft v0.1. Sections 6.6 to 9 are proposed design. No experimental results are reported._
