# Tutorial 108 — Public-Key Discovery

## Objective

Close the other half of PQC audit RED-2 (`docs/VERIFICATION-GAPS.md`): even a perfect
offline verifier (Tutorial 107) is useless to a third party with no way to obtain the
public key it needs. `GET /keys/:keyId` and `GET /.well-known/jwks.json`
(`packages/api/src/routes/keys.ts`) are mounted unauthenticated, the same category as
`POST /refusal/verify` and `POST /audit/verify` — a credential-gated route cannot be how a
party with no Parmana credential gets the credential-free key it needs.

## What You'll Learn

- `GET /keys/default` returns the real key as PEM (and, where Node's own JWK export
  supports the algorithm, a `jwk` field too), with no `Authorization` header (Scenario 1)
- `GET /.well-known/jwks.json` enumerates every key this deployment currently holds
  (Scenario 2)
- An unknown keyId returns a real `404`, not an empty or ambiguous response (Scenario 3)
- The full chain, combining RED-1 and RED-2: a key fetched over HTTP verifies a real signed
  record using `verifyExecutionTrustRecordOffline`, with zero further server calls
  (Scenario 4)

## Running the Tutorial

```bash
npx tsx examples/tutorials/108-public-key-discovery/run.ts
```

Boots the real Express app on an OS-assigned ephemeral port (`app.listen(0)`, the same
pattern Tutorial 90 uses), makes real HTTP requests against it, and shuts it down when
done — no fixed port, safe to run alongside every other tutorial in `npm run examples`.
