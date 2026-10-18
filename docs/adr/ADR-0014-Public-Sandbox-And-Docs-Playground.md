# ADR-0014: Public sandbox and docs playground

**Status:** Accepted by the operator on 2026-10-01 (PR #103 merged), with the proposed answers to the three open questions. Step 1 (code) built on 2026-10-01. Steps 2 and 3 done on 2026-10-02: the sandbox is live at `https://parmana-sandbox.vercel.app` and its live check passed (`docs/CLAIMS.md` 2.51). Step 4 (docs) built on 2026-10-02. Retention (open question 3) built on 2026-10-02: `deploy/sandbox/retention.sql`, installed by the kit stage `Retention`. See the order of work.

**Date:** Proposed 2026-10-01.

**Relates to:** ADR-0013 (the external connector the sandbox's action is released to), `docs/CLAIMS.md` 2.50 (the
live check this reuses), `docs/VERIFICATION-GAPS.md` G-84 (latency).

## Context

The docs site should let anyone fire real requests and see real responses, as Stripe's does, without an account. Today
that is impossible:

- Every route but health and the API description needs an API key, and keys exist only for the operator's callers.
- Every action needs a signed approval from a trusted approver, made with a private key on the approver's machine. A
  visitor has neither the key nor the tools.
- The server sends no CORS headers, so a browser on the docs domain cannot call it.
- Production governs real actions (refunds) and must stay private.

Mintlify already renders a "Try it" panel on each of the 48 OpenAPI endpoint pages; it needs a server a browser may call
and a key to send.

## Decision

Run a **public sandbox**: the same code as production, deployed separately, with its own database and its own signing
keys, whose only action acts on nothing. Publish a demo key for it. Point the docs playground at it.

### 1. The deployment

| Part                | Sandbox                                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| Code                | The same `main`, deployed to a second Vercel project, `parmana-sandbox`                               |
| `NODE_ENV`          | `production`: every check production runs is on (policy approval records, signing readiness, intents) |
| Database            | A new Supabase project, all migrations applied, nothing shared with production                        |
| Signing keys        | New keys, never production's. A sandbox record never verifies against production's public key.        |
| Built in connectors | None configured. The server refuses to start in sandbox mode if any is (see 3).                       |
| Address             | `https://parmana-sandbox.vercel.app`, later `https://sandbox.parmanasystems.com`                      |

### 2. The one action: `sandbox:receipt`

Registered through maker checker as an external connector (ADR-0013) to a second deployment of the live check endpoint
(`examples/live-checks/external-connector`, built with the sandbox's public key and its own address). It answers with
a receipt and changes nothing. So the playground shows the real path end to end: policy, approval, signed authorization,
intent, gateway, a signed release over the internet, the endpoint's answer, a signed record.

Policy `sandbox-receipt` 1.0.0: approves only with a signed approval for the target (`resourceId: target`), proposed
and approved in the sandbox by the operator's maker and checker keys. `allowedParameters: ["note"]`, and the policy
refuses a `note` longer than 200 characters.

### 3. Sandbox mode: `PARMANA_SANDBOX=true`

One switch, read at startup, that turns on exactly two things and is refused anywhere they could do harm:

1. **A demo approver that signs on request.** `POST /sandbox/approvals` with `{ capability, resourceId }` returns an
   approval signed by the sandbox's demo approver, for `sandbox:receipt` only, valid 5 minutes, usable once. The demo
   approver's key is trusted only in the sandbox database. This replaces "the approver signs on their own machine",
   which a browser cannot do; the docs say so plainly. The approval still goes through every check a real one does.
2. **CORS** for the origins in `PARMANA_CORS_ORIGINS` (the docs site), on every route, with `Authorization` allowed.

Startup refuses `PARMANA_SANDBOX=true` when any built in connector is configured (`PAYTM_*`, `HUBSPOT_*`, `GITHUB_*`,
`SLACK_*`), so a sandbox can never reach a real system, and refuses `POST /sandbox/approvals` for any capability other
than `sandbox:receipt`. Without the switch the route does not exist.

`PARMANA_CORS_ORIGINS` also works without sandbox mode, so production could allow its own console later; unset, no CORS
header is sent, as today.

### 4. The demo key

One caller, `sandbox-visitor`, allowed only `sandbox:receipt`, acting only as itself. Its raw key is published in the
docs and prefilled in the playground. The existing rate limits apply (`RATE_LIMIT_EXECUTE_PER_MINUTE`, public routes).
Every visitor shares it, so every visitor can read every sandbox record: they hold only demo inputs, and the docs say
so. Governance routes refuse it (`NON_HUMAN_CALLER_DENIED`); the playground shows them with captured responses only.

### 5. The docs

- The OpenAPI file lists the sandbox as the first server, so every endpoint page's "Try it" calls it, with the demo key
  prefilled.
- A guided **Playground** page: refuse without approval, get an approval from the demo approver, send again and get a
  signed record, verify that record in the browser with the sandbox's public key, try to reuse the approval and be
  refused. Each step shows the real request and response.
- The quickstart starts with the sandbox (no install), then moves to a local server.

## Security

- **Nothing real is reachable.** No built in connector can be configured with sandbox mode on; the one action is
  released to an endpoint that acts on nothing.
- **No production trust is shared.** Separate database, separate signing keys, separate approver. A sandbox record,
  approval or key is worthless against production.
- **The public approver weakens one property, in the sandbox only:** anyone can get an approval for `sandbox:receipt`.
  That is the point of a playground, and it is stated on every sandbox page. Production keeps "no approval without a
  person's private key".
- **Abuse:** rate limits per key and per address; `note` limited to 200 characters; records hold only what visitors
  typed, visible to other visitors. A retention job (open question 3) bounds storage.
- **Mistaken switch in production:** refused at startup while production's connectors are configured.

## What this does not do

It does not open production to the public, does not add accounts or self service keys, and does not let visitors use
governance (policy, approver or connector changes) except as captured examples.

## Alternatives considered

- **Production with the visitor's own key.** Only existing key holders could use it, and it needs CORS on production.
- **In memory sandbox.** No database cost, but on Vercel each instance has its own memory, so a record made by one
  request is often missing for the next. Rejected by the operator on 2026-10-01.
- **Approvals signed in advance and printed in the docs.** Each is single use and expires within a day; they would run out at once.

## Open questions

1. The address: `parmana-sandbox.vercel.app` first, `sandbox.parmanasystems.com` when DNS is set? (Proposed: yes.)
2. Who holds the sandbox's maker and checker keys? (Proposed: the operator, as for production, kept apart from
   production's keys.)
3. Retention: delete sandbox transactions, records and refusals older than 7 days, daily? (Proposed: yes, by a
   scheduled job, documented as sandbox only.)

## Order of work if accepted

1. Code: `PARMANA_CORS_ORIGINS`, sandbox mode with its startup guard, `POST /sandbox/approvals`, the length rule;
   tests; OpenAPI. Production unchanged unless the variables are set. **Built.** The length rule needed no code: the
   policy engine already has `length_gt`. The guard refuses the exact variables the connectors read (a test keeps the
   list complete), and also refuses sandbox mode with caller authentication disabled. `POST /sandbox/approvals` needs
   the demo key.
2. Infrastructure, by the operator with steps written for them: the Supabase project, the Vercel project, keys,
   migrations, the receipt endpoint, the policy and the registration through maker checker, the demo key.
   **Done 2026-10-02** with the kit in `deploy/sandbox/`: Supabase project `zkrfrfyokkpfwghoohne` (not production's),
   Vercel projects `parmana-sandbox` and `parmana-sandbox-receipt`.
3. A live check of the sandbox, as for ADR-0013, then a CLAIMS entry. The kit's stage `Check` is this live check.
   **Passed 2026-10-02**, all nine checks (`deploy/sandbox/evidence/check-record.json`).
4. Docs: the OpenAPI server and prefilled key, the Playground page, the quickstart. **Built 2026-10-02:**
   `docs/site/playground.mdx` (scripts in `examples/sandbox-playground`, each run against the sandbox, kept equal to
   the page by `tests/architecture/sandbox-playground.test.ts`), the sandbox first in `servers` with `x-default` on
   the bearer scheme, and the sandbox in the quickstart, the agents guide, the API introduction and authentication.
   The in browser record check of section 5 is not built: the page shows the offline check in each SDK instead.
