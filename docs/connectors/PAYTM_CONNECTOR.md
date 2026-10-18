# Paytm Refund Connector

> **Update (2026-09-27):** `paytm:refund` is now bound to `customer-refund` 1.1.0: automatic up to 10000, a verified signed manager approval above 10000 and up to 100000, refused above 100000. This page describes the connector as built with 1.0.0. See `docs/site/concepts/human-approval.mdx` and `docs/CLAIMS.md` 2.42.

> **Update (2026-09-28, G-75):** the binding now names `customer-refund` 1.2.0: every refund needs a verified signed manager approval, because `refundEligible` and `fraudCheckPassed` are declared by the agent and nothing checks them. 0 or less and above 100000 are refused. Approved in production through maker checker on 2026-09-28 and in effect since: no refund of any amount runs without a signed manager approval. See `docs/CLAIMS.md` 2.44.

> **Update (2026-09-28):** the connector service's other endpoint, `/agent/refunds`, called Paytm itself after Parmana had already released the refund through this connector, so an approved refund could be paid twice (G-70). Fixed and deployed in `parmana-paytm-agent` PR #6: Parmana, through this connector, is the only path to Paytm. Also found and fixed the same day (G-71): an optional `refundReference` makes the refId per refund instead of per transaction, and `refundReason` now reaches Paytm; see "Idempotency and replay protection".

**Status:** Implemented this milestone. See `docs/CLAIMS.md` §3.22 for the full evidence list (exact
files, exact test counts, exact commands run). This document is the architecture/operator reference;
CLAIMS.md is the checkable claim.

**Read `docs/connectors/BUILDING_A_CONNECTOR.md` first** — this
connector follows that same architecture (HubSpot is still the canonical reference for the
in-process case). This document only covers what is different about a _remote_ connector, and the
Paytm-specific configuration/operational details.

## Why this connector is different from every other connector in this codebase

Every other connector Parmana has (HubSpot, GitHub) calls the vendor's real API **in-process** — the
executable adapter class itself is the thing that holds an `https://api.hubapi.com` or
`https://api.github.com` HTTP call. Paytm is different by design:

```
Parmana never talks to Paytm directly, at all.

AI Agent
  -> Parmana POST /execute
  -> customer-refund@1.2.0 policy (a manager's signed approval required)
  -> APPROVED
  -> Parmana Execution Gateway
  -> GatewayPaytmAdapter (this codebase)
       -> HTTPS -> PAYTM_CONNECTOR_URL/connector/paytm-refund
  -> a separate, trusted service ("parmana-paytm-agent")
       -> Paytm /refund/apply
```

`parmana-paytm-agent` is a **separate repository** this codebase does not have access to and does not
need to. It is the only thing that ever holds a real Paytm merchant key, and the only thing that ever
speaks Paytm's own checksum-authenticated wire protocol. Everything this codebase implements stops at
one HTTPS call to that service's `POST /connector/paytm-refund` endpoint.

## Three authentication layers — do not conflate them

This is the single most important distinction to keep straight, and the milestone that built this
connector was explicitly required not to blur it. A third layer (cryptographic authorization
signing) was added by ADR-0009 Phase 2B (2026-09-13) after a code-level audit found the original
two-layer design left a real gap — see the correction below the table.

| Layer                                          | What it proves                                                                                                                                                                             | Where it lives                                                                                                                                                                                                                                                                                                                                                                                                                         | What it is NOT                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Parmana authorization**                      | This specific refund (this amount, this order, this transaction) was actually approved by policy and signed off by a trusted manager, for a reason Parmana can show.                       | `customer-refund@1.2.0` policy, `ApprovalSignalVerifier`, `SignalIntentBinder`, `CapabilityPolicyBinder`, `SignedTokenConnectorAuthenticator`, `ExecutionControlService` — all pre-existing, all unmodified by this connector.                                                                                                                                                                                                         | Not something Paytm's API has any concept of.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **Authorization signature** _(added Phase 2B)_ | This exact `businessTransactionId`/`orderId`/`txnId`/`amount` combination is the one Parmana's policy engine actually approved — not merely that _some_ refund was approved at some point. | `GatewayPaytmAdapter` signs `canonicalPaytmAuthorizationString(...)` (`packages/connector-paytm/src/PaytmTypes.ts`) with the gateway's own key (`SignerBootstrap`/`DEFAULT_KEY_ID`) and attaches `signature`/`keyId`/`expiresAt` (60s TTL, `PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS`) to the outbound `authorization` object. `parmana-paytm-agent` fetches the matching public key via `GET /keys/:keyId` and verifies before executing. | **Update (2026-09-16): now backed by AWS KMS in production** (`KEY_PROVIDER=aws-kms`, `docs/adr/ADR-0009-KMS-Secrets-And-Connector-Signature-Hardening.md`, `docs/site/deployment/aws-kms-signing.mdx`). Verified live against the real, deployed `parmana-paytm-agent` service: its own audit trail recorded `authorization.verified` for a real signed request, confirming the KMS-signed signature verifies correctly on the receiving side. Getting there required fixing a real bug where the gateway's signing and per-authorization verification paths had silently diverged (`docs/VERIFICATION-GAPS.md` G-48) — see `examples/tutorials/114-signing-verification-key-agreement/` for a reproduction. |
| **Connector transport authentication**         | This HTTPS request actually came from Parmana's gateway, not an arbitrary caller.                                                                                                          | `PAYTM_CONNECTOR_SHARED_SECRET`, sent as a Bearer token on the one call `GatewayPaytmAdapter` makes.                                                                                                                                                                                                                                                                                                                                   | Not Paytm's merchant key/checksum. On its own (before Phase 2B), this was the _only_ thing standing between an arbitrary caller and a real refund — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| **Paytm's own authentication/checksum**        | Paytm's API believes the connector service is a legitimate Paytm merchant integration.                                                                                                     | Entirely inside `parmana-paytm-agent`. This codebase never sees it, never holds `PAYTM_MERCHANT_KEY`, and never constructs a Paytm checksum.                                                                                                                                                                                                                                                                                           | Not a substitute for Parmana authorization.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Correction to an earlier version of this document.** This section used to claim "a caller who
somehow obtained a valid `PAYTM_CONNECTOR_SHARED_SECRET` still cannot invoke Paytm... there is no
route, endpoint, or code path in this codebase that lets an agent or caller reach the Paytm connector
service directly." That claim was true only about _this codebase's own routes_ — it did not account
for `parmana-paytm-agent`'s `POST /connector/paytm-refund` being a public HTTPS endpoint in its own
right (per the `PAYTM_CONNECTOR_URL` contract, it has to be reachable over the internet). Before Phase
2B, anyone holding the shared secret — leaked from either side, or from a compromised host with
filesystem access to either process — could `curl` that endpoint directly with a self-chosen
`orderId`/`txnId`/`amount`, entirely bypassing `POST /execute`, the policy engine, and every binding
check this document describes above. `GatewayPaytmAdapter` never had a code path for this because it
didn't need one — the vulnerability was that the _receiving_ service accepted the shared secret alone
as sufficient proof. The authorization-signature layer added in Phase 2B closes this: the connector
service now also requires a signature it cannot verify without Parmana's public key, and cannot forge
without Parmana's private key, regardless of how the shared secret was obtained.

## Approved flow

```
1. AI Agent calls Parmana POST /execute with:
     intent.action = "paytm:refund"
     intent.parameters = { orderId, transactionId, amount, refundReason?, refundReference? }
     policy = { name: "customer-refund", version: "1.2.0", schemaVersion: "1.0.0" }
     signals = { refundEligible, managerApproved, fraudCheckPassed, refundAmount,
                 approvalArtifact }   (the manager's signed approval)

2. CapabilityPolicyBinder confirms paytm:refund is paired with exactly the
   canonical policy bound to it (customer-refund@1.2.0, or the version most recently
   approved through policy governance) -- not a caller-substituted one.

3. SignalIntentBinder confirms signals.refundAmount === intent.parameters.amount
   (policy.json's boundSignals) -- the declared "authorized amount" and the
   amount that will actually execute cannot diverge.

4. PolicyEngine.evaluate runs customer-refund/1.2.0's rules against the
   signals. All four conditions true and 0 < refundAmount <= 100000 -> APPROVE,
   then ApprovalSignalVerifier confirms managerApproved is backed by a signed
   approval for this order, covering this amount, used once. Without it the
   refund is refused. No agent action runs without a signed human approval.

5. Execution Gateway signs the authorization and dispatches to the
   registered "paytm" connector (GatewayPaytmAdapter).

6. GatewayPaytmAdapter validates the request shape (deny-by-default
   parameter allowlist), deterministically derives refId from
   (orderId, transactionId), plus refundReference when sent (G-71),
   resolves the connector shared secret, and
   sends the REAL parmana-paytm-agent wire contract as JSON to
   PAYTM_CONNECTOR_URL/connector/paytm-refund, authenticated with
   PAYTM_CONNECTOR_SHARED_SECRET as a Bearer token:

     {
       "transaction": {
         "businessTransactionId": "...",
         "intent": {
           "action": "paytm-refund",
           "target": "...",
           "parameters": { "orderId", "txnId", "refId", "amount", "reason"? }
         }
       },
       "authorization": {
         "payload": {
           "businessTransactionId": "...",
           "grantedCapability": "paytm-refund",
           "expiresAt": 1789300000000
         },
         "signature": "<base64, over businessTransactionId|action|orderId|txnId|amount|expiresAt>",
         "keyId": "default"
       }
     }

   Note this is NOT the generic flattened ConnectorRequest shape other
   Gateway adapters (HubSpot, GitHub) send -- it matches the real,
   already-implemented parmana-paytm-agent service's own
   POST /connector/paytm-refund contract exactly (verified against that
   repository's source), including its field names (txnId, not
   transactionId) and its hyphenated action string. Parmana's own
   internal capability id stays "paytm:refund" (namespaced, used
   everywhere else -- policy binding, connector registration); only
   this one outbound HTTP body uses the wire-specific "paytm-refund"
   string, via PAYTM_AGENT_WIRE_ACTION.

   `expiresAt`/`signature`/`keyId` were added by ADR-0009 Phase 2B (see
   "Three authentication layers" above) -- `expiresAt` is epoch
   milliseconds, `signature` is base64 over a pipe-delimited string
   built by `canonicalPaytmAuthorizationString()`
   (`packages/connector-paytm/src/PaytmTypes.ts`), never JSON, to avoid
   any key-ordering ambiguity between this repo and
   `parmana-paytm-agent`.

7. The connector service processes the refund against Paytm's real API
   (out of this codebase's scope) and returns:

     {
       "businessTransactionId": "...", "action": "paytm-refund", "target": "...",
       "parameters": { "orderId", "txnId", "refId", "amount" },
       "success": true, "executedAt": "...",
       "metadata": { "provider": "paytm", "resultStatus": "S", "resultCode": "00" }
     }

8. GatewayPaytmAdapter validates every identifying field in the response
   echoes the request exactly (businessTransactionId, action, orderId,
   txnId) before trusting it. success: true -> ConnectorResponse.success: true.
```

## Denied flow

```
1. AI Agent calls Parmana POST /execute with the same shape as above, but
   e.g. managerApproved: false (or refundAmount > 10000, or
   fraudCheckPassed: false, or a tampered/mismatched signal).

2. PolicyEngine.evaluate (or an earlier binding check -- see below) returns
   REJECT.

3. ExecutionGate.enforce throws before ExecutionComponent ever dispatches
   to any connector. HTTP response: 403, code POLICY_DENIED.

4. GatewayPaytmAdapter.execute() is never called. Zero HTTPS requests are
   made to PAYTM_CONNECTOR_URL. Paytm's own API is never reached.
```

This is proven directly in `packages/api/tests/integration/paytm-refund.integration.test.ts`: every
denial case asserts, via a `fetch` spy AND the hermetic mock connector service's own call counter,
that literally zero requests reached the connector service.

**A denial can come from three independent checks, all pre-existing and unmodified by this
connector**, not just an ordinary policy rule:

1. **`CapabilityPolicyBinder`** — the caller declared a `policy` reference other than the canonical
   one bound to `paytm:refund` (`customer-refund@1.2.0`). Closes the "pair a real capability with an
   unrelated, unprotected policy" exploit class.
2. **`SignalIntentBinder`** — a `boundSignals`-declared signal (`refundAmount`) does not equal the
   value at its bound Intent path (`parameters.amount`). This is what catches "authorized amount 500,
   actual execution amount 50000": the two can never diverge and still reach `PolicyEngine.evaluate`.
3. **`PolicyEngine.evaluate`** against `customer-refund/1.2.0`'s own rules — the ordinary case
   (excessive amount, failed fraud check, not manager-approved, or the unconditional
   `reject-default` fallback).

## Capability and policy binding

Exactly one capability is registered: `paytm:refund` (`PAYTM_REFUND_CAPABILITY`,
`packages/connector-paytm/src/PaytmCapabilities.ts`). It is bound, in
`packages/capability-registry/src/CapabilityPolicyBinding.ts`'s
`CANONICAL_CAPABILITY_POLICY_BINDINGS`, to `customer-refund@1.2.0` (originally 1.0.0, a pre-existing
policy this connector did not need to create or modify; 1.0.0 and 1.1.0 now fail to load, since
they authorized refunds without a person). It is **not** listed in
`packages/api/src/bootstrap/intentionallyUnboundCapabilities.ts`, so
`assertConnectorCapabilitiesBound.ts`'s fail-closed startup guardrail actively protects it: if this
binding were ever removed while the connector stayed registered, the process refuses to start.

## Trust / connector identity

`paytm` / `spiffe://parmana/connectors/paytm-refund`, added to
`packages/api/src/bootstrap/createConnectorAuthenticator.ts`'s trusted-connector-identity list, which
feeds the existing, unmodified `SignedTokenConnectorAuthenticator`. The Paytm connector is subject to
exactly the same gateway-issued, signed-attestation authentication check as every other connector —
nothing about this connector bypasses or weakens `SignedTokenConnectorAuthenticator`.

## Environment variables

```
PAYTM_CONNECTOR_URL=                    # Base URL of the trusted parmana-paytm-agent service.
                                         # Must use HTTPS outside NODE_ENV=test.
PAYTM_CONNECTOR_SHARED_SECRET=          # Bearer token Parmana authenticates itself to that
                                         # service with. NOT Paytm's merchant key.
PAYTM_CONNECTOR_TIMEOUT_MS=10000        # Optional, per-request timeout. Defaults to 10000.

TEST_PAYTM_CONNECTOR_SHARED_SECRET=     # Test-mode secret (NODE_ENV=test), read directly with
                                         # no bridge variable, mirroring every other connector's
                                         # test-credential convention.
```

No new environment variable was introduced for the Phase 2B authorization signature -- it reuses
whichever signing key `KEY_PROVIDER` already resolves to (`KeyBootstrap`/`SignerBootstrap`,
`packages/crypto`), the same key that signs Trust Records and every other signed artifact this
process produces. `parmana-paytm-agent` needs no corresponding new secret either: it fetches the
matching public key live over HTTP (`GET /keys/:keyId`) rather than being configured with one.

`PAYTM_CONNECTOR_URL` and `PAYTM_CONNECTOR_SHARED_SECRET` are optional as a _pair_, but never
independently:

| `PAYTM_CONNECTOR_URL` | `PAYTM_CONNECTOR_SHARED_SECRET` | Result                                                                                                                       |
| --------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| unset                 | unset                           | Connector simply not registered. No effect on Parmana's own boot, matching HubSpot/GitHub's own optional-connector behavior. |
| set                   | unset                           | **Startup fails hard** (`assertPaytmConnectorConfigured.ts`, called from `server.ts` before the port binds).                 |
| unset                 | set                             | **Startup fails hard**, same check.                                                                                          |
| set, non-HTTPS        | set                             | **Startup fails hard**, outside `NODE_ENV=test`.                                                                             |
| set, HTTPS            | set                             | Connector registers normally.                                                                                                |

This is deliberately stricter than HubSpot/GitHub's "any one missing variable means simply not
registered" behavior, because a Paytm connector registered with only one of the two would silently be
either unreachable or unauthenticated — neither of which should ever happen quietly.

## Idempotency and replay protection

**No second authoritative transaction store is introduced.** Parmana's existing nonce/execution-trust-
record machinery remains the sole authority for whether a given signed authorization has already been
consumed — this connector adds nothing parallel to it.

Paytm's own `refId` represents the _logical refund_ — identified by `(orderId, transactionId)`, the
Paytm order and transaction actually being refunded, not by Parmana's `businessTransactionId` (which
is unique per authorization attempt and therefore differs across two distinct Parmana authorizations
for the same logical refund, e.g. a legitimate retry after a prior attempt's outcome was unclear).

**Corrected against the real `parmana-paytm-agent` source** (its `POST /connector/paytm-refund`
handler, `src/server/index.ts`): that service does **not** derive `refId` itself — it requires the
_caller_ (`GatewayPaytmAdapter`) to supply one, and has no server-side idempotency store wired into
this route at all (a `RefundIdempotencyStore` exists in that codebase but is currently unused there).
`GatewayPaytmAdapter` closes that gap on the Parmana side: `deriveDeterministicPaytmRefId(orderId,
transactionId)` is a pure SHA-256-based hash with no `Date.now()`/`Math.random()`, so **a retried
request for the same `(orderId, transactionId)` always derives and sends the same `refId`**,
regardless of Parmana's own `businessTransactionId` (which differs across distinct authorization
attempts for the same logical refund). Paytm's own `/refund/apply` is documented as idempotent per
`refId`, so this is what ultimately prevents a duplicate refund even if the connector service's own
call to Paytm were retried independently.

**More than one refund per transaction (G-71, 2026-09-28).** Keyed on `(orderId, transactionId)`
alone, every refund of one Paytm transaction got the same `refId`, so a second, partial refund looked
to Paytm like the first again. A caller may now send `refundReference` in the Intent's parameters: its
own stable id for ONE refund (the refund agent sends its `refId`). The adapter then derives the `refId`
from `(orderId, transactionId, refundReference)`:

| Intent parameters                            | Paytm `refId`                              | Effect                                |
| -------------------------------------------- | ------------------------------------------ | ------------------------------------- |
| no `refundReference`                         | hash of `orderId:transactionId`, unchanged | one refund per transaction, as before |
| `refundReference` `R1`, sent twice (a retry) | the same value both times                  | Paytm sees one refund                 |
| `refundReference` `R1`, then `R2`            | two different values                       | two separate refunds                  |

A caller that wants per refund refIds must reuse the same reference when it retries one refund; a new
reference is a new refund. `refundReference` is at most 128 characters and `refundReason` at most 256;
anything else is refused before any network call. `refundReason` is sent to the connector service as
`reason`, which passes it to Paytm as the refund comment. How Paytm itself answers a second refund of
one transaction (for example, a total above the transaction amount) was not checked.

## Paytm execution outcome

Unlike an earlier draft of this document, the real connector service's response has **no separate
"ambiguous" status enum** — only a boolean `success`, plus whatever raw Paytm `resultStatus`/
`resultCode` the connector service chooses to surface in `metadata`:

- **`success: true`** — `GatewayPaytmAdapter` returns `ConnectorResponse.success: true`, with
  `metadata.refId`/`resultStatus`/`resultCode` from the connector service's response.
- **`success: false`** — covers both a definite Paytm decline (e.g. `resultStatus: "TXN_FAILURE"`) and
  any less-certain outcome the connector service was only able to report as "not a confirmed success."
  Returned as `ConnectorResponse.success: false` (a clean, recorded execution result — never an
  exception), with the raw `resultStatus`/`resultCode` preserved in `metadata` so a human or downstream
  process can distinguish a hard decline from something needing reconciliation.

**Never thrown as an error, either way.** Throwing on a non-success outcome would look, to anything
upstream that retries on exception, like a transient infrastructure failure — exactly the behavior
that could cause a second refund attempt for a refund whose actual outcome was never confirmed.

```
DO NOT:
  - derive a new refId for a retry of the same (orderId, transactionId)
  - treat a non-2xx/timeout/malformed-response error as "safe to just try again with a new refId"

INSTEAD:
  - a genuine retry naturally reuses the same deterministic refId (no caller action needed)
  - reconciling a non-success outcome against Paytm's real status is the connector service's own
    responsibility, using Paytm's documented status-query semantics -- out of this codebase's scope
```

`GatewayPaytmAdapter` itself contains no internal retry loop of any kind — every `execute()` call
makes exactly one HTTPS request.

## Audit trail (GAP-1 / GAP-3, closed 2026-09-14)

Before this date, neither side of this trust boundary kept a durable record. On this side,
`ExecutionControlService` wrote `session.created`/`execution.completed`/`execution.rejected`
events to `MemoryExecutionAuditSink` — an in-process array, lost on restart, not queryable.
`parmana-paytm-agent`'s own request handler logged nothing at all, not even to the console; a
rejected or successful refund on that side left no trace anywhere.

Both are now fixed, and land in the **same** table:

- **This repository**: `packages/api/src/bootstrap/createExecutionAuditSink.ts` wires
  `SupabaseExecutionAuditSink` (`@parmana/storage`) in any non-test environment — durable, signed
  at write time (`AuditEventCrypto`), and chained per `authorizationId` (`supabase/migrations/
20260914120000_add_execution_audit_events.sql`).
- **`parmana-paytm-agent`**: `src/parmana/audit.ts` (new, that repository's first runtime
  dependency, `pg`) writes `authorization.verified` right after independently verifying the
  Ed25519 signature on the forwarded authorization, then `execution.completed`/
  `execution.rejected` after the Paytm call resolves — two rows, not one, so a crash between
  verification and execution is still visible. Deliberately unsigned/unchained: that service
  holds Parmana's public key only, never a private key.

**The correlation key across both writers is `businessTransactionId`, not `authorizationId`.**
Parmana's own authorization identity is never forwarded across this trust boundary (see the
wire contract above) — `parmana-paytm-agent` only ever sees `businessTransactionId`, `orderId`,
`txnId`, and its own re-signed authorization envelope. `SupabaseExecutionAuditSink.query({
businessTransactionId })` is how to retrieve one refund's complete story across both services;
`query({ authorizationId })` retrieves only this side's own signed, chained events.

This crosses the same repository boundary "What this connector does not do" (below) describes:
unlike everything else in this document, the fix on `parmana-paytm-agent`'s side was made
directly in that repository, not inferred from its wire contract alone — see that repository's
own `src/parmana/audit.ts` and its test suite.

**For the complete, no-ambiguity runbook** for wiring this connector between two real Vercel
deployments and actually firing a real refund end to end -- every environment variable,
every real error message hit along the way (including the Supabase connection-string trap
that cost the most time), and how to verify the resulting cross-service audit trail directly
-- see `docs/site/guides/end-to-end-paytm-flow.mdx` (published docs).

## Staging -> production setup

1. Deploy `parmana-paytm-agent` (a separate repository) with a real `PAYTM_MERCHANT_KEY` and Paytm
   credentials. This codebase has no role in that deployment.
2. Generate a strong, random `PAYTM_CONNECTOR_SHARED_SECRET` and configure it identically on both
   sides: this Parmana deployment's `PAYTM_CONNECTOR_SHARED_SECRET`, and whatever the connector
   service's own configuration calls the same value.
3. Set `PAYTM_CONNECTOR_URL` to the connector service's real, HTTPS base URL.
4. Boot Parmana. `assertPaytmConnectorConfigured.ts` fails startup immediately if the configuration is
   partial or non-HTTPS — this is intentional; fix the configuration rather than working around it.
5. Confirm `paytm` appears as a registered connector (no `paytm_connector_unavailable` warning in
   startup logs).
6. Exercise the flow with a real, small-amount, staging-safe refund through `POST /execute` before
   relying on it for real traffic.
7. Confirm `parmana-paytm-agent` can actually reach this deployment's `GET /keys/:keyId` (used to
   verify the Phase 2B authorization signature) -- a network/firewall configuration that lets the
   connector service reach `PARMANA_API_URL` for `/execute` calls but not this unauthenticated
   discovery route would silently break every refund with a signature-verification failure.

There is no gated live-integration suite in this repository for this connector (unlike HubSpot's
`ALLOW_LIVE_HUBSPOT`/GitHub's `ALLOW_LIVE_GITHUB`) — that's still open work. **Update (2026-09-16):**
a real, reachable `parmana-paytm-agent` deployment now exists (Vercel, same team as this project),
and the flow through it was manually exercised end to end: a real signed request reached the
service, and its signature verified correctly (`authorization.verified` in the shared
`execution_audit_events` table both repos write to). The remaining unverified leg is Paytm's actual
API itself — `parmana-paytm-agent` does not yet have real `PAYTM_MERCHANT_ID`/`PAYTM_MERCHANT_KEY`
configured, so the live call past that point currently fails with Paytm's own `503`, external to
both repositories. A gated live-integration suite could now be built against this real deployment;
it hasn't been, and a fully successful refund (Paytm actually processing it) has not yet been
observed.

## What this connector does not do

- It never calls Paytm's own API. It never holds `PAYTM_MERCHANT_KEY`.
- It never re-enters Parmana's own `/execute` authorization path — the connector service's endpoint is
  `POST /connector/paytm-refund`, never `/execute`. There is no recursive authorization loop.
- It never trusts a connector-service response at face value: every identifying field must echo the
  original request exactly, or the response is refused.
- It never retries an ambiguous Paytm outcome automatically, and never mints its own `refId`.
