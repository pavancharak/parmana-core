# Agent deployment: limits outside Parmana's control

Status: Guidance. No code changes. Read with [THREAT-MODEL.md](../../../THREAT-MODEL.md).

Parmana controls the actions that pass through its gateway. Several parts of agent security sit outside
that boundary. This guide covers them so an operator can close the gaps the software does not close.

The four limits below are stated in the threat model. Each section here says what to do about it.

1. Parmana only controls actions routed through it (A8, assumption 9).
2. Parmana does not detect prompt injection (§7).
3. Network egress is left to the hosting environment (assumption 8).
4. An approval names the action and resource, not every parameter, and a person can approve without reading
   closely (T2, T3). RFC-0027 proposes a fix. Until it is built, use the controls below.

---

## 1. Inventory: agents that hold their own credentials

Parmana cannot govern a call it does not see. An agent that holds a credential to a downstream system and
calls it directly is outside the boundary, and the downstream system records nothing that Parmana can sign.

**Find them before you rely on Parmana.** For each downstream system (payments, CRM, source control, chat,
billing), list:

- every credential that can write to it, and who or what holds it;
- every agent, script, scheduled job or developer tool configured with that credential;
- every MCP server or plugin that has the credential in its configuration.

Check these places, since credentials often end up there:

- agent and MCP configuration files, and their history in version control;
- CI secrets and scheduled-job environments;
- developer machines, where tools save approved commands and settings.

**Then make the direct path fail.** Parmana's protection holds only if the downstream system refuses calls
that do not carry a Parmana release. For each system:

- remove or rotate the direct credential, and keep only the connector's credential, held by the connector;
- where the system supports it, accept writes only from the connector's network address or identity;
- record the result. If a direct path still works, say so in the deployment record. Do not describe the
  system as covered.

**What this does not catch.** A credential that was copied before it was rotated, and an agent that uses a
system's public interface through a browser session, can still act. Treat these as open items, not closed.

---

## 2. Prompt injection: remove a combination, not a text pattern

Parmana does not detect injected instructions, and it does not try to. What it limits is what an injected
agent can achieve.

The risk comes from one combination in a single agent:

- it reads **private data**;
- it reads **untrusted input** (email, web pages, tickets, logs, documents, third-party responses);
- it can send data to an **outbound channel** (an HTTP request, an image or link fetch, a message, an email).

An agent with all three can be steered by one injected instruction to send private data out. This is the
lethal trifecta.

**What to do:**

- For each agent, write down which of the three it has. Where it has all three, remove at least one.
- If the outbound channel is needed, restrict it to named destinations, and do not let the agent build
  arbitrary URLs. Image and link previews are a common route for exfiltration, so block them where the
  output is rendered.
- Keep untrusted input and private data in separate agents where you can. A reader of untrusted content
  should not also hold credentials or private records.
- Put the approval-required policy on every capability that writes outward or reads private data. This is
  the control Parmana provides here (EV-04, 2.47). It limits the damage; it does not stop the injection.

**What this does not catch.** A person can be persuaded by injected content into approving an action they
would otherwise refuse. The approval is only as careful as the approver.

---

## 3. Egress and network controls

Parmana does not enforce network policy. Its threat model leaves the network and TLS to the hosting
platform.

**For each component, list the hosts it must reach and deny everything else:**

| Component | Needs outbound to |
| --- | --- |
| Parmana core (API, runtime) | its database, its key-management service, and the connectors' release endpoints |
| Connectors service | the single downstream system each connector serves (for example Razorpay, Paytm, Slack, GitHub, HubSpot) |
| Agents | the Parmana API only |

**Set it at the platform.** Use the hosting platform's outbound allowlist, a network policy, or an egress
proxy. Confirm it by testing a blocked host and recording the result.

**Agents get the Parmana API and nothing else.** An agent that can reach a downstream system directly has
the path described in §1.

**What this does not catch.** Traffic over allowed hosts. An allowed host can still be used to send data,
so the trifecta rule in §2 still applies.

---

## 4. Approvals: what a person is actually approving

An approval covers the action and the resource, and for some actions the amount. It does not cover every
parameter. Parameters outside the approval (message text, a deal stage, a field value) are the agent's
choice after approval (THREAT-MODEL.md T2).

Until RFC-0027 is built, operators can reduce the gap:

- Keep approval-required policies narrow. Approve one action on one resource, not a class of actions.
- Where the parameter matters (a message body, a payment note), add a policy rule that limits it, for
  example a maximum length or an allowed set of values.
- Train approvers to read the parameters the approval does not bind, and make the approval interface show
  them.
- Review approvals regularly. A high approval rate with little reading is a control failure, not a success.

**What this does not catch.** An approver who signs without reading. No software setting fixes that.

---

## 5. Limits the project states about itself

These are recorded by the project. Each one is a condition for relying on Parmana, not a footnote.

- **Software-only enforcement.** Enforcement is in software, not the network. Code on the same host can read
  credentials from the server's environment (gap G-128). Protect the host accordingly (§3).
- **Trusted host, database and keys.** Parmana assumes the host, the database, and the signing keys are not
  compromised. These are out of its threat model (THREAT-MODEL.md §4, A5, A6, A9; assumptions 1, 4, 8).
- **One approver key in production.** Only one approver key is trusted in production. A stolen approver key
  signs valid approvals (T3). Rotate and limit approver keys as a standing task.
- **Maker and checker held by one person.** In the current production deployment, one person holds both
  roles. The server cannot tell two credentials apart (T11, A7). Until two people hold them, the
  maker-checker control is not independent.
- **Internal reviews only.** Reviews so far were internal. The project states that no independent audit has
  been done (THREAT-MODEL.md §8). Do not treat the project as independently assessed.
- **Technology readiness level 6.** Assessed at TRL 6: a prototype demonstrated in a relevant environment. Sustained
  production load and high availability are not claimed.
- **Connectors not yet proven live.** The Slack and GitHub connectors have not been run against live systems.
  The Razorpay connector passed 4 of 4 checks in Razorpay's test mode, but no signed release has yet run end to end
  through the deployed service. Treat each connector as unproven until its end-to-end run is recorded.

---

## Checklist

- [ ] Every direct credential to a downstream system is listed, and the direct path is closed or recorded as open.
- [ ] Each agent is marked with the trifecta combination it has, and at least one part is removed where all three are present.
- [ ] Each component's outbound hosts are listed, with an allowlist at the platform, and a blocked host has been tested.
- [ ] Approval-required policies are narrow, and parameters that matter have explicit rules.
- [ ] The limits in §5 are recorded in the deployment record, with the owner and date of each.
- [ ] Each connector has an end-to-end run through the deployed service recorded before it is relied on.

## See also

- [THREAT-MODEL.md](../../../THREAT-MODEL.md): T2, T3, T11, §4 (attackers), §6 (assumptions), §7 (prompt injection), §8 (how this is checked).
- [RFC-0024](../rfcs/RFC-0024-Inbound-Agent-Authorization.md): agents that reach your systems directly.
- [RFC-0027](../rfcs/RFC-0027-Approval-Parameter-Binding.md): binding approvals to every parameter.
