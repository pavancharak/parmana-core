# ADR-0022: External Connector Read-Back

**Status:** Accepted with the recommended options for D1 and D2 (owner answer: "yes", 2026-11-12). The plan below has not started.

**Date:** Proposed 2026-11-12. Accepted 2026-11-12.

**Relates to:** ADR-0013 (the external connector contract this extends), ADR-0018 (connectors outside core), `docs/internal/designs/OUTCOME-RECONCILER.md` (the reconciler this serves, including the connector survey and the latency measurement), `docs/guides/enforcement-path.md` section 4 and section 11 (the `in_flight` outcome record).

## Context

An execution outcome row is written `in_flight` before a connector is called. It becomes `completed` or `failed` only when the outcome is known. A row stays `in_flight` when the connector returns an error after it may have acted, or when the process crashes in between. Parmana cannot then tell whether the action happened.

The survey on the reconciler's design branch found that no connector can answer that question today. The connector contract (ADR-0013) defines one operation, `POST {endpointUrl}`, which carries the signed release and performs the action. A release is never repeated to find out what happened, because a repeat is the duplicate effect the outcome record exists to prevent.

This ADR adds a read-only operation, a check, that asks an endpoint whether the effect of one authorization happened. A check performs no action.

## Decision

Add an optional operation to the external connector contract:

- **Request:** `POST {endpointUrl}/check`, with a body signed the same way as a release (`version`, `audience`, `authorizationId`, `businessTransactionId`, `capability`, `issuedAt`, `expiresAt`). The `audience` binding and the 60-second expiry from ADR-0013 apply unchanged.
- **Response:** `{ authorizationId, state, result?, signature? }`, where `state` is one of:
  - `applied`: the action ran. `result` is required and holds what the action produced. Parmana records the row as `completed`.
  - `not_applied`: the action did not run. Parmana records the row as `failed`.
  - `unknown`: the endpoint cannot tell. This is the default. Parmana leaves the row `in_flight` for a person.
- **Opt-in.** A registration declares `supportsCheck`. A connector without it is `unknown` for every row, so existing endpoints behave as before.
- **No side effects.** The endpoint answers from its own records only.

## Decisions for the owner

### D1. Is the signed answer mandatory? **Decided: Option A.**

ADR-0013 makes the endpoint's signature on its answer optional, and records it when present. A check answer would cause Parmana to write a record, so the question is whether an unsigned answer can count.

- **Option A (recommended): mandatory.** An unsigned or wrongly signed check answer is treated as `unknown`. Parmana never records `applied` or `not_applied` from a claim it cannot attribute to the endpoint.
- **Option B: optional.** An unsigned answer is recorded as the endpoint's claim, as the release answer is today. This is simpler for operators, but a record in the audit trail would rest on an answer no one can attribute.

### D2. Must the endpoint record intent before it acts? **Decided: Option A.**

A `not_applied` is only safe if the endpoint can prove the action never ran. That holds only if the endpoint writes a record of the attempt before it acts. If it crashes between acting and recording, it has nothing to answer from.

- **Option A (recommended): required.** The SDK's release helper writes the attempt before calling the endpoint's own code, and the check helper refuses to answer `not_applied` for any attempt it has no record of. Operators pay one write per release, which the latency measurement puts at about 0.5 ms against a loopback database. The cost on a distant database is larger and is set by that distance.
- **Option B: not required.** Operators choose their own write order. A `not_applied` from an endpoint that doesn't record intent first is unsafe, so Parmana would have to trust operators not to give one.

## Consequences

- **Positive:** stuck rows can be resolved without a person when the endpoint can answer, and without repeating the action.
- **Negative:** each external system needs its own check implementation, so the benefit arrives one connector at a time. Operators on the recommended options write one extra record per release.
- **Compatibility:** connectors without `supportsCheck` are unaffected. The SDKs need a new minor version for the check helpers.
- **Trust:** Parmana's audit record would depend on each operator's answer. With D1 Option A, the answer is attributable. With D2 Option A, a `not_applied` rests on a record the endpoint keeps before it acts.

## Not decided here

- The exact format of `result`, which each connector's SDK defines.
- A retention period for the endpoint's attempt record, which must outlast the authorization's expiry.
- Whether a check may be requested for an authorization whose row is still `in_flight` and whose expiry has not passed. The design doc says no, to avoid racing a retry.

## Plan if accepted

1. Add `supportsCheck` to the registration, with a maker-checker change and a migration.
2. Add `checkEffect` to the gateway's external adapter, with hermetic tests against a mock endpoint, covering audience, expiry, signature, and each state.
3. Add check helpers to both SDKs, tested against a check request signed by the real server code.
4. Wire the reconciler's read-back stage to `checkEffect` for registered connectors only.
5. Update `docs/internal/adr/ADR-0013` with a pointer to this ADR, and add a docs page for endpoint operators.
