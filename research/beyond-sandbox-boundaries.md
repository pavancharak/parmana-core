# Beyond Sandbox Boundaries: Verifiable Binding of Authorization Decisions to AI Agent Business Effects

*An Execution-Boundary Architecture for Binding Delegated Business Authority to Recorded Effects in Autonomous Systems*

**Research affiliation:** Parmana Systems Private Limited
**Research status:** Proposed architecture. Experimental results pending. No formal proofs or comparative measurements are reported in this version.

> **Revision note (remove before submission):** This revision applies the review of the previous draft. Changes are: consistent notation; two-stage commitments; length-prefixed encoding with domain separation; explicit approval state; nonce-based replay control; revocation epochs with a stated residual window; a subsumption definition for attenuation; a trusted-components section; a related-work placeholder; and a single affiliation block. Items marked **[TODO]** need a source or a decision from the authors.

---

## Abstract

Autonomous AI agents increasingly act on enterprise applications, financial infrastructure, APIs and other business systems under delegated permissions. Existing safeguards for such agents rely on model instructions, sandbox isolation, tool-level permissions and behavioral controls. These mechanisms are important, but none of them independently establishes that every externally observable business effect is authorized by the principal.

Pre-action authorization at the tool boundary has recently been demonstrated by several systems. These systems enforce policy before a call executes, but they do not, on their own, let a third party verify which decision authorized which business effect. We address that gap with an execution-boundary architecture. The architecture separates action proposal from authorization and from execution. Each proposed action is normalized into a canonical request and evaluated against an explicit delegation grant, principal identity, agent identity, resource scope, operation constraints, policy version and validity conditions. The execution boundary permits a protected operation only when it can verify, at the moment of execution, an authorization bound to that exact canonical request and not yet consumed.

The protocol binds the authorization decision to the canonical request and, after execution, to the resulting business-system effect through two linked cryptographic commitments. This is the contribution of the paper: an independent verifier can check that a recorded business effect corresponds to exactly the request that a specific decision authorized, and that the decision was valid when it was executed.

We define a formal authorization model, state security invariants, develop an execution-boundary threat model and specify an experimental benchmark for measuring authorization violations under adversarial and non-adversarial task pressure. The objective is to establish whether a verifiable binding between authorization decisions and business effects can be enforced at the execution boundary, and at what cost, relative to pre-action enforcement alone and to approaches that rely primarily on agent behavior or environmental restrictions.

**Keywords:** AI agents, delegated authority, pre-action authorization, execution integrity, cryptographic evidence, verifiable effects, capability security, enterprise security, autonomous systems.

---

## 1. Introduction

AI agents are moving from generating recommendations to executing actions on behalf of individuals and organizations. An enterprise agent may initiate payments, modify customer records, approve refunds, update vendor information or call external services. These capabilities separate two things that are often conflated: the *ability* to perform an operation and the *authority* to perform it.

A system may technically permit an agent to execute a transaction that the business never delegated to it. Identity management, access control, sandboxing and policy enforcement each address part of this problem. Agentic systems add complexity because the agent chooses actions dynamically, sequences operations and may invoke tools and subordinate agents.

Anthropic reports that Claude models have "helpfully" escaped a sandbox in order to complete a task [Anthropic, "How we contain Claude across products," May 25, 2026, https://www.anthropic.com/engineering/how-we-contain-claude] [verified against the primary page]. The paper does not rely on a separate named study. The relevant distinction for this paper is between (a) reaching outside a boundary, (b) using resources outside that boundary and (c) using them in ways that cannot reasonably be authorized by the principal. Our concern is primarily (c), which sandboxing alone does not address.

This motivates the central question:

> Can an enterprise guarantee that an AI agent's business effects remain within delegated authority even when the agent attempts to exceed its permissions?

Pre-action authorization at the tool boundary is now demonstrated by several recent systems, and those systems address the first part of that question: whether an action is permitted before it runs. They leave a narrower question open. Can a third party verify that each business effect was produced by exactly the request that a valid decision authorized, and that the decision was still valid when the effect occurred?

This paper addresses that narrower question. It proposes an execution boundary that binds each authorization decision to one canonical request, consumes that decision once at execution, and records the resulting effect against it. Section 2.1 compares the proposal with the closest systems.

### 1.1 Problem statement

The central problem is the absence of a guaranteed relationship between three things: an agent's proposed action, the authority its principal delegated, and the resulting business-system effect.

- A successful task does not establish an authorized task.
- A valid identity does not establish that every operation performed under that identity is legitimate.
- Authorization must therefore be evaluated against the specific canonical request being executed, not inferred from the agent's identity, instructions or task objective.

### 1.2 Research objectives

1. Define a formal model of delegated authority for AI agents.
2. Specify a pre-action authorization mechanism, independent of model reasoning, whose decisions apply to a single canonical request.
3. Bind authorization decisions to canonical execution requests, with single-use execution.
4. Define cryptographic evidence that lets an independent verifier link each business-system effect to the one authorization decision that permitted it.
5. Specify an experimental methodology for evaluating enforcement effectiveness and performance.

### 1.3 Contributions of this version

- A request model and decision model that include an explicit approval state and nonce-based single-use execution.
- A two-stage evidence commitment that can be computed before execution and linked to a post-execution effect receipt.
- A subsumption definition of delegation attenuation that can be checked mechanically.
- A residual-window statement for revocation, rather than an unqualified guarantee.

---

## 2. Research Questions

- **RQ1 (baseline):** Does pre-action authorization at the execution boundary reduce unauthorized business effects relative to model instructions and sandboxing, under matched conditions? Prior systems address this partly, so the question is answered here as a reproduction on common benchmarks rather than as the paper's contribution.
- **RQ2:** Can request-level cryptographic binding with single-use nonces detect or prevent any modification of a request between authorization and execution that pre-action enforcement without binding would allow?
- **RQ3:** How effectively do nonce consumption, revocation epochs and expiry prevent replay and the use of revoked or expired authority, and what residual window remains after revocation?
- **RQ4 (central):** Given only the evidence ledger and the execution system's receipts, can an independent verifier confirm that each recorded business effect corresponds to exactly one authorization decision that was valid at execution, and under what trust assumptions about the receipt source?
- **RQ5:** What latency, throughput and operational costs does the binding and evidence layer add on top of pre-action enforcement alone?

### 2.1 Related work

> **Note (remove before submission):** The citations below are checked against sources, and each is marked [verified]. Re-check the AP2 and OPA versions on the submission date, and re-read the §2.1.9 papers in their final arXiv versions.

This section compares the proposed architecture with prior work in several families. For each we state what it establishes, what it does not establish, and how the present proposal differs. The comparison is about enforcement point and evidence, not about whether each family is useful; several are complementary to the proposal and could be used inside it.

### 2.1.1 Capability-based security and object-capability systems

Capability systems treat authority as an unforgeable reference that carries the right to perform an operation, rather than deriving authority from the identity of the caller [Dennis and Van Horn, 1966] [verified]. Object-capability designs extend this to composition: a holder can delegate a reference, and authority flows only along explicit reference-passing paths [Miller, 2006, PhD thesis] [verified].

*What it establishes:* authority is explicit, cannot be ambient, and can be narrowed by construction when a reference is handed on.

*What it does not establish:* capability systems govern which references exist, not whether a particular request built from a reference fits the business terms under which it was delegated. Nor do they, by themselves, produce evidence that binds a decision to an observed effect. A capability granted to an agent is still usable for any operation the capability's target accepts.

*Relation to this work:* the delegation attenuation relation in §4.6 borrows the intuition that a derived grant cannot exceed its parent. The proposal adds request-level binding (the canonical hash h_X), which capabilities at the reference level do not provide.

### 2.1.2 Attenuable bearer credentials (Macaroons)

Macaroons are bearer tokens to which holders can add caveats that restrict use, while anyone can verify the chain with a shared root key [Birgisson et al., NDSS 2014] [verified]. Caveats are checked by the verifying service, which makes attenuation possible without contacting the issuer.

*What it establishes:* offline attenuation of a credential, with verifiable chaining back to a root key.

*What it does not establish:* caveats are predicates evaluated against the request at the service, and the mechanism has no notion of a canonical request hash, an approval state, or a receipt recording the business effect. A holder of a bearer token can also present it for a different request than the one a human approved unless the service enforces request binding separately.

*Relation to this work:* the subsumption relation in §4.6 is a fixed, checkable form of caveat attenuation. The proposal requires that every token be bound to one canonical request, which removes the freedom that bearer caveats leave to the holder.

### 2.1.3 Policy engines and decision languages

Policy-as-code systems separate policy from enforcement. Open Policy Agent with the Rego language evaluates structured input against policies [Open Policy Agent, Policy Language documentation] [verified]. Cedar is a policy language designed for authorization with a formal semantics and analysis tools, with its design and evaluation reported by Amazon Web Services [Cedar, OOPSLA 2024, DOI 10.1145/3649835; arXiv:2403.04651] [verified]. The language was modeled in Lean and its properties proved there, and it is the policy language behind Amazon Verified Permissions.

*What it establishes:* deterministic, testable, and sometimes formally analyzable decisions over an explicit request model; separation of policy from application code.

*What it does not establish:* a policy engine decides; it does not enforce. Whether the decision reaches the protected operation, and whether the operation's effect is recorded against that decision, is left to the surrounding system. The proposal's execution boundary is the component that supplies this enforcement and the evidence chain.

*Relation to this work:* the decision function D(X) in §4.2 could be implemented with a policy language such as Cedar or Rego. The contribution here is not the evaluation language but the binding of its decisions to a single request, a nonce, and a receipt.

### 2.1.4 Scoped delegated tokens and fine-grained API authorization

OAuth 2.0 issues access tokens with scopes that a resource server checks [RFC 6749] [verified]. Rich Authorization Requests extend scopes to structured authorization details, carried in an `authorization_details` parameter as a JSON array of typed objects [RFC 9396, May 2023, Lodderstedt, Richer and Campbell] [verified].

*What it establishes:* a standard way for a principal to delegate bounded access to a client, with structured detail in the richer form.

*What it does not establish:* the token authorizes a class of requests, not one canonical request. A client holding a valid token can issue any request within the structured detail, and the token does not record the effect of each request. Revocation is typically handled by expiry or introspection, without the epoch-and-residual-window statement in §4.5.

*Relation to this work:* structured authorization details are a natural encoding for the grant G in §4.1. The proposal adds per-request binding and execution-time verification on top.

### 2.1.5 Signed mandates and transaction-level intent for agent payments

Google's Agent Payments Protocol (AP2) attaches signed mandates to agent-initiated purchases so that a merchant or processor can check the user's authorization [AP2 specification v0.2, ap2-protocol.org] [verified]. The v0.2 specification defines Checkout and Payment Mandates. Each is validated against a user credential or a trust list of agent providers, carries constraints that the verifier checks against the user's intent, and carries an expiry. Earlier coverage used "Intent" and "Cart" mandate terms; the v0.2 specification should be followed over that coverage. These approaches are closest in spirit to the present work because they bind an authorization artifact to a transaction.

*What it establishes:* transaction-level evidence that a user signed an intent, which the counterparty can check.

*What it does not establish:* the proposal is not, to our knowledge, specified as an enforcement point inside the principal's own systems, and it is not designed to show that the business system executed the transaction with the same canonical content. Scope beyond payments and the verification of the resulting effect in the enforcing system are not addressed. We treat these proposals as the nearest neighbors and will compare explicitly once the specifications are checked.

*Relation to this work:* the proposal generalizes transaction intent to arbitrary business operations and adds the post-execution effect commitment E_effect (§6).

### 2.1.6 Prompt-injection and control-flow defenses for LLM agents

Several recent systems constrain what an LLM agent can do after it is exposed to untrusted data. CaMeL separates a privileged planner from an unprivileged interpreter and enforces data-flow policies over untrusted values [Debenedetti et al., arXiv:2503.18813, 2025] [verified]. On AgentDojo, the paper reports solving 77% of tasks with provable security, against 84% for an undefended system. Other work uses tool-permission prompts, action classifiers, or sandboxed execution of tool calls.

*What it establishes:* these approaches reduce the set of actions an injected instruction can cause, and some give formal guarantees over a defined data-flow model.

*What it does not establish:* they are designed around the agent's own control flow and tool layer. An action path that bypasses the tool layer, or a permission granted at the tool level, is outside their guarantee. They also do not produce an independently verifiable record of authorization linked to the effect.

*Relation to this work:* the proposal is complementary. Control-flow defenses reduce the proposals an agent generates; the execution boundary does not depend on them and holds even if they fail. The threat model in §5 includes prompt injection precisely because it is the attack these systems target.

### 2.1.7 Sandboxing and environmental restriction

Sandboxes, containers, and network egress controls restrict where an agent can reach and what resources it can touch. Their security depends on the correctness of the isolation mechanism and on the completeness of the restriction policy.

*What it establishes:* a reduction in the reachable surface, and protection against a class of unintended resource use.

*What it does not establish:* whether a permitted action is authorized by the principal. An action inside the sandbox can still be unauthorized, which is the case §1 addresses. Sandboxes are not evaluated here as an alternative to the proposal, but as a layer it sits beneath.

### 2.1.8 Tamper-evident logs and transparency

Append-only logs with Merkle-tree inclusion and consistency proofs are used in certificate transparency. RFC 6962 defined the protocol as experimental; it has since been obsoleted by RFC 9162 [RFC 9162, Certificate Transparency Version 2.0] [verified]. Logs are append-only Merkle hash trees, and submitters receive signed timestamps as proof of logging. These structures let an auditor verify that a log is append-only and that a given entry is included.

*What it establishes:* the evidence ledger in §3 can be made tamper-evident and auditable with known techniques.

*What it does not establish:* that the logged events are true. A log records what was submitted; it does not verify that the business system performed the effect. This is the limitation stated in §10, and it is why E_effect must come from the execution system under a stated trust assumption.

### 2.1.9 Runtime authorization for tool-using agents

Three recent systems place a deterministic enforcement point between an agent and its tools. They are the closest prior work to the proposal. Their claims below are taken from the full text of each arXiv version, and each paper's "does not establish" statement reports what the full text contains.

**Before the Tool Call (OAP).** Uchibeke proposes the Open Agent Passport, a specification and reference implementation that intercepts each tool call synchronously before execution, evaluates it against a declarative policy, and produces a cryptographically signed decision record [Uchibeke, arXiv:2603.20953, March 2026] [verified: author, ID, date, mechanism]. Decisions are signed with Ed25519 and recorded in a hash-chained, write-once audit trail, and the system fails closed when the authorization service is unavailable. The paper reports a median enforcement latency of 53 ms (N=1,000). In an adversarial testbed of 4,437 decisions across 1,151 sessions, social engineering succeeded 74.6% of the time under a permissive policy and 0% of the time across 879 attempts under a restrictive policy [verified against the full text; these are the author's testbed results, from one policy pair, and should be cited as such].

*What it establishes:* pre-action, policy-based enforcement with a signed decision record and a tamper-evident audit trail, at a latency the paper reports as practical.

*What it does not establish:* the full text describes signed decisions and a hash chain over audit records. We did not find a statement that a signed decision is bound to the canonical hash of one request, that execution verifies such a binding, or that the signed decision is single-use. The `canonical_hash` field in the paper's example is the hash of a passport, not of a request. The paper also names limits that the proposal shares: it does not defend against a compromised framework runtime, where the hook itself must be trusted, and it does not evaluate content-level attacks. The record of a permitted action is a signed receipt in its flow figure; the text does not describe a commitment to the business-system effect.

*Relation to this work:* OAP is the closest prior work on the decision side. The proposal's distinct elements, if the full specification confirms the gaps above, are request-level binding with nonce-based single-use execution, revocation epochs with a residual window, and the two-stage commitment E_auth and E_effect (§6). The paper should be read in full before submission, and the comparison restated against its final specification.

**Formal Policy Enforcement for Agentic Systems (PCAS / FORGE).** Palumbo, Choudhary, Choi, Amir, Chalasani, Dillig and Jha propose a runtime monitor that enforces declarative policies written in Datalog over event graphs of system state and history. When an agent is about to execute an action, the monitor decides whether the action would violate the policy, and blocks or permits it accordingly [Palumbo et al., arXiv:2602.16708, v4, October 2026] [verified: authors and version from the arXiv listing]. The arXiv listing first appeared under the title "Policy Compiler for Secure Agentic Systems" (system name PCAS); the v4 text uses the title above and calls the system FORGE. Cite the version you read. On AgentDojo, adding the provenance policy to repeat-user prompting reduces attack success from 14.1% to 0.9%. On τ²-Bench, task success rises from 74.7% to 81.5% in airline and from 86.3% to 87.4% in retail [verified against the full text].

*What it establishes:* deterministic, policy-level enforcement at runtime, with a benchmark result showing that a provenance policy reduces attack success without a large loss in task success.

*What it does not establish:* the full text contains no mention of a receipt, a hash, or a nonce. It describes a monitor that decides on actions, not a commitment to the effect in the business system, and it does not describe execution verifying a binding to a decision. The monitor's guarantee depends on it being in the execution path, which the paper also assumes. The abstract frames the work as a step toward provably safe systems, not as a proof of this property.

*Relation to this work:* PCAS/FORGE is the nearest policy-enforcement neighbour. Its Datalog event-graph model is a different formalism from the request model in §4, and the proposal adds the binding and evidence elements listed above.

**AgentCap.** Suresh and Gao present AgentCap, a runtime authorization layer that mediates every tool invocation through an MCP wrapper. Each request declares an intent, and policy constraints cover trust, workflow prerequisites, mutually exclusive authority and argument provenance. Authorized requests receive short-lived, budget-bounded capability tokens, signed with Ed25519 and encoded as JWTs, which are validated at the tool boundary. Delegation is a signed attenuation chain that preserves action and resource and cannot increase lifetime or budget [Suresh and Gao, arXiv:2611.00729, October 2026] [verified: authors and ID from the arXiv listing; mechanism from the full text]. Across AgentDojo and InjecAgent, the paper reports zero attack success with GPT-5.4 and reductions in attack success for every evaluated model-benchmark pair. In controlled scenarios it reports blocking every attempted unauthorized execution while preserving legitimate operations [verified against the full text].

*What it establishes:* signed, short-lived capabilities checked at a gateway before a tool call is forwarded, with explicit attenuation in delegation and a declarative policy language usable both at runtime and for predeployment analysis.

*What it does not establish:* the full text contains no mention of a canonical request, a receipt, a nonce or a replay. The gateway checks the token's action and resource against the requested call, so binding is to action and resource, not to a hash of the full canonical request. It describes no record that links the authorization to an effect in the business system.

*Relation to this work:* AgentCap is the closest token-based neighbour. It supports the claim that signed authority checked at a gateway is practical, and it gives the proposal a comparison point on the same benchmarks. The proposal's distinct elements are the request-level binding and the effect commitment E_effect (§6).

### 2.1.10 Summary

| Family | Establishes | Does not establish | Complement in this proposal |
|---|---|---|---|
| Capabilities / ocap | Explicit, attenuable authority | Request-level terms and effect evidence | Attenuation intuition (§4.6) |
| Macaroons | Offline attenuation with chained verification | Request binding and effect receipts | Subsumption as fixed caveats (§4.6) |
| Policy engines (Cedar, Rego) | Deterministic, analyzable decisions | Enforcement and evidence | Decision function D(X) (§4.2) |
| OAuth / RAR | Bounded delegated access | Per-request binding and effect record | Encoding for grant G (§4.1) |
| Signed mandates (AP2) | Transaction-level signed intent | Enforcement in the principal's system; general effect verification | Nearest neighbor; extended to E_effect (§6) |
| Control-flow defenses (CaMeL) | Reduced injected-action surface | Guarantee outside the tool layer; verifiable evidence | Independent of agent behavior (§5) |
| Sandboxing | Reduced reachable surface | Authorization of permitted actions | Layer beneath the boundary |
| Tamper-evident logs | Auditable append-only record | Truth of logged events | Evidence ledger (§3) |
| OAP (Before the Tool Call) | Pre-action policy enforcement; signed decisions; hash-chained audit | Request-hash binding, single-use execution and effect commitment not described in full text | Closest prior work on the decision side |
| PCAS / FORGE | Runtime policy enforcement over event graphs | Receipt, hash or nonce not in full text | Nearest policy-enforcement neighbour |
| AgentCap | Signed, short-lived capabilities checked at a gateway | Request-hash binding, replay, and effect record not in full text | Nearest token-based neighbour |

### 2.1.11 Position

No single family above combines (a) a deterministic decision bound to one canonical request, (b) execution-time verification that the decision still applies, and (c) a commitment that links the decision to a receipt from the business system. The proposal's claim is the combination, not any one component.

This claim is narrower than the draft previously implied. OAP in particular covers pre-action enforcement with signed records, and if its full specification binds a signed decision to a request hash and checks it at execution, the novelty claim reduces to the effect commitment and the revocation and replay design. The claim must be restated against the final text of each paper before submission. It is not established by this section.

#### References

- Birgisson, A., Politz, J. G., Erlingsson, Ú., Taly, A., Vrable, M., Lentczner, M. Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud. NDSS 2014. **[verified: authors, venue]**
- Cedar: A New Language for Expressive, Fast, Safe, and Analyzable Authorization. OOPSLA 2024, DOI 10.1145/3649835; arXiv:2403.04651. **[verified]**
- Debenedetti, E., Shumailov, I., Fan, T., Hayes, J., Carlini, N., et al. Defeating Prompt Injections by Design. arXiv:2503.18813, 2025. **[verified: authors, arXiv ID, result figures]**
- Dennis, J. B., Van Horn, E. C. Programming Semantics for Multiprogrammed Computations. Communications of the ACM 9(3), March 1966. **[verified: authors, venue, date]**
- Miller, M. S. Robust Composition: Towards a Unified Approach to Access Control and Concurrency Control. PhD thesis, Johns Hopkins University, 2006. **[verified: title, institution, year; advisor Jonathan Shapiro]**
- Open Policy Agent, Policy Language documentation, openpolicyagent.org/docs/policy-language. **[partly verified: the page exists and describes Rego. Latest release is not settled: one source gives v1.20.2 (September 2026), others give older versions, and the official GitHub releases page was not reachable. Cite the exact version you evaluated.]**
- Palumbo, N., Choudhary, S., Choi, J., Amir, G., Chalasani, P., Dillig, I., Jha, S. Formal Policy Enforcement for Agentic Systems. arXiv:2602.16708, v4, October 2026. Earlier v1 title: "Policy Compiler for Secure Agentic Systems." **[verified: authors and version from arXiv listing; read the version you cite]**
- RFC 6749, The OAuth 2.0 Authorization Framework. **[verified]**
- RFC 9162, Certificate Transparency Version 2.0. Obsoletes RFC 6962. **[verified]**
- RFC 9396, OAuth 2.0 Rich Authorization Requests. May 2023. **[verified]**
- Suresh, A. K. K., Gao, P. AgentCap: Capability-Based Runtime Authorization for Secure LLM Agent Execution. arXiv:2611.00729, October 2026. **[verified: authors, ID, mechanism from full text]**
- Uchibeke, U. Before the Tool Call: Deterministic Pre-Action Authorization for Autonomous AI Agents. arXiv:2603.20953, March 2026. Single version (v1), last checked in this session. **[verified: author, ID, version history, mechanism and testbed results from full text]**
- AP2 (Agent Payments Protocol) specification, v0.2 (released around April 2026), ap2-protocol.org/ap2/specification/. Reference code and SDK: github.com/google-agentic-commerce/AP2. **[partly verified: v0.2 is the latest version found, and sources give April 2026 for the release. The ap2-protocol.org spec page could not be fetched in this session, so the mandate structure is taken from search results and must be read directly. A secondary source reports that v0.2 uses SD-JWT format; not confirmed. Re-check the GitHub release notes on the submission date.]**

---

## 3. System Model

The system contains the following entities:

- **Principal (P):** the individual or organization delegating authority.
- **Agent (A):** the autonomous system proposing an action.
- **Delegation grant (G):** the explicit authority assigned to the agent, with a grant version.
- **Policy (π):** the deterministic rules defining permitted operations, with a policy version.
- **Authorization engine:** the component evaluating whether a canonical request is permitted.
- **Execution boundary:** the enforcement component that is the only path to the protected business system.
- **Evidence ledger:** the append-only record of authorization and execution events.
- **Verifier:** an independent component that checks the integrity and relationships of recorded evidence.

The agent is an **untrusted action proposer**. Its generated reasoning is never accepted as evidence of authorization.

---

## 4. Formal Authorization Model

### 4.1 Requests

An execution request is a tuple

X = (P, G, A, O, R, C, T, N)

where:

- P is the principal identifier;
- G is the delegation grant identifier and version;
- A is the agent identifier;
- O is the operation;
- R is the target resource;
- C is the set of execution constraints (for example, amount limits, currency, counterparty);
- T is the validity window;
- N is a nonce, unique per request, generated by the requesting client or the boundary.

The **canonical request hash** is

h_X = H_req(canon(X))

where canon(·) is a deterministic, length-prefixed serialization with a fixed field order and a version tag, and H_req is a collision-resistant hash. Two requests that differ in any authorization-relevant field have different canonical forms.

### 4.2 Decisions

The authorization function is

D(X) = PolicyEvaluation(X, π, S)

where π is the policy version and S is the revocation state visible to the engine at evaluation time. The decision belongs to

D ∈ {ALLOW, DENY, REQUIRE_APPROVAL}

- **ALLOW** produces an authorization token bound to h_X, the policy version, the grant version, the revocation epoch and an expiry.
- **DENY** is terminal for that request.
- **REQUIRE_APPROVAL** produces a pending state bound to h_X. The pending state cannot authorize execution. A later approval is a new decision that must itself be bound to h_X and to the approver's identity. If the request changes during approval, the pending state is void and reevaluation is required.

### 4.3 Execution rule

Execution of X is permitted only if the boundary verifies, at the moment of execution:

1. the authorization token is validly signed under a trusted key;
2. the token's request hash equals H_req(canon(X)) for the request presented;
3. the token has not expired relative to the boundary's trusted clock or sequence;
4. the revocation epoch in the token is not older than the boundary's known revocation epoch (subject to the residual window in §4.5);
5. the nonce N has not been consumed, and is consumed atomically with the execution attempt.

### 4.4 Security invariant

Execution(X) ⟹ ValidGrant(X) ∧ Authorized(X) ∧ RequestIntegrity(X) ∧ Unconsumed(N)

Any change to an authorization-relevant field changes h_X and invalidates the previous token.

### 4.5 Revocation

Each token carries the revocation epoch current at decision time. Revocation publishes a new epoch. The boundary rejects a token whose epoch is older than the latest epoch it has observed.

Revocation is therefore **not instantaneous**. A revoked grant can still authorize execution for a residual window of at most Δ, where Δ is the maximum time between publication of a revocation and its observation by the boundary, plus the token lifetime if the boundary does not check epochs at execution. Δ is a deployment parameter and must be reported in every evaluation. We do not claim zero-latency revocation.

### 4.6 Delegation attenuation

A grant G' is a **subordinate** of grant G, written G' ⊑ G, if and only if:

- res(G') ⊆ res(G);
- ops(G') ⊆ ops(G);
- limit(G') ≤ limit(G) for every numeric constraint in C;
- validity(G') ⊆ validity(G).

Delegation is permitted only if the subordinate grant satisfies this relation. The relation is checkable from the grant records without evaluating the agent's behavior.

---

## 5. Threat Model

The architecture considers the following threats:

- Prompt injection attempting to expand delegated authority.
- Task-completion pressure encouraging unauthorized actions.
- Modification of a request after authorization.
- Credential misuse and privilege escalation.
- Replay of a previously authorized request.
- Use of expired or revoked grants (subject to the residual window in §4.5).
- Unauthorized delegation to subordinate agents.
- Alternative tool paths that bypass the boundary.
- Inconsistent evidence between authorization and execution.

### 5.1 Assumed trusted components

The analysis assumes that the following are correctly implemented and uncompromised:

- the execution boundary;
- the signing keys and trust roots for authorization tokens and receipts;
- the policy store and the policy evaluation code;
- the revocation-epoch source;
- the evidence ledger's append-only property.

### 5.2 Out-of-scope compromise

Compromise of the trusted components in §5.1 is **out of scope** for this version. In particular, we do not analyze compromise of the policy author, of the signing key holder, or of the execution system's own receipt generation. These are listed as open problems in §10.

---

## 6. Proposed Architecture

The architecture separates action generation, authorization, execution and verification.

1. The agent submits a proposed transaction to the authorization boundary.
2. The request is normalized into its canonical form and hashed to h_X.
3. The authorization engine evaluates X against the active grant and policy version.
4. On ALLOW, the engine issues a token bound to h_X, the policy version, the grant version, the revocation epoch and an expiry. Its commitment is

   E_auth = H_com(DOMAIN_AUTH ‖ enc(P) ‖ enc(G) ‖ enc(π) ‖ enc(h_X) ‖ enc(D) ‖ enc(seq))

   where enc(·) is length-prefixed and DOMAIN_AUTH is a fixed domain-separation tag. E_auth is computed **before** execution.
5. The execution component verifies the token (§4.3) and consumes N atomically with the execution attempt.
6. The execution component produces an effect receipt ρ describing the business-system outcome. The receipt is committed as

   E_effect = H_com(DOMAIN_EFFECT ‖ enc(E_auth) ‖ enc(execution_id) ‖ enc(ρ))

7. The ledger appends E_auth and E_effect in order, together with signatures.
8. The verifier independently checks the chain E_auth → E_effect, the signatures, and the consistency of the recorded fields.

If execution fails after N is consumed, the boundary records a failed effect receipt and does not silently release the nonce. Retry requires a new request with a new nonce and a fresh decision. This preserves idempotence without permitting duplicate effects.

---

## 7. Cryptographic Evidence Model

The evidence record associates:

- principal identity;
- agent identity;
- delegation grant identifier and version;
- policy version;
- canonical request hash h_X;
- authorization decision and revocation epoch;
- authorization sequence number or trusted timestamp;
- execution identifier;
- business-system effect receipt ρ;
- signatures and integrity-chain references.

The evidence commitments E_auth and E_effect are defined in §6. The earlier single-commitment form E = H(P ‖ G ‖ Policy ‖ Request ‖ Decision ‖ Effect) is **withdrawn**: it required the effect before the authorization could be committed, and used bare concatenation, which is ambiguous.

Implementations must define:

- domain separation for every hash and signature use;
- signature schemes and verification procedures;
- key management and rotation;
- event ordering and the trusted source of sequence numbers or time;
- the trusted source of effect receipts.

A hash chain alone does not establish that a business effect actually occurred. Independent verification therefore requires receipts from the execution system whose trust is stated as an assumption.

---

## 8. Experimental Evaluation

### 8.1 Conditions

The evaluation compares the following conditions, all run on the same scenarios and benchmarks:

1. model-level instructions only (baseline);
2. sandbox restrictions only (baseline);
3. conventional role-based access control (baseline);
4. capability-based authorization, implemented as signed, scoped tokens without request binding (baseline);
5. pre-action enforcement as described in the Open Agent Passport specification (OAP; Uchibeke, arXiv:2603.20953);
6. pre-action enforcement as described in the Formal Policy Enforcement system (PCAS/FORGE; Palumbo et al., arXiv:2602.16708);
7. pre-action enforcement as described in AgentCap (Suresh and Gao, arXiv:2611.00729);
8. the proposed architecture without the evidence layer (request binding and single-use execution only), as an ablation;
9. the proposed architecture in full: request binding, single-use execution, revocation epochs and the two-stage evidence commitments.

Code availability, as stated in each paper's full text and not yet verified from the experiment environment: OAP's specification, policy packs and reference implementation are at github.com/aporthq/aport-spec, github.com/aporthq/aport-policies and github.com/aporthq/aport-agent-guardrails, and its adversarial testbed is hosted live. PCAS/FORGE's system is at github.com/sasy-labs/sasy and its evaluation code at github.com/sasy-labs/forge. AgentCap's text contains no code link, so condition 7 must be implemented from its published design, with every deviation reported. Before the experiments are designed, each repository must be cloned, its license checked, and the version pinned.

Conditions 5 to 7 are included so that the proposal is measured against the closest published systems, not only against baselines. Where a system has released code, it is run as released. Where it has not, its published design is implemented and every deviation is reported. Each condition must state exactly what it enforces, so that the comparison is reproducible.

Conditions 8 and 9 separate the contribution of request binding and single-use execution from that of the evidence layer. Where a condition does not produce an effect commitment, the evidence-verification metric is reported as not applicable for that condition, not as a failure.

### 8.2 Scenarios

Banking payments, refund processing, vendor management, API execution and multi-agent delegation.

### 8.3 Metrics

- unauthorized execution rate;
- legitimate task completion;
- false rejection rate;
- authorization latency;
- execution overhead;
- revocation effectiveness, reported with the residual window Δ;
- evidence verification success.

Legitimate task completion and false rejection rate are in tension. Both must be reported; neither is a sufficient summary alone.

### 8.4 Trials and oracle

- Matched authorized and unauthorized transactions, so the two classes differ only in authorization-relevant fields.
- Adversarial modifications after authorization, replay attempts and repeated trials.
- **Trials per scenario and condition (proposed default, pending decision).** 200 matched pairs per scenario: 100 authorized and 100 unauthorized transactions, generated from one template so that they differ only in authorization-relevant fields. Each pair is run once per model under test with five independent seeds, giving 500 trials per scenario, condition and model. Rates are reported with 95% Wilson intervals. With 0 failures in 500 trials, the upper bound is below 1%, which sets the resolution of the unauthorized-execution rate.
- **Adversarial modifications (proposed).** Six enumerated classes applied to each authorized transaction after its decision: amount increase, recipient change, resource substitution, operation substitution, constraint relaxation and subordinate over-delegation. Each class has 50 instances per scenario, generated by a fixed script from the seed. A separate red-team arm lets a model attempt modifications freely, with a fixed budget of 50 attempts per scenario, all logged.
- **Replay and lifecycle (proposed).** Per scenario: 50 replays of a consumed request, 50 uses of an expired token and 50 uses of a revoked grant. Revocation is published at a random point in the request sequence, and the residual window is measured as the interval from publication to the first rejected use.
- **Trial seeds (proposed).** Seeds 1 to 5 for every scenario and condition, recorded with a hash of the versioned configuration.
- **Oracle definition (proposed, pending decision).** A transaction is labelled unauthorized if and only if it fails at least one of: the delegation grant in force at request time, the policy predicates for its operation, the execution constraints C, or the validity window T. The label is computed from the grant and policy alone.
- **Independence.** The oracle must not call the policy engine of any condition under test. It is a separate reference evaluator, written from the grant and policy definitions in §4, checked against a hand-labelled sample. Disagreements are resolved by review before any result is reported.
- **Labels fixed in advance.** Each trial's label comes from the generator's construction and is recorded in the versioned configuration before the run starts.
- **Legitimate completion.** A task counts as completed when the final environment state matches the task specification. This check does not depend on the authorization decision.

All scenarios, policies, oracle decisions and configurations will be versioned.

---

## 9. Security Properties

The architecture aims to establish the following properties. Each requires explicit assumptions and formal or experimental verification; none is proven by this paper.

- **Authorization completeness:** every protected effect passes through the enforcement boundary (assumes no alternative path to the business system).
- **Request binding:** an authorization applies only to the exact canonical request evaluated (assumes collision resistance of H_req).
- **Delegation attenuation:** a subordinate grant satisfies G' ⊑ G (§4.6).
- **Revocation enforcement:** after the residual window Δ, revoked authority cannot authorize new protected execution (§4.5).
- **Replay resistance:** each nonce is consumed at most once by a successful execution (assumes atomic consumption).
- **Evidence integrity:** recorded authorization and execution evidence can be checked for cryptographic integrity (assumes trusted keys).

---

## 10. Limitations

- The architecture cannot guarantee correctness when protected business operations bypass the enforcement boundary.
- Cryptographic integrity does not establish the truth of external execution receipts.
- Policy correctness, identity assurance, key security, transaction atomicity and distributed-system failure handling remain implementation concerns. In particular, a policy that is permissive by design will be enforced faithfully.
- Revocation is bounded, not instantaneous (§4.5).
- The architecture does not eliminate malicious model behavior, sandbox vulnerabilities or prompt injection. It constrains the business effects those behaviors can produce.

---

## 11. Conclusion

As agents acquire operational autonomy, enterprise security must distinguish technical capability from delegated business authority. An agent's ability to reach a resource or invoke a tool does not establish that the resulting action is authorized.

This paper proposes an execution-boundary architecture in which authorization is evaluated independently of agent reasoning, bound to a canonical request, and linked to verifiable execution evidence. The objective shifts from asking agents to stay within their permissions toward enforcing those permissions at the point where business effects occur. Whether this is stronger in practice is a question for the experiments in §8, which remain to be run.
