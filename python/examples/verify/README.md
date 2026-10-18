# Verify

Submits a Business Transaction, then exercises both Verification entry
points side by side:

| SDK call                             | HTTP                    | Behavior                                                                               |
| ------------------------------------ | ----------------------- | -------------------------------------------------------------------------------------- |
| `client.verification.verify(id)`     | `POST /verify`          | Runs a fresh verification; appends a new `Verification` to the Trust Record's history. |
| `client.verification.get_latest(id)` | `GET /verification/:id` | Reads back the most recent `Verification` without re-verifying.                        |

## What this proves

- `get_latest()` is a real, working addition to the SDK. Before this
  session, only `verify()` existed, so there was no way to read a cached
  verification result without triggering a new one -- every read was a
  write.
- The two calls are backed by genuinely different routes
  (`packages/api/src/routes/verify.ts` vs `verify-get.ts`, mounted at
  `/verify` and `/verification` respectively in `app.ts`), not the same
  endpoint called twice.

## Prerequisites

Same as `../quickstart/README.md`: a local API server on
`http://localhost:3000` (memory storage override recommended) and the
Python SDK installed.

## Run

```bash
python python/examples/verify/run.py
```

## Expected output (real run against a local server, 2026-07-06)

```
Business Transaction ID: 67e2671b-aaf1-440b-adbc-389da4e7ec5e

client.verification.verify() -- fresh (POST /verify):
  status:      VerificationStatus.VERIFIED
  verified_at: 2026-07-06 04:10:15.021000+00:00
  hash:        861fe01aaadf904a003d3e6118e74f967164a52d91eb18f97ca6cbce71292768

client.verification.get_latest() -- cached (GET /verification/:id):
  status:      VerificationStatus.VERIFIED
  verified_at: 2026-07-06 04:10:15.021000+00:00
  hash:        861fe01aaadf904a003d3e6118e74f967164a52d91eb18f97ca6cbce71292768

Confirmed: get_latest() returned the same Verification verify() just produced.
```

IDs and hashes will differ on every run.
