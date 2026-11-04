# Connecting an agent to Parmana

This guide lives on the docs site, so there is one copy to keep current:

- Published: https://docs.parmanasystems.com/guides/connect-an-agent
- Source: [`docs/site/guides/connect-an-agent.mdx`](../../site/guides/connect-an-agent.mdx)

It covers what an agent needs (a capability, a scoped key, the policy in effect, a signed human
approval), how to build and send the request, and every response the server can return.
Tutorial 111 (connect an agent) was removed on 2026-11-02 with the Paytm connector (ADR-0018). The documented request contract is covered by the tests in `packages/api/tests`.

For an AI agent integrating Parmana, read
[Integrate Parmana: specification for AI agents](https://docs.parmanasystems.com/agents/integrate).
