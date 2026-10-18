# Tutorial 75 — Signed Audit Events

## Objective

Show that caller-authentication audit events (INC-7) — who authenticated, who was rejected, on which route — are signed with the same root of trust as every other Parmana artifact, and that tampering with one after the fact is detectable.

## What You'll Learn

- `AuditEventCrypto.sign()`/`.verify()` use the exact same signing stack and `DEFAULT_KEY_ID` as Trust Records, Receipts, and Refusal Records — one root of trust, not a separate audit-specific key
- Rewriting the recorded `callerId` after signing — attributing an authenticated call to a different identity — is caught by verification
- A `caller.rejected` event never carries the credential itself, only a `reason` — the audit trail can prove a rejection happened without ever storing the thing that was rejected

## Running the Tutorial

```bash
npx tsx examples/tutorials/75-signed-audit-events/run.ts
```

## Why This Matters

An audit trail that can be silently rewritten after the fact isn't really an audit trail. This tutorial exercises `AuditEventCrypto` directly — the same class `SupabaseCallerAuditSink` calls internally before writing a row — proving genuine events verify true and any post-signing tampering is caught, not trusted.

## Next Tutorial

Continue with **Tutorial 76 – Caller Principal Scoping**.
