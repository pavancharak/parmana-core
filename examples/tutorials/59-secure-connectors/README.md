# Tutorial 59 — Secure Connectors

## Objective

In this tutorial, you'll combine a signed Gateway attestation with a SessionCredentialSecureConnector: verifying attestation authenticity and request-binding, then walking through the connector's own enforcement — no genuine session, no execution — before a successful, fully-audited run whose session credential is destroyed immediately afterward.

## What You'll Learn

- Mint and verify a signed Gateway attestation, bound to one authorizationId
- Confirm a spoofed (wrong-key) attestation is rejected
- Confirm an attestation cannot be replayed against a different request
- Confirm a SecureConnector rejects direct invocation without a genuine, Gateway-issued session
- Execute successfully through policy, session, and credential checks
- Confirm the session credential used is destroyed immediately after execution

---

## Architecture

```text
GatewayAttestationSigner.sign(gatewayId, authorizationId, privateKey)
        │
        ▼
SignedTokenConnectorAuthenticator.authenticateGatewayForRequest()
        │
        ▼
DefaultConnectorPolicy (authenticator + GatewaySession)
        │
        ▼
SessionCredentialSecureConnector.execute()
        │
        ▼
issue() → consume() → executor.execute() → revoke()
```

---

## Running the Tutorial

```bash
npx tsx examples/tutorials/59-secure-connectors/run.ts
```

---

## Expected Output

```text
==================================================
Tutorial 59 - Secure Connectors
==================================================
Gateway Attestation
\--------------------------------------------------
Gateway ID       : gateway-1
Authorization ID : 7c85d9b3-dd5f-4bfc-b601-1bc4b4c2f3ae
Nonce            : fdfd4e80-9d78-4151-bff2-ae07349ba4b1
Issued At        : 2026-07-11T08:53:00.640Z
✓ Authenticates for its own authorizationId: true
Spoofed Attestation Rejected
\--------------------------------------------------
✗ Accepted: false
Attestation Replayed Against A Different Request
\--------------------------------------------------
✗ Accepted for "authorization-999": false
Direct Invocation Without A Genuine Session
\--------------------------------------------------
✓ Rejected:
  Connector rejected invalid, expired, modified, or reused Gateway session.
Successful Execution
\--------------------------------------------------
Result: SUCCESS
Audit Record:
  type          : execution.completed
  connectorId   : sap
  credentialId  : b7802fbf-e63d-47e1-ba02-331422943388
  gatewayId     : gateway-1
Credential Destroyed After Execution
\--------------------------------------------------
✓ The session credential the connector used is already destroyed:
  Session credential has been revoked: b7802fbf-e63d-47e1-ba02-331422943388.
Tutorial completed successfully.
```

---

## Why This Matters

A SecureConnector's own frozen attestation proves the connector was configured with material signed by the Gateway's key — it does not, by itself, prove any individual call originated from the Gateway, since the same value is reused for every execution the connector ever handles. That is why the connector's real protection against a forged or replayed call is the single-use, Gateway-issued GatewaySession, not the attestation alone — and why the audited credentialId can be used to prove, after the fact, that the exact session credential the connector consumed no longer resolves to anything.

---

## Next Tutorial

Continue with **Tutorial 60 – End-to-End Enterprise Execution**, which runs the complete chain — policy, signed authorization, Gateway envelope verification, request-bound attestation, session credential, connector execution, audit, and trust record — in one pass.
