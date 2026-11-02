# ADR-0020: The authority object extends AuthorityGrant

**Status:** Proposed. Not accepted. Written for the operator to accept or change. No code changes until accepted.

**Relates to:** `docs/architecture/BUSINESS-AUTHORITY-BLUEPRINT.md` (phase 1, section 10); `docs/rfcs/` RFC-0023 (per-agent authority, phase 3); `packages/shared/src/domain/authority-grant.ts`; `packages/policy/src/types/Policy.ts` (`requireAuthorityGrant`).

## Context

The blueprint says authority should be a first-class, versioned object. The code already has one part of it.

`AuthorityGrant` (`packages/shared/src/domain/authority-grant.ts`) records:

- `callerId` and `capability` (`namespace:verb`), so one grant covers one caller for one capability;
- optional `limits`, keyed by Intent path (for example `parameters.amountInr`);
- `validFrom` and `validUntil`, and a `status` of `active` or `revoked`;
- `grantedAt`, and `revokedByChangeId` and `revokedAt` on revoke.

A grant is created only by an approved `AuthorityGrantChange` (action `grant` or `revoke`). The change needs one proposer and a different approver, and neither may be the caller the authority is granted to.

A policy decides a request on this basis only when it sets `requireAuthorityGrant`. When that flag is absent or false, the policy's other checks decide, and no grant is consulted. The refusal reasons for the grant path are `NOT_AUTHORIZED`, `AUTHORITY_EXPIRED`, `AUTHORITY_UNCLEAR` and `AUTHORITY_REQUIRED`.

What is missing for the blueprint's phase 1:

- **No organisation-level object.** Authority is per caller and per capability. There is no single record of what an organisation has authorised across agents, applications and people.
- **No delegation.** A grant cannot say that one caller may pass part of its authority to another.
- **No link from a decision to a grant version.** The blueprint requires each decision to name the authority version it used. We have not verified that a decision record names the grant ID or version it relied on.
- **Authority is opt-in per policy.** Nothing requires every action to have an authority object.

## Options

**A. Extend `AuthorityGrant`.** Keep per-caller grants as the authority object. Add the missing pieces one at a time: a decision link to `grantId` and its change, and a required-authority flag at a higher level. Smallest change; reuses maker-checker and limits; does not yet cover the organisation level.

**B. A new organisation-level authority object** that contains or references grants, policies and approvals. Covers the blueprint's full scope. Needs a design for delegation and versioning, and a migration of existing grants. Largest change, and the most design risk.

**C. Keep grants and add a read-only view** that shows an organisation's authority across grants and policies. No new write path. Helps reporting, but does not make authority enforceable at the organisation level.

## Decision (proposed)

Option A now. Each grant stays the unit of authority. Two additions are proposed, in this order:

1. **Decision link.** Every decision that consults a grant records the `grantId` and the change that created it. Without this, the verifier cannot show which authority a decision used. This is the smallest step that makes the blueprint's evidence chain true for grants.
2. **Required authority.** A policy-level or organisation-level setting that makes `requireAuthorityGrant` the default for listed capabilities, so authority cannot be skipped by omitting a flag.

Option B is deferred. It should be revisited only after a customer needs authority across more than one capability or caller, and after delegation has a concrete use case.

## Consequences

- Existing grants, changes and the policy flag keep working unchanged.
- The decision link adds a field to decision records. This is a change to the evidence format, so it needs a schema-version decision and tests against the verifier before it ships.
- Option A does not give the organisation-wide view the blueprint describes. The blueprint should keep that as a planned item until B or C is chosen.

## Open questions

1. Should the decision link be a new field in the signed decision record, or a separate linked record? A new field changes the signed bytes; a separate record needs its own integrity link.
2. Should "required authority" be set per policy, per capability, or per organisation?
3. Does delegation belong in this ADR, or in a later one for option B?

## Not in scope

- Changing the signing or hashing format for existing records.
- Enforcement at business systems that are called directly (G-129, RFC-0024).
- The authority compiler, which is not designed here.
