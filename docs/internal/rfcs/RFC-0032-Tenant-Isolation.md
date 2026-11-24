# RFC-0032 — Tenant isolation: one deployment, many organizations

Status: Draft, revision 2. Design only. No code. Requires owner review and a security review before implementation.

Revision 2 (2026-11-24) corrects revision 1 after review. The changes are listed in "Changes from revision 1" at the end.

Supersedes the tenant part of RFC-0031. RFC-0031's standing-approval part is unchanged.

Author: (design session), pending owner review

---

# Summary

One Parmana deployment serves several organizations (tenants). Each tenant's policies, approvals, checkers, signing keys, records and evidence log are separate from every other tenant's. Separation is enforced in the application, and in the database by row-level security that the application cannot bypass. A deployment with one tenant behaves as it does today.

# Motivation

A public GitHub App installed by many organizations needs one Parmana to serve them. One deployment per organization does not scale, so tenant separation has to be part of the product.

# Current state

Checked against `origin/main`, in `packages/storage`, `packages/policy/src/PolicyRouter.ts` and `packages/shared/src/repositories`:

- **No tenant column or tenant filter** exists on those paths. Every lookup is deployment-wide.
- **Tenant ids exist elsewhere, in limited ways.** API keys carry `allowedTenantIds`, and a request carries `metadata.tenantId`. The runtime and the API reference tenants in some places (for example the per-tenant signing key resolver). None of these separates stored data.
- **Per-tenant signing keys exist, but are not a switch.** `FileTenantKeyResolver` signs for a tenant only when a key has been provisioned for that tenant id; otherwise the default key signs.
- **Policy checkers are per policy name, per deployment** (`POLICY_CHANGE_CHECKERS`).
- **Row-level security is enabled** by 42 migration statements, and `FORCE ROW LEVEL SECURITY` appears once in the migrations. The application's own database role is currently the table owner, and table owners bypass row-level security unless it is forced.

# Goals

1. A query for one tenant returns no rows of another tenant, in the application and in the database, even if application code has a bug.
2. A checker for one tenant cannot approve, reject or read another tenant's changes.
3. Every governed action is signed with that tenant's own key. No shared key signs a governed action.
4. A tenant's evidence log is independent, exportable and verifiable on its own.
5. Existing signed records keep verifying. A deployment with one tenant behaves as it does today.

# Non-goals

- Standing approvals (RFC-0031).
- The multi-installation GitHub signal source (in `parmana-connectors`).
- Billing.
- Protecting a tenant from a compromised deployment host. That is a separate design, and this RFC only reduces the exposure (Section 6).

# Design

## 1. Tenant identity

- A **tenant** is a row in a new `tenants` table: `tenant_id` (lowercase letters, digits and hyphens, 3 to 63 characters, unique), a display name, a status (`active` or `suspended`), and the creation time.
- **Creating a tenant** is a governed change. It is proposed and approved through the maker and checker flow, by a checker of the deployment, and it is recorded in the deployment's log. A tenant cannot create itself.
- A request's tenant comes from the authenticated key's `allowedTenantIds` and the request's `metadata.tenantId`. A request with no tenant id is refused in a multi-tenant deployment. A single-tenant deployment uses its default tenant (Section 8).
- A **suspended** tenant is refused on every route, and its keys stop working. Suspension is a governed change, approved the same way.

## 2. Scoping every governed table

Each governed table gets a non-null `tenant_id` column referencing `tenants`. The inventory below is the set to confirm in phase 1. It was built from the migrations on `origin/main`, and it is not yet complete (see phase 1).

| Group | Tables |
| --- | --- |
| Policy governance | `policies`, `pending_policy_changes`, `policy_change_approval_records`, `consumed_policy_change_step_up_nonces` |
| Policy v2 | `policy_v2_state`, `policy_v2_nonces`, `policy_v2_audit`, `policy_v2_delivery_events`, `policy_v2_evidence` |
| Approvals and nonces | `consumed_approval_nonces`, `consumed_nonces`, `approval_issuers`, `approval_issuer_changes` |
| Decisions and evidence | `business_transactions`, `execution_intents`, `execution_trust_records`, `execution_outcomes`, `execution_audit_events`, `executions`, `caller_audit_events`, `transaction_status_events`, `verifications`, `receipts`, `challenge_records` |
| Refusals | `refusal_records`, `refusal_record_outbox`, `inbound_decisions`, `inbound_outcomes` |
| Connectors and sources | `external_connectors`, `external_connector_changes`, `business_signal_sources`, `business_signal_source_changes`, `authority_grants`, `authority_grant_changes` |
| Keys and revocations | `caller_key_revocations` |

Tables already dropped by later migrations (for example `overrides` and the Razorpay tables) are excluded, and the inventory records each exclusion.

Each table's unique keys become `(tenant_id, <existing key>)`. For example, a policy is unique on `(tenant_id, name, version)`, and a consumed nonce on `(tenant_id, nonce)`. Nonces are per tenant, so one tenant's use cannot block another's.

## 3. Database enforcement

The database enforces the separation, not only the application.

- **A non-owner application role.** The Parmana service connects as a role that does not own the governed tables, and has only the privileges it needs. Migrations run as the owner, through a separate role. This is required, because a table owner bypasses row-level security.
- **Forced row-level security.** Every governed table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`, so the owner is subject to it too.
- **A tenant setting inside each transaction.** The application sets the tenant with `SET LOCAL` (or `set_config(..., true)`) at the start of every transaction, from the authenticated request. A setting made per session is not used, because a transaction-mode connection pooler can lose it between requests. The repository's own documentation already warns about this for `PARMANA_DB_SCHEMA`.
- **No tenant, no rows.** A query in a transaction with no tenant setting returns no rows, and writes are refused.
- **Storage methods require a tenant.** Every storage method takes the tenant as a required argument. A method without one does not compile.
- **Migrations** add `tenant_id` with the default tenant's id as the default, backfill existing rows, then remove the column default, so new rows must name a tenant.

## 4. Policies

- A policy version is keyed by `(tenant_id, name, version)`. Two tenants may each hold `github-pr-approval` 1.2.0, with separate approval state.
- `PolicyRouter` loads by tenant, name and version. A request names its version, which must be in effect for its tenant.
- The loader (`scripts/apply-policies-table-and-backfill.ts`) takes the tenant as an argument. A tenant's policy folder is loaded into that tenant only.
- **Standard policies** (RFC-0031's standard approval path) are accepted by each tenant by reference. A tenant's acceptance is a governed record in that tenant's log.

## 5. Checkers and approvals

- `POLICY_CHANGE_CHECKERS` becomes per tenant: tenant, then policy name, then checker ids. A checker not listed for a tenant and policy gets `403 CHECKER_NOT_IN_SCOPE`.
- A proposal, approval and rejection record their tenant. An approval is valid only for the tenant it names. The hash chain (`prevEntryHash`) is kept per tenant.
- Export and verification run per tenant, each over its own governance folder. PR #775 already takes the folder as a setting.

## 6. Keys

- Each tenant has its own signing key. With AWS KMS it is `alias/tenant/<tenant_id>`, which the KMS signer already maps to the logical key `tenant.<id>`. With local keys, each tenant has its own key file.
- **The default tenant's key is the deployment's default key.** That is the key a single-tenant deployment uses today. It is named explicitly as the default tenant's key in the tenant table, so a single-tenant deployment keeps signing as it does now.
- **Every other tenant must have its own provisioned key.** A governed action for a tenant with no provisioned key is refused. A tenant never falls back to the default key, or to another tenant's key.
- Keys are held in KMS where possible, which reduces what a compromised host can read (Section 9).

## 7. Evidence, and existing records

- Every record carries its `tenant_id`, and each tenant's log is exported on its own.
- **Records signed before this change keep verifying.** A record written before the migration was signed without a tenant id. Verification therefore accepts two signed forms: the original form, for records created before the migration (all belonging to the default tenant), and the tenant-bound form, for records created after it. The form is recorded in each record, so the verifier never guesses. A record's tenant-bound signature covers its tenant id, so a record presented as another tenant fails verification.
- No existing signature is rewritten. The migration adds a column; it does not re-sign history.

## 8. Single-tenant deployments

A deployment with one tenant uses a default tenant, with a fixed id (open question 2). Its data is the same as today, apart from the added column. Its key is the default key, its policies are the existing ones, and its records keep their existing signatures. The existing per-organization model is this case, and it keeps working unchanged.

# Migration plan

1. **Inventory.** Enumerate every governed table, including `executions` and the `policy_v2_*` tables, and every query against them in `packages/storage`. Record the confirmed set and the excluded (dropped) tables in this RFC.
2. **Roles.** Create the non-owner application role, and the owner role for migrations. Grant only the privileges the service needs. No behaviour changes yet.
3. **Add `tenants` and `tenant_id`**, with the default tenant backfilled. Existing deployments change nothing else.
4. **Scope the storage methods** by tenant, with the default tenant in use. Tests show a single-tenant deployment behaves as before.
5. **Forced row-level security**, with tests that one tenant cannot read another's rows, through the application and through the database.
6. **Per-tenant policies, checkers and keys**, including the standard policy acceptance.
7. **Per-tenant export and verification**, including the two signed forms in Section 7.
8. **Enable multi-tenant** for a deployment, after a security review of steps 2, 5 and 6.

Each step is merged on its own, and the single-tenant deployment is tested after each.

# Threat model

| Threat | Mitigation |
| --- | --- |
| A query reads another tenant's rows | Forced row-level security under a non-owner role, and a required tenant argument in storage |
| The application's owner role bypasses isolation | The application does not connect as the owner; forced row-level security applies to the owner as well |
| A pooled connection keeps another tenant's setting | The tenant is set inside each transaction, not per session |
| A checker of one tenant approves for another | Checkers scoped per tenant; approvals bound to their tenant |
| A tenant's record is presented as another tenant's | The tenant-bound signature covers the tenant id, so it fails verification elsewhere |
| A governed action is signed with a shared key | No fallback; a tenant without its own key is refused |
| A tenant id is spoofed in the request body | The tenant comes from the authenticated key, then is checked against that key's list |
| A suspended tenant keeps acting | Suspension is refused on every route, and its keys stop working |
| Existing signatures are broken by the change | No history is re-signed; both signed forms are verified, and the form is recorded |
| The deployment host is compromised | Out of scope here. KMS-held keys reduce the exposure. |

# Tests

- For each governed table: a query under tenant A returns no rows of tenant B, through the application and through the database under the non-owner role.
- The owner role, with no tenant setting, cannot read governed rows, because forced row-level security applies to it.
- A transaction with no tenant setting returns no rows and refuses writes.
- Two requests on one pooled connection, for different tenants, each see only their own rows.
- A checker for tenant A is refused for tenant B, with `CHECKER_NOT_IN_SCOPE`.
- A record signed for tenant A fails verification when presented as tenant B.
- A governed action for a tenant with no provisioned key is refused, and does not use the default key.
- A record signed before the migration still verifies, as the default tenant's record.
- A single-tenant deployment produces the same records as before the change.
- A suspended tenant is refused on every route.

# Acceptance criteria

- The inventory is complete, and recorded in this RFC.
- The application connects as a non-owner role, and every governed table has forced row-level security.
- Every governed query takes a tenant, and transactions set it.
- The isolation tests pass in CI against a real database.
- Existing signed records verify after the migration.
- A security review of the roles, the storage changes and the key changes is recorded, with its findings.

# Open questions

1. **Tenant limits.** Is there a maximum number of tenants per deployment, and what happens to performance as it grows?
2. **Default tenant id.** What fixed id does a single-tenant deployment use?
3. **Deletion.** Are a tenant's records ever deleted? The default is no: the log is evidence, so records are kept. Any deletion would itself be a governed change.
4. **Operator access.** Can a deployment operator read a tenant's records, and under what approval?
5. **Existing multi-organization deployments.** None is known to exist, so the migration assumes one default tenant per existing deployment.

# Changes from revision 1

- **Row-level security:** the application now connects as a non-owner role, with forced row-level security on every governed table (Section 3, threat model, tests). Revision 1 assumed the owner was subject to it.
- **Pooling:** the tenant is set inside each transaction, not per session (Section 3, tests).
- **Inventory:** `executions` and the `policy_v2_*` tables are added, the incorrect `policy_v` is removed, and dropped tables are excluded explicitly (Section 2, migration step 1).
- **Existing signatures:** both signed forms are verified, and no history is re-signed (Section 7, migration step 7, tests).
- **Default key:** the default tenant's key is the default key, named explicitly. Other tenants have their own keys and never fall back (Section 6).
- **Current state:** the check is scoped to the paths examined, and the existing tenant references are described (Current state).
- **Standard policies:** linked to RFC-0031's standard approval path (Section 4).
- **Tenant creation:** a governed change approved through the maker and checker flow, reconciled with open question 3 (Section 1).
