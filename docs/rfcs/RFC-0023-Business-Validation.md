# RFC-0023 — Business validation: an agent's proposal is never a business fact

Status: Implemented (phases 1 to 4)

Author: Pavan Dev Singh Charak (requirement); implementation session

Created: 2026-10-10

Updated: 2026-10-11

---

# Summary

An agent proposes an action and the facts it rests on. Today a policy evaluates those facts as the
caller sent them. A signed human approval is what authorizes (2.47), and caller facts can only refuse
(G-80). No business system confirms that the facts are true. This RFC adds a business validation
layer between authority and execution:

1. **Authority**: may this caller perform this kind of action at all?
2. **Business validity**: is this exact action valid for this exact business object, according to
   the system that owns the facts?

Execution proceeds only when both hold. Every decision records the two answers, and for a refusal the
execution answer, as separate statuses.

# The rule

A fact the agent proposed is never treated as a business fact. A policy names, per fact, the source
that owns it. Parmana asks that source itself, about the business object read from the Intent, and
records the answer as a **Trusted Signal**. The policy is evaluated on the trusted value. The agent's
own value is only compared with it, and a different value refuses the request.

This is not "proposal, then signature, then trusted signal". A signature over the agent's claim
proves who made the claim, not that it is true.

# Flow

```
Agent proposes action and facts
  -> normalize (SignalIntentBinder: the facts must describe the Intent)
  -> AUTHORITY (governance verification, capability/policy binding; caller scope at the API)
       not AUTHORIZED -> refuse; no business system is asked
  -> BUSINESS VALIDATION (TrustedSignalResolver)
       for each signalSources entry: ask the source -> Trusted Signal, or a failure status
       compare the agent's proposed value, if any
       not VALID -> refuse
  -> POLICY, evaluated on the trusted values
  -> signed approval check, authorization, release, signed record
```

# Statuses

| Answer              | Statuses                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Authority           | `AUTHORIZED`, `NOT_AUTHORIZED`, `AUTHORITY_UNCLEAR`, `AUTHORITY_EXPIRED`                                            |
| Business validation | `VALID`, `INVALID`, `MISSING_DATA`, `CONFLICTING_DATA`, `SOURCE_UNAVAILABLE`, `VALIDATION_EXPIRED`, `NOT_EVALUATED` |
| Execution           | `EXECUTED`, `NOT_EXECUTED`, `EXECUTION_FAILED`, `EXECUTION_UNKNOWN`                                                 |

- `AUTHORIZED` means the action may be decided: the action type, and, under a policy that requires a
  grant (phase 3), this request within the caller's grant. It does not mean this action is valid or
  was executed.
- `NOT_EVALUATED` is added to the requested set. It means validation did not run: authority was not
  established, or the policy declares no sourced facts. It is never `VALID`.
- `EXECUTION_UNKNOWN` is added: a release whose outcome cannot be established, such as a connector
  timeout after the request was sent, is never reported as failed.
- No status is ever converted into another. Any validation status other than `VALID` refuses the
  request, except `NOT_EVALUATED` under a policy that declares no sources. Those policies behave as
  before this RFC and still need a signed approval to approve.

# Trusted Signal

```json
{
  "signalId": "...",
  "signalKey": "refundEligible",
  "source": "orders-system",
  "sourceIdentity": "orders.example.internal",
  "claim": "refund.eligible",
  "subject": "123",
  "subjectPath": "parameters.orderId",
  "observedValue": true,
  "observedAt": "...",
  "validUntil": "...",
  "action": "refund",
  "businessTransactionId": "...",
  "integrityProof": {
    "algorithm": "sha256",
    "digest": "...",
    "sourceProof": "...",
    "sourceKeyId": "...",
    "sourceProofVerified": true
  },
  "verificationStatus": "VERIFIED"
}
```

`integrityProof.digest` is the SHA-256 of the canonical signal without its proof. It is signed by
Parmana as part of the Decision in the Execution Trust Record or Refusal Record. That proves what
Parmana observed, not that the source said it. Since phase 2, a source registered with an Ed25519
key must sign its answer; Parmana verifies the signature before trusting the answer and records it as
`sourceProof`, with `sourceKeyId` and `sourceProofVerified: true`. That proves the source said it. An
unsigned or wrongly signed answer from such a source is `SOURCE_UNAVAILABLE`. A source registered
without a key has no `sourceProof`.

`validUntil` is the earlier of the source's own `validUntil` and `observedAt + maxAgeSeconds`
(default 300 s).

# Policy declaration

```json
"signalSources": {
  "refundEligible": {
    "source": "orders-system",
    "claim": "refund.eligible",
    "subject": "parameters.orderId",
    "maxAgeSeconds": 60
  }
}
```

`PolicyValidator` refuses a declaration that:

- no rule reads;
- names a fact that is also in `boundSignals`, `approvalSignals` or `unboundSignalReasons`;
- has a malformed source name, an empty or overlong claim, or a subject outside the Intent;
- has a `maxAgeSeconds` outside 1 to 86400.

`GET /policies/in-effect` lists the declarations as `signals.sourced`.

# Audit model

Each `Decision` carries `assessment`:

```json
{
  "authority": { "status": "AUTHORIZED", "reason": "..." },
  "businessValidation": {
    "status": "INVALID",
    "reason": "refundEligible: the request proposed true, but source \"orders-system\" reports false for 123.",
    "signals": [ ... ],
    "failures": [ ... ]
  },
  "execution": { "status": "NOT_EXECUTED", "reason": "Not executed: business validation failed." }
}
```

The Decision is inside the signed canonical form of both records, so changing any status fails
verification. Records made before this RFC have no `assessment` and still verify.

# Business signal sources (phase 2)

Any business system can be a source. It is registered under a name, the one policies use in
`signalSources[*].source`, through maker checker, the same rules as an external connector (ADR-0013):

- `POST /business-signal-sources/changes` proposes `register` (`name`, `endpointUrl`, optional
  `timeoutMs` 1000 to 30000, default 10000, optional Ed25519 `publicKeyPem` and `keyId`) or `revoke`.
  Human callers only.
- A different human approves or rejects it with a step up authorization for that change id
  (`/changes/{id}/approve`, `/changes/{id}/reject`). Only an approved change touches
  `business_signal_sources`; one active registration and one pending change per name.
- The endpoint must be `https`, name a domain, carry no credentials or fragment, and resolve only to
  public addresses. That is checked on proposal, on approval and at every query, and each query is sent
  to the checked address with redirects refused and the answer limited to 16 KiB.
- A revoked registration stays listed. Revoking makes every policy that names the source refuse as
  `SOURCE_UNAVAILABLE` from the next request.

The runtime reads the registry on every lookup (`RepositoryBusinessSignalSourceRegistry`), so a
revoke takes effect immediately. A registry that cannot be read is `SOURCE_UNAVAILABLE`.

## Wire protocol

Parmana `POST`s `{ query, signature }`:

```json
{
  "query": {
    "version": 1,
    "source": "erp",
    "audience": "https://orders.example.com/parmana/signals",
    "signalKey": "invoicePaid",
    "claim": "invoice.paid",
    "subject": "INV-1001",
    "action": "erp:release-goods",
    "businessTransactionId": "...",
    "nonce": "...",
    "issuedAt": "...",
    "expiresAt": "..."
  },
  "signature": { "algorithm": "ed25519", "keyId": "default", "value": "..." }
}
```

`signature` is Parmana's default key (`GET /keys/default`) over the canonical JSON of `query`. The
query lives 60 seconds. `audience` is the endpoint as registered, so a query for one source cannot be
replayed to another.

The source answers HTTP 200 with `{ answer, signature? }`:

```json
{
  "answer": {
    "version": 1,
    "source": "erp",
    "nonce": "...",
    "signalKey": "invoicePaid",
    "claim": "invoice.paid",
    "subject": "INV-1001",
    "status": "observed",
    "value": true,
    "observedAt": "...",
    "validUntil": "..."
  },
  "signature": {
    "algorithm": "ed25519",
    "keyId": "erp-2026-10",
    "value": "..."
  }
}
```

`answer` must echo `source`, `nonce`, `signalKey`, `claim` and `subject`, so a signed answer cannot be
replayed to another query. `status` is `observed` (with `value`, `observedAt`, optionally
`validUntil`), `not_found` or `conflicting` (with `reason`). With a registered key, `signature` is
required and is Ed25519 over the canonical JSON of `answer`; a `keyId` that differs from the
registered one is refused. Anything else (not 200, not JSON, no echo, another version or status, a
bad signature) throws in `HttpBusinessSignalSource`, which the resolver records as
`SOURCE_UNAVAILABLE`. The resolver then applies the phase 1 checks to an accepted answer (type,
freshness, the proposed value).

`typescript/examples/08-business-signal-source.ts` is a complete source endpoint, tested against the
real client.

# Authority grants (phase 3)

A policy opts in with `"requireAuthorityGrant": true`. A request under it is decided only when the
authenticated caller, `metadata.submittedBy` as the server sets it from the API key, holds a grant in
force for the action, and the request is within the grant's limits.

A grant names a caller id, a capability (`namespace:verb`), optional limits by Intent path (`target`
or `parameters.<name>`: `min` and `max` for a number, `oneOf` for allowed values), an optional
`validFrom` (default: the approval time) and a required `validUntil`, at most 366 days later. Grants
are made and revoked through maker checker (`/authority-grants`), the same rules as sources, plus one:
neither the proposer nor the approver may be the grantee, so no one grants authority to themselves.
One active grant and one pending change per caller and capability.

| Check, in order                                      | Authority           |
| ---------------------------------------------------- | ------------------- |
| No authenticated caller                              | `NOT_AUTHORIZED`    |
| No grant registry, or it cannot be read              | `AUTHORITY_UNCLEAR` |
| No active grant for the caller and capability        | `NOT_AUTHORIZED`    |
| Before `validFrom`                                   | `NOT_AUTHORIZED`    |
| At or after `validUntil`                             | `AUTHORITY_EXPIRED` |
| A value outside a limit, missing, or of another type | `NOT_AUTHORIZED`    |
| Otherwise                                            | `AUTHORIZED`        |

The check runs after the governance and capability/policy checks and before business validation, so a
request without authority asks no business system. A refusal is a Refusal Record with `matchedRuleId`
`authority-not-authorized`, `authority-expired` or `authority-unclear`; a signed approval cannot cure
it. `assessment.authority.grant` records the grant checked (id, caller, capability, `validFrom`,
`validUntil`, limits), signed in the record. `GET /policies/in-effect` answers
`authorityGrantRequired: true` for such a policy.

# Execution (phase 4)

What a decision rests on must still hold when the action runs, not only when it was decided.

**Signed into the authorization.** The Execution Authorization carries, signed:

- `businessConditions`: each Trusted Signal of a `VALID` decision (signal, source, claim, subject, the
  value the source gave, `validUntil`);
- `authorityGrant`: the grant id and its `validUntil`, when a grant authorized the request.

Both are optional fields of the signed payload; an authorization without them verifies as before.

**Re-checked at release.** The Execution Gateway, which already re-verifies an authorization before
releasing it, refuses the release when any business condition is past its `validUntil`
(`businessConditionsCurrent`), or when the grant has expired or is no longer the caller's active grant
for the capability, revoked or replaced (`authorityGrantInForce`, read from the grant store; without a
grant store, fail closed). Nothing is sent and the nonce is not consumed. When these are the only failed
checks, the refusal is `409 AUTHORIZATION_NO_LONGER_VALID` with `executionStatus: NOT_EXECUTED`; a
forged or tampered request stays a generic refusal.

**Execute only if still valid.** A signed release to an external connector (ADR-0013) carries the
conditions, and expires no later than the earliest `validUntil`. The endpoint checks them in the same
transaction as the action and, if one no longer holds, does not act and answers `success: false` with
`conditionsNotMet: true`, recorded as such. The SDK's `verifyParmanaRelease` covers the conditions with
the signature; the example endpoints take a `conditionsHold` check. An endpoint that ignores conditions
still works, without the guarantee. Built in connectors (Paytm, HubSpot, GitHub, Slack) get the gateway
re-check, not the conditions.

**Execution statuses.**

| What happened                                              | Status              | Where                                                              |
| ---------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Refused at decision                                        | `NOT_EXECUTED`      | `assessment.execution` in the Refusal Record                       |
| Refused at release (`AUTHORIZATION_NO_LONGER_VALID`)       | `NOT_EXECUTED`      | the 409 response; the intent is `ERRORED`, close it `NOT_EXECUTED` |
| The endpoint declined (`conditionsNotMet`)                 | `NOT_EXECUTED`      | the Trust Record's execution, failed, with `conditionsNotMet`      |
| Released and performed                                     | `EXECUTED`          | the Trust Record's execution, completed                            |
| Released and the system reported failure                   | `EXECUTION_FAILED`  | the Trust Record's execution, failed                               |
| Released and the call failed (`EXECUTION_OUTCOME_UNKNOWN`) | `EXECUTION_UNKNOWN` | the 502 response; the intent is `ERRORED` until resolved           |

`EXECUTION_UNKNOWN` is never reported as failed: the action may have run. The Trust Record's format is
unchanged; the statuses are how its executions and the intents are read.

# Cumulative grant limits (not built; design for a later phase)

**Status: not built.** Recorded so it can be built later without re-deriving the design. A grant's limits
today apply to each request on its own: `"parameters.amount": { "max": 5000 }` caps one refund at 5000,
but 20 refunds of 5000 in a day all pass. A cumulative limit caps the total over a period: "at most 50000
INR, or 20 refunds, per day".

**The rule it must keep.** The running total is Parmana's own, counted from its own decisions. It is never
declared by the agent or read from the request. The removed Razorpay connector first took a
caller-declared daily total (`dailyCumulativeAfterThisRefundPaise`), which the authorization
certification named an exception to "AI cannot execute what the business has not authorized"
(CLAIMS.md, the closing certification section). TD-23 Phase 3B replaced it with a server-side
`RazorpayDailyRefundLedger` with `reserve()` and `release()`, atomic in Postgres by `INSERT ... ON CONFLICT
... DO UPDATE ... RETURNING` and proven with 50 concurrent reservations (VERIFICATION-GAPS.md, the entry
extending G-24). It was deleted with the connector on 2026-08-12 and is in git history; it is the
precedent to start from, generalised from one connector to every grant.

**Declaration.** A grant gains optional `cumulativeLimits`, made and changed through the same maker checker:

```json
"cumulativeLimits": [
  { "sum": "parameters.amount", "max": 50000, "period": "day", "timeZone": "Asia/Kolkata" },
  { "count": true, "max": 20, "period": "day", "timeZone": "Asia/Kolkata" }
]
```

- `sum` names a numeric Intent path (as the per-request limits do); `count: true` counts requests.
- `period` is `day`, `week` or `month`, calendar periods in the named IANA `timeZone` (default UTC).
  Rolling windows ("the last 24 hours") are an open question below.
- A request whose `sum` path is missing or not a number is refused, as for the per-request limits.

**Counting.** A table, for example `authority_grant_usage (caller_id, capability, metric, period_start,
total, count)`, keyed by caller and capability, **not by grant id**: revoking a grant and granting it
again must not reset the day's total.

1. At decision time, after the per-request limits pass and before business validation, the runtime
   reserves the request's amount with one atomic conditional update: add it only if the new total stays
   within `max`, in the same database transaction for every `cumulativeLimits` entry. Two requests at the
   same moment cannot both pass under the cap. Postgres: `UPDATE ... SET total = total + $amount WHERE
... AND total + $amount <= $max RETURNING total`, with the row created on first use.
2. Over the cap: `NOT_AUTHORIZED`, `matchedRuleId` `authority-cumulative-limit`, a Refusal Record, nothing
   asked or executed. The counter cannot be read or written: `AUTHORITY_UNCLEAR`, failing closed.
3. Only an approved decision keeps its reservation. A request refused later in the same decision
   (business validation, a policy rule, a missing approval) releases it in the same transaction.
4. A release refused at release (`NOT_EXECUTED`, `AUTHORIZATION_NO_LONGER_VALID`) releases it.
   `EXECUTION_UNKNOWN` keeps it: the action may have run, so it counts until a person resolves the
   Execution Intent.
5. `assessment.authority.usage` records, signed in the decision, the period, the total before and after
   and the cap, so a reader sees how close to the limit each decision was.

**Not needed at release.** The amount is reserved at decision time, so the gateway's re-check (phase 4)
does not need to recount.

**Tests to write.** Concurrent requests at the cap (exactly one passes); period rollover in the named time
zone, including a day boundary between decision and release; revoke and re-grant keeps the total; a
refusal after reservation releases it; `EXECUTION_UNKNOWN` keeps it; the counter unavailable gives
`AUTHORITY_UNCLEAR`; a live Postgres test of the conditional update; the memory repository serialises
updates.

**Open questions.**

1. Calendar periods or rolling windows. Calendar periods are one row per period and match how businesses
   state limits; rolling windows need per-request rows and a sum over them.
2. Whether a limit can span several capabilities (for example all `paytm:*` refunds together).
3. Whether a human-signed approval may exceed a cumulative limit, or the limit always holds. The
   per-request grant check today cannot be cured by an approval; the default should be the same.
4. Where the total lives for a deployment without a database (the memory repository restarts at zero).

# Phases

1. **This change.** Statuses, the Trusted Signal, `signalSources`, the source port
   (`BusinessSignalSource`) with a static registry, the resolver, the runtime step, and the
   assessment on every Decision. No source is registered in the server, so a policy that declares one
   is refused as `SOURCE_UNAVAILABLE`, failing closed. No shipped policy declares one.
2. **Implemented.** Source registry through maker checker (`/business-signal-sources`), the generic
   HTTP source with signed queries, and answers verified against the source's registered Ed25519 key.
   Built in sources (HubSpot, approvals) are not added: a system becomes a source by answering the
   protocol, and the approval stays the signed human approval (2.47). Verified in production on 2026-10-11 with a
   demo source (`examples/live-checks/business-signal-source`, 4 of 4).
3. **Implemented.** Per-agent authority grants (action, limits, expiry) through maker checker
   (`/authority-grants`), required per policy by `requireAuthorityGrant`, making `AUTHORITY_EXPIRED`
   reachable. Limits are per request; cumulative limits (per day, per month) are not built.
   Their design is recorded above, under "Cumulative grant limits". Verified in production on 2026-10-11 with a test
   policy (`examples/live-checks/authority-grant`, 4 of 4).
4. **Implemented.** Business conditions and the grant signed into the authorization and re-checked by
   the gateway at release; conditions carried to external connectors so they execute only if still
   valid; `EXECUTION_UNKNOWN` and `NOT_EXECUTED` on the responses that mean them. In production on 2026-10-11 an
   approved request under a sourced fact was released with it (`d736681f-8d86-4e24-bcf3-66debfa6ac23`); a grant
   revoked between decision and release has not been timed in production (G-94).
5. **Not built.** Cumulative grant limits (per day, week or month), counted by Parmana from its own
   decisions; the design is under "Cumulative grant limits".

# Open questions

1. The source of truth for refund eligibility (the merchant's order system, not Paytm) must be named
   before `customer-refund` can declare a source.
2. Whether a sourced fact can replace the signed human approval for some actions, or always adds to
   it. Phase 1 keeps the approval requirement (2.47) unchanged.
