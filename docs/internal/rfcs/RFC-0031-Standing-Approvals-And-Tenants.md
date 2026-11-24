# RFC-0031 — Standing approvals and tenants

Status: Draft, approved in principle by the owner for design. No code yet.

Author: (design session), pending owner review

Created: 2026-11-24

---

# Summary

Two changes to how Parmana scopes approvals, decided together because they touch the same records:

1. **Standing approvals.** A checker approves, once, a rule that covers many actions within a repository, for example "merges to non-production paths in this repository, under this policy version." Each merge is then checked against that standing approval, and the merge is still recorded.
2. **Tenants.** One Parmana deployment serves many organizations. Each organization is a tenant, and its policies, approvals, checkers, keys and records are kept apart from every other tenant's.

Per-organization deployments keep working unchanged. A deployment with one tenant behaves exactly as today.

# Motivation

- Requiring a person to approve every pull request makes the App slow for routine work, so people stop using it. Approving only production paths, and approving a rule once per repository, keeps the control where the risk is.
- A public GitHub App that many organizations install needs one deployment that can serve them without sharing their records.

# Current model

- An approval names one target, a single pull request at a single head commit, and is signed and chained.
- A policy version is in effect per deployment. Approval records are per deployment.
- A checker approves for the deployment they belong to. There is one set of policies and checkers per deployment.
- The validator refuses any approve rule that does not require a signed approval (`PolicyValidator.validateEveryApprovalNeedsSignedApproval`). This invariant is kept.

# Design: standing approvals

## What a standing approval is

A signed approval whose subject is a **scope**, not a single pull request:

- `repository`: `owner/repo`
- `pathRule`: a version of the production-paths list, identified by its content hash
- `policy`: the name and version of the policy it applies to
- `action`: the capability it covers, for example `github:pr-merge`
- `validFrom`, `validUntil`: a time window
- `approvedBy`, `signature`: the checker's signed approval, as for any approval

It covers a merge only when all of these hold at merge time:
1. The pull request's repository matches.
2. The changed files match the path rule, and no file matches it as production. (A merge that touches production paths is not covered, and still needs a per-pull-request approval.)
3. The policy version and the path rule are the ones named.
4. The current time is inside the window.
5. The standing approval has not been revoked.

## Where the check happens

The policy evaluates the four GitHub facts as today. It also evaluates a fifth sourced fact, `pr.touches-production`, from the signal source. The approve rule then has two branches, each requiring a signed approval:
- a per-pull-request approval (as today), for any merge; or
- a standing approval whose scope matches, and `pr.touches-production` is false.

The validator invariant is kept: both branches require a signed approval. Nothing is approved without one.

## Revocation

A standing approval can be revoked by a checker, through the same maker and checker flow. A revoked approval stops matching at once. Revocation is recorded in the approval log.

## Evidence

Every merge records which approval it used: the per-pull-request approval id, or the standing approval id, together with the policy version and the path rule hash. A merge with no matching approval is refused and recorded as a refusal.

# Design: tenants

## Model

- A **tenant** is one organization. It has an id, its own API keys (`allowedTenantIds`), its own checkers, its own signing keys, and its own policy and approval state.
- Every governed table carries a `tenant_id` column: policy versions, pending changes, approval records, consumed nonces, refusal records, external connector registrations, and the outbox.
- A request names its tenant (`metadata.tenantId`). The key must be allowed that tenant. A request for another tenant is refused with `403 TENANT_NOT_ALLOWED`, as today.

## Isolation

- **Database.** Rows are filtered by tenant in every query, and row-level security enforces the same rule in the database. A query without a tenant returns nothing.
- **Policies.** A policy version is keyed by tenant, name and version. Two tenants may each have `github-pr-approval` 1.2.0 with separate approval state.
- **Checkers.** `POLICY_CHANGE_CHECKERS` becomes per tenant. A checker approves only for their own tenant.
- **Keys.** Each tenant signs with its own key. A governed action never falls back to a shared key. A tenant without a provisioned key is refused.
- **Approval log.** One log per tenant, exported and verified separately.

## Standard approval path

Maintainers approve a standard policy once, as a tenant-independent approval. Each tenant accepts it by reference. The standard approval is signed by a maintainer checker whose key is trusted by every tenant that opts in. Each tenant still records its own acceptance.

# Threat model

| Threat | Mitigation |
| --- | --- |
| A checker of one tenant approves for another | Checkers are scoped per tenant, and the approval records the tenant |
| A query reads another tenant's rows | Tenant filter in every query, and row-level security in the database |
| A standing approval covers a production merge | The path rule is checked against the changed files, and a production match requires a per-pull-request approval |
| The path list is changed in the pull request it governs | The list is read from the base branch, not the pull request |
| The path list is missing or unreadable | Treated as production, so the approval requirement applies |
| A revoked standing approval still matches | Revocation is checked at merge time, and recorded |
| A shared key signs a tenant's approval | No shared key for governed actions, and a missing tenant key is a refusal |

# Migration plan

1. **Tenant columns, with a default tenant.** Existing deployments get one tenant, which holds all current rows. Behaviour is unchanged.
2. **Row-level security by tenant**, with tests that show one tenant cannot read another's rows.
3. **Per-tenant checkers and keys.**
4. **Standing approvals**, in a deployment with one tenant first.
5. **Standard approval path**, then the shared deployment for more than one tenant.

Each step ships with its own tests, and the per-organization deployment is checked after each step.

# Tests

- For each governed table: rows are invisible across tenants, through the application and through row-level security.
- A standing approval matches only the scope it names, and stops matching after revocation or when its window ends.
- A merge that touches a production path is refused without a per-pull-request approval, even with a standing approval.
- A checker cannot approve for another tenant.
- A single-tenant deployment behaves as it does today.

# Open questions

1. **Standing approval length.** Should a standing approval expire by default, and after how long?
2. **Path list changes.** Does a new path list need its own standing approval, or does a new version of it automatically invalidate the old approval?
3. **Standard policy trust.** Which maintainer keys are trusted by default, and how are they rotated?
4. **Tenant creation.** Who may create a tenant, and does creation need a checker's approval?

# Not in this RFC

- The GitHub App install flow and the public GitHub setup page. Those are in `parmana-connectors`.
- Billing. Nothing in the code plans, meters or charges for use.
