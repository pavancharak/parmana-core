# Policy version 2: register API

Status: built. Routes are mounted under `/v2/register` when the policy version 2 runtime is on (see the environment reference, `PARMANA_POLICY_V2_DECISIONS`). Design: [CONSOLIDATED-DESIGN-AND-DECISIONS.md](CONSOLIDATED-DESIGN-AND-DECISIONS.md), section 5.

## Principles

- The caller is the authenticated caller. Its roles come from the saved register, never from the request.
- A register change is one saved change. The register, its roles and the audit events for the change are saved together, at the version the change read. If another writer saved first, the change is refused and nothing is written.
- The audit log is append only. A row cannot be changed or removed, at the database.
- The register never records a placeholder, a missing public key, or an intermediary without a named operator and review date. Those refusals come from the register's own rules.

## Roles

A caller may hold any of these roles. A role is held by one caller id; a caller may hold several.

| Role              | Used for                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `parmana-owner`   | Grants and revokes roles. Registers an action. Approves a source that can approve, and every intermediary. Revokes a source. |
| `second-approver` | Approves a new source. One of the approvals a threshold needs.                                                               |
| `source-owner`    | Proposes sources. Revokes a source.                                                                                          |
| `action-owner`    | Proposes a threshold for its action.                                                                                         |
| `risk-function`   | Approves the risk view of a high-value threshold.                                                                            |
| `gate-owner`      | Records a test for an action, and runs the go-live gate.                                                                     |
| `reviewer`        | Not used by the register. Reviewers act on the review queue.                                                                 |

Only the Parmana owner may grant or revoke a role. The last Parmana owner cannot be revoked. The first Parmana owner is set up once, at startup, from `PARMANA_POLICY_V2_BOOTSTRAP_OWNER`.

## Routes

All routes need an authenticated caller. Errors use one shape: `{ "error": "<code>", "message": "<reason>" }`, except where a route returns a body of its own.

| Method and path                                                      | Body or query                                                                           | Who may call it                                                                                           | Success                                                               |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `GET /v2/register`                                                   | none                                                                                    | any caller holding a role                                                                                 | 200: `{ sources, thresholds, actions }`                               |
| `GET /v2/register/audit`                                             | `after` (whole number, default 0), `limit` (1 to 500, default 100)                      | any caller holding a role                                                                                 | 200: `{ events, next }`                                               |
| `POST /v2/register/roles/grant`                                      | `{ callerId, role }`                                                                    | Parmana owner                                                                                             | 200: `{ granted: true }`                                              |
| `POST /v2/register/roles/revoke`                                     | `{ callerId, role }`                                                                    | Parmana owner                                                                                             | 200: `{ revoked: true }`                                              |
| `POST /v2/register/sources`                                          | a source (name, dataOwner, signer, keyId, publicKeyPem, claims, canApprove)             | source owner                                                                                              | 200: the source, pending                                              |
| `POST /v2/register/sources/:name/approve`                            | none                                                                                    | a role the register assigns for the source                                                                | 200: the source                                                       |
| `POST /v2/register/sources/:name/revoke`                             | `{ reason }`                                                                            | Parmana owner or source owner                                                                             | 200: the source, untrusted                                            |
| `POST /v2/register/thresholds`                                       | a threshold (action, name, value, unit, owner, reason, evidence, nextReview, highValue) | action owner                                                                                              | 200: the threshold, proposed                                          |
| `POST /v2/register/thresholds/:action/:name/approve`                 | none                                                                                    | a role the register assigns for the threshold                                                             | 200: the threshold                                                    |
| `POST /v2/register/actions/:capability/reviewers`                    | `{ reviewerId, maxAmount? }`                                                            | action owner or Parmana owner                                                                             | 200: the grant, active                                                |
| `POST /v2/register/actions/:capability/reviewers/:reviewerId/revoke` | `{ reason }`                                                                            | action owner or Parmana owner                                                                             | 200: the grant, revoked                                               |
| `POST /v2/register/actions/:capability/tests`                        | `{ tier }`                                                                              | gate owner                                                                                                | 200: the action, with the tier recorded                               |
| `GET /v2/register/actions/:capability/go-live`                       | none                                                                                    | any caller holding a role                                                                                 | 200: `{ missing }`, the checklist for the approved version, read only |
| `POST /v2/register/actions/:capability/go-live`                      | none                                                                                    | gate owner                                                                                                | 200: `{ live: true }`, or 422 `refused` with `missing`                |
| `POST /v2/register/policies`                                         | a policy (its `capability` and `policyVersion` are inside it)                           | action owner for the policy's action                                                                      | 200: the version, proposed                                            |
| `POST /v2/register/policies/:capability/:policyVersion/approve`      | none                                                                                    | second approver, and the Parmana owner when the policy reads a source that can approve or an intermediary | 200: the version, approved once every required approval is in         |
| `POST /v2/register/approver-keys`                                    | `{ approverId, keyId, publicKeyPem }` (Ed25519)                                         | Parmana owner                                                                                             | 200: the key, pending                                                 |
| `POST /v2/register/approver-keys/:approverId/:keyId/approve`         | none                                                                                    | second approver, not the proposer, not the approver                                                       | 200: the key, active                                                  |
| `POST /v2/register/approver-keys/:approverId/:keyId/revoke`          | `{ reason }`                                                                            | Parmana owner                                                                                             | 200: the key, revoked                                                 |
| `POST /v2/register/actions`                                          | an action (capability, owner, successor, reviewers, review settings)                    | Parmana owner                                                                                             | 200: the action                                                       |

`GET /v2/register/audit` returns the events in order. Pass the `next` value as `after` to read the next page. `next` is `null` when the page is the last one.

### Responses

| Status | Code              | When                                                                                                                                                          |
| ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `invalid_request` | The body is not a JSON object, a required field is missing or of the wrong type, `role` is not one of the roles above, or a paging parameter is out of range. |
| 401    | `unauthenticated` | No authenticated caller.                                                                                                                                      |
| 403    | `forbidden`       | The caller holds no role at all.                                                                                                                              |
| 409    | `conflict`        | Another writer saved the register first. Nothing was written. Read the register again and retry.                                                              |
| 422    | `refused`         | The register refused the change. The message gives the reason. This includes a non-owner trying to grant a role, and revoking the last Parmana owner.         |

## Policy versions

A policy version is proposed by the action owner of its action. Once proposed it cannot change: a change is a new `policyVersion`. The version must pass every validator check against the register, both when it is proposed and when it is approved, so a source or threshold that changes after the proposal stops the approval.

Approval needs a second approver, who is not the proposer. A policy that reads a source that can approve, or an intermediary, also needs the Parmana owner. A person may approve a version once. Approving the last required approval makes the version the approved one for its action, and the previous approved version becomes superseded.

A version is used for decisions only when its action has passed the go-live gate. The gate needs its owner, successor, reviewers, sources and thresholds recorded and approved, and a recorded test for each tier. Until then the version is approved but not used, and decisions for the action refuse. The gate owner records a test for each tier and runs the gate. The gate reads the sources, thresholds and tiers from the approved version, never from the request, so a request cannot leave out an item. Once the gate passes, the action is live and its approved version is used for decisions. A later change to a source or threshold that the version uses stops the version from being used at once.

The roles that propose and approve a policy version are a decision of this build, not of the design documents. The design says a policy change is a new version approved through maker-checker, and does not name the roles. These roles are open for the owner to confirm.

## Reviewer grants

The action owner or the Parmana owner grants a reviewer the right to review the action's decisions. The reviewer must be named on the action, hold the reviewer role, and not be the action's owner or successor. A grant may carry an amount limit, which must be positive. A revocation takes effect at once and needs a reason.

A grant counts only while the reviewer is still named on the action and still holds the reviewer role. A reviewer who loses either stops counting at once. Each decision reads the active grants from the register, so the review queue always reflects the register.

The routes above grant and revoke reviews. A granted reviewer decides a review item with `POST /v2/reviews/:id/decision`, with a body of `{ "decision": "approve" | "reject" }`. The queue enforces the grant, the requester exclusion, the amount limit and one decision per reviewer. A review is finished by its outcome: APPROVED or REFUSED. The decision releases nothing. A refused decision returns 422, and a stale save returns 409. The requester of a review reads its status with `GET /v2/reviews/:id`. It returns the status and the reason code, pending, approved, refused or expired. Anyone else gets 404.

## Approver keys

An approver's key is proposed by the Parmana owner. It is pending until a second approver confirms it. The confirmer must not be the proposer, and must not be the approver whose key it is. A pending key counts for no approval. A revoked key takes effect at once, and an approval signed with it is refused by name.

## Audit events

Each change adds these events to the audit log, with the caller as `by`:

- `role.bootstrap`, `role.grant`, `role.revoke`
- the events the register records for sources, thresholds, actions and approver keys, for example `source.proposed`, `source.approved`, `source.revoked`, `approver-key.proposed`, `approver-key.approved`, `approver-key.revoked`

A refused change adds no events.

## Not built here

- The role rules for approving a threshold or an action are the register's own rules. This document does not restate them.
- There is no route to read a single source, threshold or action. The list route returns all of them.
- There is no route to change the audit log, and none is planned.
