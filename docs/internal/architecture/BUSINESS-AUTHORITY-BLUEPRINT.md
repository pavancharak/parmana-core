# Business Authority Blueprint

Status: proposed architecture, not yet adopted. Last reviewed 2026-11-02.

This document sets the category, the differentiation thesis, the reference
architecture and the first commercial scope for Parmana. It maps each proposed
component to the code that exists today, and it marks what does not exist.
Where this document and the code disagree, the code is the current state.

## 1. Category

**Business Authority Infrastructure.**

Parmana translates what an organisation authorises into deterministic controls
over what its people, applications and AI agents can execute, and produces
evidence that those controls were applied.

The foundational idea: a business must remain in control of what its systems
are authorised to do, even when those systems act autonomously. This applies to
AI agents, employees, applications, automated workflows and other systems acting
for the organisation. Business authority is the foundation. Deterministic
execution control is the mechanism that enforces it.

| Existing category              | Primary concern                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Identity and access management | Who are you?                                                                            |
| API authorisation              | Which resources can you access?                                                         |
| Policy engines                 | Which conditions must be satisfied?                                                     |
| AI governance                  | How should AI be managed?                                                               |
| Compliance systems             | Can you demonstrate regulatory compliance?                                              |
| Workflow engines               | What happens next in a process?                                                         |
| Parmana                        | What has the business authorised this actor to do, and can that be enforced and proven? |

Business authority is the organisation's explicit permission for an actor to
perform a particular business action under defined conditions. It is not
identity, access, policy or workflow, although it depends on all four.

## 2. Differentiation thesis

**Technical permission does not automatically confer business authority.**

A payment API may say "you may initiate payments." The business instruction is
narrower: "you may pay approved vendors, up to ₹50,000 per transaction, within
an approved budget, and only against an authorised purchase."

| Concept            | Question                                | Example                                                                    |
| ------------------ | --------------------------------------- | -------------------------------------------------------------------------- |
| Capability         | What can the technology technically do? | The API allows a payment to be initiated.                                  |
| Permission         | What can this identity access?          | The agent's credentials permit payment API access.                         |
| Business authority | What has the organisation authorised?   | Approved vendors, up to a set amount and budget, with approval conditions. |

Parmana does not claim that no one else can enforce policy before execution or
produce audit records. Other products do both (see section 9). The thesis to
validate is narrower:

| Dimension      | Generic policy enforcement          | Parmana's intended approach                                              |
| -------------- | ----------------------------------- | ------------------------------------------------------------------------ |
| Starting point | Access or security policies         | Business authority                                                       |
| Representation | Rules and conditions                | Explicit, versioned authority declarations                               |
| Subject        | Usually identity, resource or agent | Any actor acting on behalf of the organisation                           |
| Decision       | Allow or deny a request             | APPROVE or REJECT by policy; required approval is checked before release |
| Enforcement    | At configured enforcement points    | Before the protected business action commits                             |
| Evidence       | Decision logs                       | Linked authority, decision, approval and execution evidence              |
| Verification   | Review logs and policies            | Independently verify recorded decisions and execution evidence           |

A log saying an action was allowed does not prove it was authorised under the
correct authority version. Parmana must link authority, decision, approval and
execution into one verifiable chain. This is a hypothesis to test with
implementation and customers.

## 3. The four pillars

1. **Authority definition.** What has the business authorised?
2. **Deterministic evaluation.** Does the proposed action satisfy that authority?
3. **Execution enforcement.** Can the action proceed, or must it be blocked or approved?
4. **Verifiable evidence.** Can the organisation independently establish what was authorised and what happened?

## 4. Reference architecture

```
BUSINESS AUTHORITY        Authority declarations · limits · delegation · approval requirements
        |
AUTHORITY COMPILER (planned) Declarations -> canonical, machine-enforceable authority bundle
        |
DETERMINISTIC DECISION    Identity · action · resource · context · limits · approval state
ENGINE                    -> APPROVE | REJECT (policy outcome), plus reason codes; approval checked before release
        |
EXECUTION ENFORCEMENT     Enforcement adapters · credential mediation · transaction controls
        |
EVIDENCE AND VERIFICATION Decision record · approval record · execution receipt · integrity verification
```

Evidence is intended at every stage, not only at execution. A rejection is a
recorded policy outcome; persistence of a record for every rejection is not yet
verified. An approval is intended to be bound to the exact action and authority
version it approves.

### 4.1 Components

**A. Business authority registry (planned).** Intended as the source of truth; today authority is spread across policy, grants and approvals. It would record who or what
is authorised, which business actions are permitted, which resources may be
affected, transaction limits and conditions, approval requirements, delegation,
expiry, and authority version and status.

**B. Authority compiler (planned, not built).** Would accept a structured declaration, validates it for
completeness and consistency, converts it to canonical form, generates
deterministic enforcement rules, and signs and versions the bundle. Language
models may help people draft declarations. The final authority must be explicit,
validated and approved. A model does not interpret authority at execution time.

**C. Deterministic decision engine.** Receives a structured action request and
checks it against the applicable authority. Output is structured, never
conversational: `APPROVE` or `REJECT` (the policy outcome), with reason codes
where the policy engine provides them.

**D. Execution enforcement.** Makes the decision effective. An authorised
decision does not stop an agent calling an API directly, so Parmana must control
the protected execution path: mediate credentials, intercept payment or refund
requests, enforce at API or application boundaries, and ensure the protected
system cannot accept an unverified action through another path. Parmana cannot
guarantee enforcement over an action path it does not control.

**E. Evidence and verification.** Each action has a linked record of the
authority version, proposed action, decision and reason, approval (if any),
execution result or receipt, and integrity information. Today the replay check verifies the stored record's signature and hash only. It
does not contact the payment provider or re-run the policy decision, so it does
not independently confirm the external transaction.

### 4.2 Lifecycle rules

- If an action changes between approval and execution, the gateway rejects it:
  the policy and signal hashes must match the signed authorization, so a new
  authorization is required. An approval does not carry over to a different
  action.
- Requirement, not yet verified at release: retries and duplicate requests must
  not execute an approved action twice.
- Requirement: partial failures must produce evidence of what was attempted and
  what completed. Recording of errors is best effort today.

## 5. Mapping to the existing code

The proposal used `@parmanasystems/*` names. The published packages in this
repository are `@parmana/*`. The table uses the real names. "Partial" means the
capability exists in some form but not in the shape this blueprint needs.

| Blueprint component               | Existing package(s)                                                                     | State                                                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core authority and decisions      | `@parmana/shared`, `@parmana/runtime`                                                   | Partial. Decision pipeline exists (ADR-0004).                                                                                                                                        |
| Authority rules and approvals     | `@parmana/policy`, `@parmana/approval`                                                  | Partial. Versioned policies and signed approvals exist.                                                                                                                              |
| Authority compiler / bundles      | `@parmana/policy`                                                                       | Not built as a separate compiler. Canonical policy language is ADR-0008.                                                                                                             |
| Signing and integrity             | `@parmana/crypto`                                                                       | Exists. Signed records, KMS path (ADR-0009, ADR-0010).                                                                                                                               |
| Controlled execution              | `@parmana/execution-gateway`, `@parmana/execution-control`, `@parmana/execution-system` | Exists. Signed intent before release (ADR-0012); "once" is not yet verified.                                                                                                         |
| Connectors (enforcement adapters) | `@parmana/connector-*`, `@parmana/connector-sdk`                                        | The built in connector packages were removed from this repository under ADR-0018. External connectors are registered through approval and run at their own endpoints.                |
| Capability registry               | `@parmana/capability-registry`                                                          | Exists.                                                                                                                                                                              |
| Persistent evidence               | `@parmana/storage`                                                                      | Exists.                                                                                                                                                                              |
| Independent verification          | `@parmana/envelope-verifier`, `@parmana/replay`                                         | Record integrity verification exists; it does not confirm the external transaction. Offline verifier is in the separate `parmana-verifier` repo.                                     |
| Integration APIs                  | `@parmana/api`                                                                          | Exists.                                                                                                                                                                              |
| Governance console                | `@parmana/governance-ui`                                                                | Exists.                                                                                                                                                                              |
| Enterprise control plane          | none                                                                                    | Not built.                                                                                                                                                                           |
| Coverage of paths outside gateway | none                                                                                    | Partial. `POST /v1/inbound/decisions` (RFC-0025) issues signed partner refund decisions when configured; enforcement at the business system is not verified. See G-129 and RFC-0024. |

Constraint for the work ahead: the integrity core stays as it is. That means
canonical serialization, hash chaining, signed bundles, fail-closed behaviour
and append-only evidence (ADR-0005, ADR-0007).

## 6. Worked example: refunds

Target flow. Parts are implemented; the full path is not yet verified.

1. **Authority declared.** Refunds up to ₹5,000 are permitted automatically.
   Above that, manager approval is required.
2. **Action proposed.** Refund ₹8,000 against transaction TXN-102.
3. **Evaluated.** Amount, original transaction, refund eligibility, agent
   authority and approval conditions are checked.
4. **Decision: release is blocked until approval.** The agent cannot refund merely because its
   API credentials allow it.
5. **Approved.** The approval is bound to this refund request, not to a general
   permission.
6. **Released.** The gateway verifies the approval and releases the protected
   action once.
7. **Evidence recorded.** The organisation can verify authority, decision,
   approval and execution result.

Sequence: **Declared → Authorised → Executed → Proven.**

## 7. Scope decisions

These answer the three open questions in the proposal. They are recommendations
and need the owner's confirmation before they change the roadmap.

1. **Who is governed:** all actors. AI agents, people and applications, and
   other automated systems. The authority model is the same for each. The
   first commercial scope narrows this (item 3 below).
2. **Source of authority:** business declarations are the source of truth.
   Existing enterprise policies would be imported as inputs once the compiler
   exists (planned). They do not become authority by default.
3. **First commercial use case:** financial transactions. Refunds first, then
   vendor payments and purchase approvals. These have measurable limits, named
   business owners, financial consequences and clear evidence requirements.

Do not start with a general AI agent governance dashboard.

## 8. Roadmap

| Phase | Deliverable               | Purpose                                                               | Status  |
| ----- | ------------------------- | --------------------------------------------------------------------- | ------- |
| 1     | Business authority model  | Authority as a first-class, versioned object                          | Next    |
| 2     | Authority compiler        | Declarations to signed, deterministic bundles                         | Planned |
| 3     | Decision engine           | Policy outcomes `APPROVE` / `REJECT`, approval checked before release | Partial |
| 4     | Enforcement adapters      | Decisions control real execution on the refund path                   | Partial |
| 5     | Evidence and verification | Link authority, decision, approval and execution                      | Partial |
| 6     | Enterprise control plane  | Manage authority across applications and organisations                | Planned |

Phase 1 is the first deliverable to build. The other phases depend on it,
because the compiler, decision engine and evidence chain all need an explicit
authority object to refer to.

## 9. Market position

Competitors already offer parts of this. Runtime governance and policy
enforcement at agent tool calls are offered by Google Agent Gateway, MongoDB
Atlas Agent Engine and NVIDIA Agent Policy Fabric. Open Policy Agent separates
decision from enforcement. Parmana's claim must be made at the business
authority level, with evidence from customers. It cannot rest on the
cryptography or on the presence of a policy check. The competitor claims above
come from the original proposal and need sources before publishing.

Positioning to use once the claims are backed by the code:

> **Parmana: Business Authority Infrastructure.**
> Your AI agents do only what you have authorised.
>
> Parmana checks each action against the policies and approvals you configure.
> It blocks what fails those checks and keeps a record of each decision.
> The record shows it is unaltered; it does not confirm the external transaction.
>
> AI can interpret. Business authority must be explicit. Execution must be
> controlled. Evidence must be verifiable.

Defensibility comes from the authority model and its lifecycle, from the
enforcement integrations, from the integrity of the execution chain, and from
independent verification. It does not come from the category name.

## 10. Open items

- The authority object (phase 1) has no design document yet. It needs one before
  the compiler is started, and it should be recorded as an ADR.
- Enforcement at business systems for direct calls is not verified (G-129,
  RFC-0024). An inbound decision route exists when configured. Until enforcement
  is verified, the claim is limited to actions routed through Parmana.
- The positioning in section 9 must not be used externally until the
  customer-facing claims are backed by tests and documentation in this repo.
