# Tutorial 57 — Credential Isolation

## Objective

In this tutorial, you'll observe Parmana's core credential-isolation invariant directly: the caller of an execution — an AI agent, the Runtime, or the Gateway — never possesses an enterprise credential's secret value. Only a single-use, time-bounded session lease is ever visible outside the Secure Connector boundary.

## What You'll Learn

- Store a raw enterprise credential in a CredentialVault
- Wrap it in a SessionCredentialVault for single-use, time-bounded leasing
- Issue a session credential and confirm it carries no secret material
- Consume a session credential to resolve the secret exactly once
- Confirm reuse of a consumed session credential is rejected
- Confirm consumption after explicit revocation is rejected

---

## Architecture

```text
CredentialVault (raw secret)
        │
        ▼
SessionCredentialVault.issue()
        │
        ▼
SessionCredential (id + timestamps only)
        │
        ▼
SessionCredentialVault.consume() — the secret appears here, once
        │
        ▼
revoke() — destroyed
```

---

## Running the Tutorial

```bash
npx tsx examples/tutorials/57-credential-isolation/run.ts
```

---

## Expected Output

```text
==================================================
Tutorial 57 - Credential Isolation
==================================================
Underlying Credential Vault
\--------------------------------------------------
✓ Enterprise credential stored for connector "sap".
Issuing A Session Credential
\--------------------------------------------------
Session Credential ID : 13937eda-239d-405d-bd0d-169628444417
Connector              : sap
Authorization           : authorization-001
Issued At               : 2026-07-11T08:50:39.945Z
Expires At              : 2026-07-11T08:51:09.945Z
✓ No credential secret appears above — only identifiers and timestamps.
Consuming The Session Credential (inside the Secure Connector)
\--------------------------------------------------
✓ Secret resolved for exactly this execution.
  Resolved value keys: apiKey
Reuse Rejection
\--------------------------------------------------
✓ Reuse rejected:
  Session credential has already been used: 13937eda-239d-405d-bd0d-169628444417.
Explicit Revocation
\--------------------------------------------------
✓ Consumption after revocation rejected:
  Session credential has been revoked: ac988a7d-eecf-4c42-ad5c-cb620ffe4b93.
Tutorial completed successfully.
```

---

## Why This Matters

A credential that lives for the whole session, or that an AI agent can read directly, is a credential that can leak, be logged, or be replayed outside its intended execution. Parmana's SessionCredentialVault only ever hands out an opaque identifier and a time window — the underlying value is resolved fresh, inside the Secure Connector, exactly once, and is unreachable before or after that single moment.

---

## Next Tutorial

Continue with **Tutorial 58 – Session Credentials**, which explores the full issue → expire → reuse → revoke lifecycle in more depth, including real time-based expiry.
