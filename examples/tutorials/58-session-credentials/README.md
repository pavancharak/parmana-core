# Tutorial 58 — Session Credentials

## Objective

In this tutorial, you'll exercise the full session-credential lifecycle: issue, consume within the lifetime window, expire, reuse rejection, and explicit revocation — using a real one-second lifetime and a real delay, so expiry is something you actually observe happen rather than simulate.

## What You'll Learn

- Issue a session credential with a short, real lifetime
- Consume it successfully within the lifetime window
- Observe a genuine, time-based expiry rejection
- Confirm a consumed session credential cannot be reused
- Confirm a revoked session credential cannot be consumed

---

## Architecture

```text
issue() ──► consume() within lifetime  → secret resolved once
issue() ──► wait past lifetimeMs ──► consume()  → rejected: expired
issue() ──► consume() ──► consume() again        → rejected: already used
issue() ──► revoke() ──► consume()                → rejected: revoked
```

---

## Running the Tutorial

```bash
npx tsx examples/tutorials/58-session-credentials/run.ts
```

---

## Expected Output

```text
==================================================
Tutorial 58 - Session Credentials
==================================================
Happy Path
\--------------------------------------------------
Issued  : b3854e32-a2d7-4bcd-aacf-68dc060d2aec
Consumed: token
✓ Consumed within the lifetime window.
Expiry
\--------------------------------------------------
Issued at : 2026-07-11T08:51:14.253Z
Expires at: 2026-07-11T08:51:15.253Z
Waiting past the 1-second lifetime...
✓ Consumption after expiry rejected:
  Session credential has expired: cd1a0379-04b2-443e-b24f-f1d9615af3c4.
Reuse
\--------------------------------------------------
✓ First consumption succeeded.
✓ Second consumption rejected:
  Session credential has already been used: dcfebec7-522e-40d0-974f-cf7c6e746184.
Revocation
\--------------------------------------------------
✓ Session credential revoked before use.
✓ Consumption after revocation rejected:
  Session credential has been revoked: eee06567-6e30-42b7-9e54-d1d270040387.
Tutorial completed successfully.
```

---

## Why This Matters

Every one of these four rejection modes closes a distinct attack window: expiry bounds how long a captured session lease is useful, single-use prevents a lease from being replayed, and revocation lets a caller destroy a lease outright — including on a failure path, before it is ever consumed. Together they mean a session credential is worthless outside the exact moment it was issued for.

---

## Next Tutorial

Continue with **Tutorial 59 – Secure Connectors**, where session credentials are combined with a signed Gateway attestation inside a real SecureConnector.
