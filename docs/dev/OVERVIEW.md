# Parmana overview

[Back to the README](../../README.md) · [Developer docs index](README.md)

## Research

- **[The Authority Gap: Why Autonomous AI Needs Deterministic Execution Boundaries](../../authority-gap.md)** (discussion draft, November 2026). The paper's architecture diagram is in [`authority-gap.md`](../../authority-gap.md).

## The problem

Companies want AI agents to issue refunds, pay vendors, update CRM deals, merge pull requests and post to team channels. Two questions stand between that and production:

- **What may this agent do?** An instruction in a prompt ("only refund up to 500") is not a control. The agent, or any text injected into it, can ignore it.
- **Can we prove what it did?** Logs written by the same system that acted are a claim, not evidence.

## What Parmana does

Parmana sits between any caller (an AI agent, an application or a person) and the systems it calls.

- **Before an action:** the request is checked against an explicit, versioned policy, and it needs a signed approval from a person you trust. No approval, no action, reads included ([CLAIMS.md 2.47](../internal/CLAIMS.md)).
- **When it runs:** on the supported paths, the gateway resolves connector credentials, and an agent calling the HTTP API never receives them. Code on the same host that can read the server's environment can still read those credentials ([G-128](../internal/VERIFICATION-GAPS.md)). The gateway releases one approved action, once, through a connector.
- **After it runs:** a signed record of what was authorized and what happened. Anyone can verify it offline, using only the public key they choose to trust. The verifier cannot prove that the key belongs to Parmana.

Parmana does not decide what the agent should do. It decides whether the agent was allowed to do it, and it records that decision in a signed record that anyone can check with the verifier.

**Limits, stated up front.** Parmana checks only actions that leave through its gateway. It does not yet check an agent that calls one of your systems directly ([G-129](../internal/VERIFICATION-GAPS.md)). Code on the same host that can read the server's environment can still read connector credentials ([G-128](../internal/VERIFICATION-GAPS.md)). Parmana is a prototype; see [Status and scope](STATUS-AND-EVIDENCE.md#status-and-scope).

The planned fix for direct calls from outside agents is described in [RFC-0024](../internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md).

## Why the claims matter

Every statement about what Parmana does is written down in [docs/internal/CLAIMS.md](../internal/CLAIMS.md). Each claim is numbered, states the scope its evidence supports, names the code and tests behind it, and lists what is not yet true. Changes to claims are tracked in [docs/internal/CLAIMS-CHANGELOG.md](../internal/CLAIMS-CHANGELOG.md), so a change to a claim appears in review, not silently in a README.

This matters for three reasons:

- **You check a claim instead of trusting a pitch.** Each claim points to its evidence. If the evidence covers only part of the claim, the claim says so.
- **The limits sit next to the claim.** Where a control has a known gap, the claim names it and links to the gap log, so you see the boundary before you rely on it.
- **A claim that fails can be challenged.** A challenge is recorded against the claim under [RFC-0022](../internal/rfcs/RFC-0022-Challenge-Record.md), so disagreement becomes a tracked item, not an argument in a comment thread.
