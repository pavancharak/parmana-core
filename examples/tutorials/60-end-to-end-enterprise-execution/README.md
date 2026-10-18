# Tutorial 60 — End-to-End Enterprise Execution

## Objective

In this tutorial, you'll run the complete Parmana chain in one pass — policy evaluation, signed authorization, Gateway envelope verification, request-bound attestation, session credential issuance, connector execution, credential destruction, an audit record, and a final trust record — over a single mock SAP invoice-posting transaction.

## What You'll Learn

- Evaluate a real policy with the PolicyEngine
- Produce a signed Execution Authorization
- Independently verify the Gateway envelope
- Observe the request-bound Gateway attestation concept
- Watch a session credential get issued, consumed, and destroyed inside a Secure Connector
- Read the resulting audit record
- Produce a hashed, signed trust record over the final outcome

---

## Architecture

```text
Business Transaction
        │
        ▼
Policy Evaluation (PolicyEngine)
        │
        ▼
Signed Authorization (AuthorizationSigner)
        │
        ▼
Gateway Envelope Verification (ExecutionGateway.verify)
        │
        ▼
Request-Bound Attestation (GatewayAttestationSigner, per call)
        │
        ▼
Session Credential Issue (SessionCredentialVault)
        │
        ▼
Connector Execution (SessionCredentialSecureConnector → MockConnector)
        │
        ▼
Credential Destroyed (revoke(), on every exit path)
        │
        ▼
Audit Record (ExecutionAuditSink)
        │
        ▼
Trust Record (TrustRecordHasher + ArtifactSigner)
```

---

## Running the Tutorial

```bash
npx tsx examples/tutorials/60-end-to-end-enterprise-execution/run.ts
```

---

## Expected Output

```text
==================================================
Tutorial 60 - End-to-End Enterprise Execution
==================================================
Stage 1 - Business Transaction
\--------------------------------------------------
Vendor  : VENDOR-1001
Amount  : 25000 USD
Action  : sap:post-invoice
Stage 2 - Policy Evaluation
\--------------------------------------------------
Outcome : APPROVE
Reason  : Amount within auto-approval threshold.
Stage 3 - Signed Authorization
\--------------------------------------------------
Authorization ID : b473d890-fa65-4a67-8631-a13090d158a6
Expires At       : 2026-07-11T08:58:25.785Z
Stage 4 - Gateway Envelope Verification
\--------------------------------------------------
Signature Verified          : true
Not Expired                 : true
Content Hash Matches        : true
Nonce Unseen                 : true
Stage 5 - Request-Bound Attestation
\--------------------------------------------------
Bound To Authorization : b473d890-fa65-4a67-8631-a13090d158a6
The production Gateway below mints an equivalent, fresh attestation internally, once per execute() call.
Stage 6-8 - Session Credential Issue, Connector Execution, Credential Destroyed
\--------------------------------------------------
Result : SUCCESS
Stage 9 - Audit Record
\--------------------------------------------------
Type          : execution.completed
Connector     : sap
Credential ID : 37a88802-012b-46ea-bbc3-de37281d2b53
Gateway ID    : gateway-1
Authorization : b473d890-fa65-4a67-8631-a13090d158a6
Occurred At   : 2026-07-11T08:57:25.790Z
Stage 10 - Trust Record
\--------------------------------------------------
Trust Record Hash      : 88969c3ac7ab6e5b9985881aab43693bb9d2ca16fd01bbe4d61630131b532bbd
Signature Algorithm    : ed25519
Signature (first 24)   : 85qvAPrApRUqK35ELOA2BSPF...
✓ Full chain complete: policy → authorization → envelope → attestation → session credential → connector → audit → trust record.
Tutorial completed successfully.
```

---

## A Note On Keys

This tutorial generates two independent Ed25519 keypairs in memory with generateKeyPairSync, every run — one for the Runtime's authorization signature, one for the Gateway's attestation signature. Neither is read from or written to the repository's keys/ directory, and neither depends on PARMANA_GATEWAY_KEY_ID. That in-memory pattern is for this tutorial's zero-setup reproducibility only. A real deployment sources the Gateway's attestation key the same way it sources every other Parmana signing key: from disk, via FileKeyProvider, keyed by PARMANA_GATEWAY_KEY_ID (default "gateway") — see createGatewayKeyPair.ts. Production generates no keys automatically; you provision them once, ahead of time.

---

## Why This Matters

Each of the ten stages above closes a distinct gap: policy evaluation proves the action was permitted; the signed authorization proves the Runtime approved this exact content; envelope verification proves the request wasn't forged, tampered, expired, or replayed; the request-bound attestation proves the release itself came from the Gateway's key, for this authorization specifically; the session credential proves the enterprise secret was resolved exactly once, immediately before use, and nowhere else; the audit record and trust record together let anyone — not just Parmana — verify, after the fact, exactly what happened and why it was trusted.

---

## Next Steps

Tutorials 57–60 complete the Credential Isolation milestone: the AI caller, the Runtime, and the Gateway itself never hold an enterprise credential's secret value — only the Secure Connector does, for the shortest possible window, under a request-bound, cryptographically verified release.
