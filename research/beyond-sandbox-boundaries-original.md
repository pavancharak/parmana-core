# Beyond Sandbox Boundaries: Deterministic Authorization and Cryptographic Proof of AI Agent Execution

_An Execution-Boundary Architecture for Enforcing Delegated Business Authority in Autonomous Systems_

**Research affiliation:** Parmana Systems Private Limited
**Research status:** Proposed architecture and experimental research. Empirical results pending.

> **Note:** This is the original draft, kept for reference. It predates the revisions in `research/beyond-sandbox-boundaries.md`, which should be used for review. In particular, the "Siren research" citation in §1 could not be verified and was removed in the revision. Do not cite it.

---

## Abstract

Autonomous AI agents increasingly interact with enterprise applications, financial infrastructure, APIs and other business systems. These agents operate with delegated permissions and are expected to perform actions within the authority granted by their principals. However, existing approaches to agent safety frequently rely on model instructions, sandbox isolation, tool-level permissions and behavioral safeguards. These mechanisms address important security concerns but do not independently establish that every externally observable business action is authorized by the principal.

Recent research into sandbox escape demonstrates that increasingly capable agents may discover and use resources outside their intended execution environments. More importantly, research into authorization alignment demonstrates that task completion and authorization compliance are distinct properties.

This paper proposes a deterministic execution-boundary architecture for enforcing delegated business authority independently of an AI agent's reasoning process. The architecture separates action proposal from authorization and execution. Each proposed action is evaluated against an explicit delegation grant, principal identity, agent identity, resource scope, operation constraints, policy version and validity conditions.

The proposed protocol further binds the authorization decision to canonical transaction data and the resulting business-system effect through cryptographic evidence. This enables independent verification of the relationship between delegated authority, authorization decisions and recorded execution outcomes.

We define a formal authorization model, identify security invariants, develop an execution-boundary threat model and propose an experimental benchmark for evaluating authorization violations under adversarial and non-adversarial task pressure.

The objective is to establish whether deterministic authorization and cryptographically verifiable execution can provide stronger business authority enforcement than approaches relying primarily on agent behavior or environmental restrictions.

**Keywords:** AI agents, delegated authority, deterministic authorization, execution integrity, cryptographic evidence, capability security, enterprise security, autonomous systems.

---

## 1. Introduction

AI agents are transitioning from systems that generate recommendations to systems that execute actions on behalf of individuals and organizations.

An enterprise agent may initiate payments, modify customer records, approve refunds, update vendor information or interact with external services. These capabilities introduce a fundamental distinction between the ability to perform an operation and the authority to perform that operation.

A system may technically permit an agent to execute a transaction without the transaction being within the authority delegated by the business.

Traditional security mechanisms address portions of this problem through identity management, access control, sandboxing and policy enforcement. However, agentic systems introduce additional complexity because the agent dynamically determines actions, sequences operations and may interact with tools and delegated agents.

Anthropic's Siren research, published on November 24, 2026, examines how agents behave when they encounter weaknesses in sandbox environments. Its findings demonstrate the importance of distinguishing between reaching outside a boundary, using resources outside that boundary and using them in ways that cannot reasonably be authorized.

This research motivates a broader question:

> Can an enterprise guarantee that an AI agent's business actions remain within delegated authority even when the agent attempts to exceed its permissions?

This paper addresses that question through an independent deterministic authorization boundary.

### 1.1 Problem statement

The central problem is the absence of a guaranteed relationship between an agent's proposed action, the authority delegated by its principal and the resulting business-system effect.

A successful task does not necessarily represent an authorized task.

Likewise, a valid identity does not establish that every operation performed using that identity is legitimate.

Authorization must therefore be evaluated against the specific action being executed rather than inferred from the agent's identity, instructions or task objective.

### 1.2 Research objectives

This research has five objectives:

1. Define a formal model of delegated authority for AI agents.
2. Develop a deterministic authorization mechanism independent of model reasoning.
3. Bind authorization decisions to canonical execution requests.
4. Establish cryptographic evidence linking authorization to business-system effects.
5. Develop an experimental methodology for evaluating enforcement effectiveness and performance.

## 2. Research Questions

RQ1: Can deterministic authorization independently enforce delegated business authority at the execution boundary?

RQ2: Can cryptographic binding prevent unauthorized modifications between authorization and execution?

RQ3: How effectively can the architecture prevent replay, expiration, revocation and delegation amplification?

RQ4: Can execution evidence support independent verification of authorization decisions and resulting effects?

RQ5: What performance and operational costs are introduced by deterministic enforcement?

## 3. System Model

The proposed system contains the following entities:

- **Principal:** The individual or organization delegating authority.
- **Agent:** The autonomous system proposing an action.
- **Delegation Grant:** The explicit authority assigned to the agent.
- **Policy:** The deterministic rules defining permitted operations.
- **Authorization Engine:** The component evaluating whether an action is permitted.
- **Execution Boundary:** The enforcement component controlling access to the protected business system.
- **Evidence Ledger:** The append-only record of authorization and execution events.
- **Verifier:** An independent component validating the integrity and relationships of recorded evidence.

The agent is treated as an untrusted action proposer. Its generated reasoning is not accepted as proof of authorization.

## 4. Formal Authorization Model

Let an execution request be represented as:

X = (P, G, A, O, R, C, T)

Where:

P represents the principal, G the delegation grant, A the agent identity, O the operation, R the target resource, C the execution constraints and T the validity conditions.

The authorization function is:

D(X) = PolicyEvaluation(X)

The decision belongs to:

D ∈ {ALLOW, DENY, REQUIRE_APPROVAL}

Execution is permitted only when the decision is ALLOW and the decision remains valid for the exact canonical request being executed.

The principal security invariant is:

Execution(X) implies ValidGrant(X) AND Authorized(X) AND RequestIntegrity(X).

A change to any authorization-relevant request field invalidates the previous decision and requires reevaluation.

## 5. Threat Model

The architecture considers the following threats:

- Prompt injection attempting to expand delegated authority.
- Task completion pressure encouraging unauthorized actions.
- Transaction modification after authorization.
- Credential misuse and privilege escalation.
- Replay of previously authorized requests.
- Use of expired or revoked grants.
- Unauthorized delegation to subordinate agents.
- Alternative tool paths bypassing the intended authorization boundary.
- Inconsistent evidence between authorization and actual execution.

The architecture assumes that the protected execution boundary and its cryptographic trust roots are correctly implemented. Compromise of these trusted components is considered separately.

## 6. Proposed Architecture

The architecture separates action generation, authorization, execution and verification.

An agent submits a proposed transaction to the authorization boundary. The request is normalized into a canonical representation. The authorization engine evaluates the request against the active grant and policy.

An approved decision is cryptographically associated with the exact request and relevant authorization context.

The execution component validates this association before allowing the protected business operation.

The resulting execution receipt is incorporated into the evidence record.

The verifier independently validates the integrity of the authorization and execution relationship.

## 7. Cryptographic Evidence Model

The evidence structure associates:

- Principal identity.
- Agent identity.
- Delegation grant identifier.
- Grant version.
- Policy version.
- Canonical request hash.
- Authorization decision.
- Authorization timestamp or trusted sequence information.
- Execution identifier.
- Business-system effect receipt.
- Cryptographic signatures and integrity-chain references.

A proposed evidence commitment is:

E = H(P || G || Policy || Request || Decision || Effect)

Where H represents a cryptographic hash over a rigorously specified canonical serialization.

The implementation must define domain separation, signature verification, key management, event ordering and trusted evidence sources.

A hash chain alone does not establish that a recorded business effect actually occurred. Independent verification therefore requires trusted evidence from the execution system.

## 8. Experimental Evaluation

The proposed evaluation will compare model-level instructions, sandbox restrictions, conventional access control, capability-based authorization and the proposed execution-boundary architecture.

Scenarios will include banking payments, refund processing, vendor management, API execution and multi-agent delegation.

Measurements will include unauthorized execution rate, legitimate task completion, false rejection rate, authorization latency, execution overhead, revocation effectiveness and evidence verification success.

Experiments will include matched authorized and unauthorized transactions, adversarial modifications, replay attempts and repeated execution trials.

All benchmark scenarios, policies, oracle decisions and experimental configurations will be versioned to support reproducibility.

## 9. Security Properties

The architecture aims to establish the following properties:

- **Authorization completeness:** Every protected effect passes through the enforcement boundary.
- **Request binding:** Authorization applies only to the exact canonical request evaluated.
- **Delegation attenuation:** A subordinate agent cannot acquire more authority than its delegator.
- **Revocation enforcement:** Revoked authority cannot authorize new protected execution.
- **Replay resistance:** Previously authorized requests cannot be reused outside their permitted execution conditions.
- **Evidence integrity:** Recorded authorization and execution evidence can be independently checked for cryptographic integrity.

These properties require explicit assumptions and formal or experimental verification. They should not be treated as proven solely by the proposed architecture.

## 10. Limitations

The proposed system cannot guarantee correctness when protected business operations bypass the enforcement boundary.

Cryptographic integrity does not independently establish the truth of external execution receipts.

Policy correctness, identity assurance, key security, transaction atomicity and distributed-system failure handling remain important implementation concerns.

The architecture also does not eliminate malicious model behavior, sandbox vulnerabilities or prompt injection. It seeks to constrain the business effects those behaviors can produce.

## 11. Conclusion

As AI agents acquire greater operational autonomy, enterprise security must distinguish between technical capability and delegated business authority.

An agent's ability to reach a resource or execute a tool call does not establish that the resulting action is authorized.

This paper proposes an execution-boundary architecture in which authorization is evaluated independently of agent reasoning, bound to canonical transaction data and associated with verifiable execution evidence.

The proposed direction shifts the security objective from relying on agents to behave within their permissions toward enforcing those permissions at the point where business effects occur.

The ultimate objective is to make delegated authority an enforceable and independently verifiable property of autonomous business execution.

---

**Research affiliation:** Parmana Systems Private Limited
**Research status:** Architecture proposal. Experimental validation, formal proofs and comparative measurements remain to be completed.
