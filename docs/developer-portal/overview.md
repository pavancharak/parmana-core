# Overview

[Portal home](README.md) · [Getting started](getting-started.md) · [Architecture](architecture.md)

## What is Parmana?

Parmana is an execution integrity layer for business applications and autonomous AI agents. Before an action runs, Parmana checks that:

1. the action is explicitly declared (what, on which target, with which amount or parameters, for which policy),
2. the authority to perform it is established (who asked, and a signed human approval where the policy requires one),
3. the organization's policy for that action approves it, evaluated deterministically, and
4. only then is the action released, and the outcome is recorded as signed evidence.

Requests that fail a check are refused and recorded. Requests that pass are released through a connector, and the result is an **Execution Trust Record**: a signed document that says what was authorized, what ran, and what the outcome was.

> Make authority explicit. Make authorization deterministic. Make execution provable.

Parmana does not decide what your business allows. Each organization writes and owns its own policies, and Parmana enforces them. The policies are JSON files that go through a maker-checker approval before they take effect (see [Policy management](policies/README.md)).

## Why does Parmana exist?

Agents and automated systems can plan, call tools and invoke APIs, and they usually hold credentials that let them do so. Three questions are hard to answer after the fact:

- Who authorized this execution, and on what basis?
- Which policy approved it, and was that policy version approved by someone other than its author?
- Can anyone verify, without trusting the system that ran the action, that the record has not changed?

Parmana answers those questions in signed records. An action that goes around Parmana, for example an agent calling a business system with its own credentials, is outside that record. Parmana can only account for the actions routed through it.

## Problems Parmana solves

| Problem                                                        | What Parmana does                                                                                                                          |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| An agent acts beyond what was approved.                        | Refuses any execution whose policy, signals or human approval do not satisfy the policy in effect.                                         |
| A policy changed without review.                               | Requires a second person (the checker) and a step-up signature to approve each policy version. The author cannot approve their own change. |
| A human approval is reused, expired or for a different amount. | Verifies the approval's signature, scope, amount, expiry and target before it counts. Each approval is single-use.                         |
| A transaction is replayed or submitted twice.                  | Refuses a `businessTransactionId` that was already used.                                                                                   |
| A record is altered after the fact.                            | Signs each record. Changing any covered field makes verification fail.                                                                     |
| Verification depends on the vendor's word.                     | Verification can run offline, with a small, dependency-free verifier and keys you pin yourself.                                            |

## How Parmana works

1. **Declare.** The application or agent builds a Business Transaction: the authority, the authorization, the intent (action, target, parameters), the policy name and version, and the signals the policy reads.
2. **Authenticate.** The caller presents an API key. The server maps the key to a caller and checks the caller may assert the `principalId` and invoke the `action`.
3. **Evaluate.** The server loads the policy version in effect for that policy name, checks the signals against the policy's bindings and approval rules, and evaluates the rules in order. The first matching rule decides.
4. **Approve.** For any rule that requires a human, the server verifies the signed approval artifact against the approver keys it trusts.
5. **Release.** If approved, the action is released through the execution gateway to a connector.
6. **Record.** The server writes the Execution Trust Record, signs it, and makes it available for verification, replay and receipts.

[Architecture](architecture.md) has the diagrams, the trust boundaries, and the synchronous and asynchronous paths.

## Core concepts

| Concept                           | Meaning                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Business Transaction**          | The declared request. Identified by `businessTransactionId`, a UUID chosen by the caller. It can be used once.                                                    |
| **Authority and authorization**   | Who the request acts for (`authority`), and the grant that makes it allowed (`authorization`).                                                                    |
| **Intent**                        | The action (`intent.action`, a capability such as `payments:refund`), the `target`, and the `parameters`.                                                         |
| **Policy**                        | A JSON document, named and versioned (`policy.name`, `policy.version`), that the organization owns. It is approved through maker-checker before it takes effect.  |
| **Policy version in effect**      | The most recently approved version for a policy name. A request that names an older, superseded version is refused.                                               |
| **Signals**                       | The facts the policy reads: values the caller declares, values the server binds to the request, values a registered source confirms, and a signed human approval. |
| **Human approval**                | An Ed25519-signed artifact from a trusted approver, scoped to a capability, a resource (target), an optional maximum amount, an expiry, and a single use.         |
| **Maker-checker**                 | The rule that a policy change is proposed by one human (maker) and approved by a different, listed human (checker) who signs a step-up envelope.                  |
| **Execution Trust Record**        | The signed evidence for one Business Transaction: the transaction, the authorization, the policy decision, the execution outcome and the signatures.              |
| **Verification, replay, receipt** | Checks on a record: server verification (`VERIFIED`/`FAILED`), replay of the stored hash and signature, and a signed receipt for a verified record.               |
| **Connector**                     | The component that performs the business call (for example a payment provider). It is reached only through the execution gateway.                                 |

## Who should use Parmana?

- **Engineering teams** that call business systems from an application, a service, or an AI agent, and need to show that each call was approved and by whom.
- **Platform and security teams** that own the policy set, run the approval process, and operate the Parmana deployment.
- **Compliance, audit and finance teams** that need records they can check independently of the system that produced them.
- **Fintech and payments teams** with refund, payout or limit rules that need a human decision above a threshold.

Parmana is probably not the right tool when the only requirement is to log what happened. It is designed to stop an action when the policy does not allow it, and it works only for actions that are routed through it.

## Typical enterprise use cases

- **Vendor payments:** release a payment only when the vendor is verified, the invoice is verified, funds are available, risk is below a limit, and a finance approver has approved this amount. See [Fintech integration](tutorials/fintech-integration.md).
- **Refunds:** refuse a refund that the payment source does not confirm, and require a manager's approval above a tier. See [Refund authorization](tutorials/refund-authorization.md).
- **Transaction limits:** refuse any execution above the approved amount, and any execution whose risk score is above the policy's threshold. See [Transaction limits](tutorials/transaction-limits.md).
- **AI agents:** let an agent propose and submit actions, while the policy and a human approver decide whether each action is released. See [AI agents](tutorials/ai-agents.md).
- **Change control for policies:** route every change to a policy through a second approver. See [Maker-checker](tutorials/maker-checker.md).

## How Parmana differs from API gateways and AI guardrails

|                                | API gateway                                            | AI guardrail or content filter                    | Parmana                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| What it decides on             | The request's route, credentials and rate.             | The model's input or output text.                 | The declared action, the policy version in effect, the verified signals and a signed human approval.                                     |
| Who writes the rules           | The platform team, usually in configuration.           | The model or vendor, usually as a general filter. | The organization, as versioned policy files approved by a second person.                                                                 |
| Proof of the decision          | Access logs.                                           | Usually none that a third party can check.        | A signed Execution Trust Record, verifiable offline with pinned keys.                                                                    |
| Can it stop a business action? | Only the API call it fronts.                           | Only text that reaches the model.                 | Yes. The release happens only after the policy and approval pass.                                                                        |
| Can it be bypassed?            | If the caller holds credentials for the target system. | Yes, by tool calls outside the model.             | Only by calling the target system directly, which is outside the record. This is why the target must accept only Parmana-released calls. |

Parmana is complementary to these tools. A gateway can still handle routing and rate limits in front of it, and a guardrail can still filter model output. Parmana adds the authorization and the evidence for the action itself.

## Next steps

- Run the examples: [Getting started](getting-started.md).
- Integrate: [Node.js](tutorials/nodejs-integration.md) or [Python](tutorials/python-integration.md).
- Learn the policy model: [Policy management](policies/README.md).
- Check the evidence: [Evidence verification](security/evidence-verification.md).
