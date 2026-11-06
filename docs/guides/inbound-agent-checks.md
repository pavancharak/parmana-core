# Inbound agent checks: closing the direct-call gap (G-129)

**Read with:** roles [security](https://github.com/pavancharak/parmana-guide/blob/main/roles/security/README.md), [architect](https://github.com/pavancharak/parmana-guide/blob/main/roles/architect/README.md), [account-management](https://github.com/pavancharak/parmana-guide/blob/main/roles/account-management/README.md), [compliance-auditor](https://github.com/pavancharak/parmana-guide/blob/main/roles/compliance-auditor/README.md) · [reference index](https://github.com/pavancharak/parmana-guide/blob/main/docs/reference-index.md) · [known limits](https://github.com/pavancharak/parmana-guide/blob/main/docs/01-concepts.md#known-limits)

Parmana checks and records actions that leave through its gateway. An agent run by a customer or partner that calls one of your business systems directly never reaches Parmana, so nothing decides that call and nothing is recorded. Core's gap [G-129](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md) names this. The design that closes it is [RFC-0024](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/rfcs/RFC-0024-Inbound-Agent-Authorization.md), option A.

This page is for the team that runs a business system, which is the party that must act. Parmana can only check requests a business system asks it to check.

## What the decision requires

RFC-0024 decided that each business system that accepts external agent requests calls Parmana before it acts. No route into that system may skip the check. Parmana's side of the bargain is the endpoint below. Your side is calling it and refusing anything it does not approve.

If a route into your system does not call the check, that route is not covered, and the guide's [known limits](https://github.com/pavancharak/parmana-guide/blob/main/docs/01-concepts.md#known-limits) apply to it.

## The check endpoint

`POST /v1/inbound/checks` on Parmana's API, authenticated as the partner whose agent made the request.

### Request

| Field        | Required | Meaning                                                                                                                                                 |
| ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `capability` | yes      | The action, as `namespace:verb` in lower case, for example `billing:refund`.                                                                            |
| `audience`   | yes      | The audience your system is registered under. It must equal the server's configured audience, or the request is refused with `audience does not match`. |
| `target`     | no       | A string naming what the action changes, such as an order id.                                                                                           |
| `parameters` | no       | An object. Grant limits are checked against the value at each limit's path, for example `parameters.amountInr`.                                         |
| `signals`    | no       | An object of declared facts. Recorded with the decision; not checked by the endpoint itself.                                                            |

### Responses

| Status | Body                                | Meaning                                                                                                                          | What you do                                                     |
| ------ | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `201`  | The decision fields and `signature` | A decision was made and recorded. Read `outcome`.                                                                                | Act only if `outcome` is `approved` and the signature verifies. |
| `400`  | `error`                             | The request is malformed: capability pattern, audience, target, parameters or signals wrong, or a limit's value is not a number. | Fix the request. Do not retry the same one.                     |
| `401`  | `unauthenticated`                   | No partner identity was presented.                                                                                               | Check the partner's credentials.                                |
| `403`  | `no_active_grant`                   | The partner holds no current grant for this capability.                                                                          | Refuse the action.                                              |
| `403`  | `grant_limit_incomplete`            | A limit on the grant cannot be evaluated.                                                                                        | Refuse the action and tell the partner.                         |
| `403`  | `no_policy_bound`                   | No policy is bound to this capability. A capability with no policy is refused, so nothing is approved on grant limits alone.     | Refuse the action.                                              |
| `403`  | `policy_unavailable`                | The bound policy could not be loaded. The `reason` says why.                                                                     | Refuse the action and retry the check later.                    |

A `201` with `outcome: "rejected"` is a normal refusal. Its `reason` says why (for example, `policy_rejected`, or `exceeded` when a grant limit was passed).

### The decision fields

Each decision carries these fields, and the signature covers them:

- `decisionId`, `outcome` (`approved` or `rejected`), and `reason` when rejected
- `partnerId`, `capability`, `target`, and `amount` when a limit applies
- `policyName` and `policyVersion`, the policy that decided it
- `expiresAt`, ten minutes after the decision was made
- `audience`

Act on a decision only before `expiresAt`. After that, check again.

## What your system must do

1. **Call the check before any action** that an external agent requests. Do not call it after.
2. **Refuse anything that is not `approved`**, including on a network error or a timeout. A timeout is not an approval.
3. **Verify the signature** over the decision fields, using Parmana's public key, before acting on an approval. The canonical bytes are defined by `canonicalCheckBytes` in core's [`packages/api/src/routes/inbound-checks.ts`](https://github.com/pavancharak/parmana-core/blob/main/packages/api/src/routes/inbound-checks.ts).
4. **Check `expiresAt`** and refuse an expired decision.
5. **Keep your own record** of the decision id next to the action it allowed, so the two can be matched later.
6. **Run the no-bypass check** described below, once it exists in your environment.

## What the check does not do yet

These are open in core's gap log, and you must plan around them:

- **No approval step for inbound requests.** The check approves on grant limits and the policy, but it does not yet ask a person to approve. `approved_by` and `approved_at` are not written ([G-143](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md)).
- **Identity is the partner's API key.** That allows no per-agent grant and no revocation of one agent. It is a stopgap until per-agent identity exists (RFC-0024, decision 3).
- **Nothing calls the check in production yet**, and no scheduled probe checks that a direct call is refused ([G-146](https://github.com/pavancharak/parmana-core/blob/main/docs/internal/VERIFICATION-GAPS.md)). Until that probe exists, a bypass your system does not see cannot be known to Parmana.
- **The facts the check relies on come from the partner's declared signals** unless a permanent source is in place (G-144, RFC-0026, a draft).

## Verifying there is no bypass

Decision 6 of RFC-0024 is that a business system refuses any request without a valid Parmana approval, and that a scheduled probe sends a direct request with no approval and expects a refusal. To verify this in your own system:

1. Send a request to your system's action route with no Parmana approval. Expect a refusal.
2. Send the same request through the route an external agent uses. Expect a refusal unless a valid approval is attached.
3. Record each result with the date. A request that gets through is an incident under [Incidents](https://github.com/pavancharak/parmana-guide/blob/main/docs/onboarding/incidents.md).
4. Record the result as "not verified" for any route you have not tested. Do not describe a route as covered until it has been tested.

## Who reads this

- Business system owners and engineers: this whole page.
- [Security](https://github.com/pavancharak/parmana-guide/blob/main/roles/security/README.md): the no-bypass verification and the identity limits.
- [Architect](https://github.com/pavancharak/parmana-guide/blob/main/roles/architect/README.md): the decision record and the open items.
- [Account management](https://github.com/pavancharak/parmana-guide/blob/main/roles/account-management/README.md): what to tell a partner before they connect.
- [Compliance and audit](https://github.com/pavancharak/parmana-guide/blob/main/roles/compliance-auditor/README.md): what the records prove and what they do not.

## The permanent fix

The permanent fix is not something Parmana can deploy alone. A business system stays protected only if it refuses unapproved actions itself, on every route. Parmana supplies the check and the proof that it works. The plan has six parts.

| #   | Part                                           | What it means                                                                                                                                                  | Who does it                                    | Status (6 November 2026)                                                 |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | The business system refuses unapproved actions | Each action route accepts a request only with a valid, unexpired Parmana decision whose signature verifies. This is RFC-0024 option A.                         | Business system owner                          | Design decided. Not built in any business system.                        |
| 2   | One controlled entry point                     | External agent traffic reaches each business system through one entry point, so there is no second route.                                                      | Business system owner and platform team        | Not started. This is a network and deployment rule, not code in Parmana. |
| 3   | Continuous proof of no bypass                  | A scheduled probe sends direct requests with no approval and expects a refusal. Anything that gets through raises an alert and is recorded as a signed record. | Parmana (probe), business system owner (route) | Open: G-146.                                                             |
| 4   | Per-agent identity                             | Each agent has its own identity, so one agent can be granted or revoked without affecting others. Replaces the shared partner API key.                         | Parmana                                        | Open: RFC-0024 decision 3. A stopgap is in place.                        |
| 5   | A permanent source of facts                    | The check relies on facts the business confirms itself, not on what the partner declares.                                                                      | Parmana and business system owner              | Open: G-144, RFC-0026 (draft).                                           |
| 6   | Human approval for inbound requests            | Inbound requests that need a person get a signed approval, as outbound actions already do.                                                                     | Parmana                                        | Open: the remainder of G-143.                                            |

**Parts 1 and 2 are the fix.** Parts 3 to 6 make it provable and tighter over time. Until part 1 is built in a business system, that system's external routes are not covered, and the known limits in [Concepts](https://github.com/pavancharak/parmana-guide/blob/main/docs/01-concepts.md#known-limits) apply.

### What Parmana provides, and what it does not

| Parmana provides                                               | Parmana does not provide                         |
| -------------------------------------------------------------- | ------------------------------------------------ |
| The check endpoint and its signed decisions (built and tested) | Enforcement inside a business system             |
| The probe design and, once built, its records                  | Network control over a business system's routes  |
| Per-agent identity, once built                                 | Assurance that a partner's agent calls the check |

### How to know when it is closed

Treat G-129 as closed only when all of these hold for a business system:

1. Every action route refuses a request that has no valid decision, and a test shows the refusal.
2. External agent traffic has one entry point, and the network rule is written down.
3. The no-bypass probe has run on a schedule, and its latest result is recorded.
4. Each agent in use has its own identity.
5. The facts the check relies on come from a permanent source.
6. Inbound requests that need a human have a signed approval.

Until then, state the status as open, and name the parts that are not done.

## Status

Last reviewed: 6 November 2026, from core's `main` (commit `43dcba6`). The gap log says G-142 is resolved in pull request #448, awaiting review. The route on `main` already runs the bound policy, so the gap log may be out of date. Check the pull request before relying on either statement.
