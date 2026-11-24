# RFC-0032 — Tenant isolation: one deployment, many organizations

Status: Draft. Design only. No code. Requires owner review and a security review before implementation.

Supersedes the tenant part of RFC-0031. RFC-0031's standing-approval part is unchanged.

Author: (design session), pending owner review

Created: 2026-11-24

---

# Summary

One Parmana deployment serves several organizations (tenants). Each tenant's policies, approvals, checkers, signing keys, records and evidence log are separate from every other tenant's, enforced in the application and in the database. A deployment with one tenant behaves as it does today.

# Motivation

A public GitHub App, installed by many organizations, needs one Parmana to serve them without one deployment per organization. Running a deployment per organization does not scale, so tenant separation has to exist in the product.

# Current state (checked against `origin/main`)

- **No tenant column or tenant filter** exists in `packages/storage` or in `packages/policy`'s router. Every table and every lookup is deployment-wide.
- **Tenant ids exist only on API keys** (`allowedTenantIds`) and as a request's `metadata.tenantId`. A key may act only for the tenant ids it lists, and a request for another tenant is refused with `403 TENANT_NOT_ALLOWED`. This is an authorization check, not data separation.
- **Per-tenant signing keys exist, but are not a switch.** `FileTenantKeyResolver` signs for a tenant only when a key has been provisioned for that tenant id; otherwise the default key signs.
- **Policy checkers are per policy name, per deployment** (`POLICY_CHANGE_CHECKERS`).
- **Migrations create about 40 tables**, several later dropped. The governed set in Section 4 is to be confirmed by a full inventory in phase 1.

# Goals

1. A query for one tenant returns no rows of another tenant, through the application and the database.
2. A checker for one tenant cannot approve, reject or read another tenant's changes.
3. Every governed action is signed with that tenant's own key. No shared key signs a governed action.
4. A tenant's evidence log is independent, exportable and verifiable on its own.
5. A deployment with one tenant has the same behaviour and records as today.

# Non-goals

- Standing approvals (RFC-0031).
- The multi-installation GitHub signal source (in `parmana-connectors`).
- Billing.
- Protecting a tenant from a compromised deployment host. The host holds keys; separating those is a separate design.

# Design

## 1. Tenant identity

- A **tenant** is a row in a new `tenants` table: `tenant_id` (lowercase letters, digits and hyphens, 3 to 63 characters, unique), a display name, a status (`active` or `suspended`), and the creation time.
- A tenant is created through the maker and checker flow, approved by a deployment-level operator, not by the tenant itself.
- A request's tenant comes from the API key's `allowedTenantIds`, and from `metadata.tenantId`. A request with no tenant id is refused in a multi-tenant deployment. In a single-tenant deployment, a fixed default tenant applies.
- A suspended tenant is refused on every request, and its keys stop working.

## 2. Scoping every governed table

Each governed table gets a non-null `tenant_id` column that references `tenants`:

| Group | Tables (to be confirmed) |
| --- | --- |
| Policy governance | `policies`, `pending_policy_changes`, `policy_change_approval_records`, `consumed_policy_change_step_up_nonces`, `policy_v` |
| Approvals and nonces | `consumed_approval_nonces`, `consumed_nonces`, `approval_issuers`, `approval_issuer_changes` |
| Decisions and evidence | `business_transactions`, `execution_intents`, `execution_trust_records`, `execution_outcomes`, `execution_audit_events`, `caller_audit_events`, `transaction_status_events`, `verifications`, `receipts`, `challenge_records` |
| Refusals | `refusal_records`, `refusal_record_outbox`, `inbound_decisions`, `inbound_outcomes` |
| Connectors and sources | `external_connectors`, `external_connector_changes`, `business_signal_sources`, `business_signal_source_changes`, `authority_grants`, `authority_grant_changes` |
| Keys | `caller_key_revocations` |

Each table's unique keys become `(tenant_id, existing key)`. For example, a policy is unique on `(tenant_id, name, version)`, and a consumed nonce on `(tenant_id, nonce)`. A nonce unique across tenants would let one tenant's use block another's, so nonces are per tenant.

## 3. Database enforcement

- **Row-level security** on every governed table, with a policy that matches `tenant_id` to a session setting set by the application for each request. A query with no tenant setting returns no rows.
- The application sets the session tenant from the authenticated request, not from the body. Every storage method takes the tenant as a required argument; a method without it does not compile.
- Migrations add `tenant_id` with a default of the deployment's single tenant, so existing rows are kept, then the default is removed.

## 4. Policies

- A policy version is keyed by `(tenant_id, name, version)`. Two tenants may each hold `github-pr-approval` 1.2.0, with separate approval state.
- `PolicyRouter` loads by tenant, name and version. A request names its version; the version must be in effect for its tenant.
- The loader (`scripts/apply-policies-table-and-backfill.ts`) takes a tenant argument. A tenant's policy folder is loaded into that tenant only.

## 5. Checkers and approvals

- `POLICY_CHANGE_CHECKERS` becomes per tenant: a map of tenant to policy name to checker ids. A checker not listed for a tenant and policy gets `403 CHECKER_NOT_IN_SCOPE`.
- A proposal, approval and rejection record the tenant. An approval record is valid only for the tenant it names. The chain (`prevEntryHash`) is per tenant.
- Export and verification run per tenant, each with its own governance folder (PR #775 already takes the folder as a setting).

## 6. Keys

- Each tenant has its own signing key. With AWS KMS, the key is `alias/tenant/<tenant_id>`, which the existing KMS signer already maps to `tenant.<id>`. With local keys, the key file is per tenant.
- A governed action (an approval, a release, a refusal record) is signed only with the tenant's own key. If a tenant has no provisioned key, the action is refused. There is no fallback to the default key for governed actions.
- Caller keys are limited to their tenants by `allowedTenantIds`, as today.

## 7. Evidence

- Every record carries its `tenant_id`, and each tenant's log is exportable on its own.
- A record's signature covers its tenant id, so a record moved to another tenant fails verification.

## 8. Single-tenant deployments

A deployment with one tenant uses a default tenant id. Its data, keys and records are the same as today, apart from the added column. The existing per-organization model is this case, so it keeps working unchanged.

# Migration plan

1. **Inventory.** List every governed table and every query against it, in `packages/storage`. Confirm the set in Section 2 and record the result in this RFC.
2. **Add `tenants` and the `tenant_id` column**, with a default tenant. Existing deployments change nothing else.
3. **Scope the storage methods** by tenant, behind the default tenant. Tests show a single-tenant deployment behaves as before.
4. **Row-level security**, with tests that one tenant cannot read another's rows.
5. **Per-tenant policies, checkers and keys.**
6. **Per-tenant export and verification.**
7. **Enable multi-tenant** for a deployment, after a security review of steps 4 and 5.

Each step is merged on its own, and the single-tenant deployment is tested after each.

# Threat model

| Threat | Mitigation |
| --- | --- |
| A request reads another tenant's rows | Session-scoped row-level security, and tenant as a required storage argument |
| A checker of one tenant approves for another | Checkers scoped per tenant; approval records bound to their tenant |
| A tenant's approval is replayed in another tenant | Record signed over its tenant id; nonces unique per tenant |
| A governed action is signed with a shared key | No fallback to the default key for governed actions |
| A tenant's key is used for another tenant | Keys per tenant; `allowedTenantIds` on caller keys |
| A tenant id is spoofed in the request body | Tenant from the authenticated key, then checked against the key's list |
| A suspended tenant keeps acting | Suspension refused on every request, and keys stop working |
| The deployment host is compromised | Out of scope here. Keys held in KMS reduce the exposure; see Section 6. |

# Tests

- For each governed table: a query under tenant A returns no rows of tenant B, through the application and through row-level security.
- A checker for tenant A is refused for tenant B, with `CHECKER_NOT_IN_SCOPE`.
- A record signed for tenant A fails verification when presented as tenant B.
- A governed action with no provisioned tenant key is refused, and does not use the default key.
- A single-tenant deployment produces the same records as before the change.
- A suspended tenant is refused on every route.

# Acceptance criteria

- The inventory is complete, and recorded in this RFC.
- Every governed query takes a tenant, and row-level security is enabled on every governed table.
- The isolation tests above pass, in CI, against a real database.
- A security review of the storage and key changes is recorded, with its findings.

# Open questions

1. **Tenant limits.** Is there a maximum number of tenants per deployment, and what happens to performance as it grows?
2. **Default tenant name.** What id does a single-tenant deployment use?
3. **Tenant deletion.** Are a tenant's records ever deleted, and if so, who may approve it? The approval log is evidence, so the default is that records are never deleted.
4. **Cross-tenant reads for operators.** Can a deployment operator read a tenant's records, and under what approval?
5. **Migration of an existing multi-organization deployment**, if one ever exists. None is known today.
