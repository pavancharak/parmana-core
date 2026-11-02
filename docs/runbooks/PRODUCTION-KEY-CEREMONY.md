# Runbook: production key ceremony for the inbound refund API

Scope: creating the production keys for `parmana-api-real` (production). Run it once, before the
production keys are used, and again on rotation. Production keys are never the test keys.

## Before you start

- Two people: one to generate and handle the keys, one to witness. The witness confirms each step
  and reads back the hashes. In the test run these were Pavan and Mamta.
- A clean computer, with Node 24 or later and this repo checked out at `main`. Close chat, email and
  browsers that could capture a screen while the keys are shown.
- A secure place for the private keys, outside git and outside any synced folder. Decide it before
  you start.
- The production database must already have the inbound tables. They do (`inbound_decisions`,
  `inbound_outcomes`, on `parmana-production-db`).

## 1. Gateway key material (signs decisions)

Generate a `default` and a `gateway` Ed25519 pair. Write the JSON to a file only the key holder can
read, then delete any copies.

```powershell
@'
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
function pair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }),
    publicKeyPem: publicKey.export({ type: "spki", format: "pem" }),
  };
}
writeFileSync("production-key-material.json", JSON.stringify({ default: pair(), gateway: pair() }));
console.log("wrote production-key-material.json");
'@ | Set-Content make-prod-material.mjs
node make-prod-material.mjs
Remove-Item make-prod-material.mjs
```

- Set `PARMANA_KEY_MATERIAL_JSON` on the production service to the file's contents. Do not paste it
  in chat.
- Move the file to the secure place, and then delete the copy in the working folder.
- The witness reads back the gateway public key's fingerprint, and records it in the ceremony log.

## 2. Caller keys (partners and staff)

Generate one entry per caller. Give each raw key only to its owner.

```powershell
npx tsx scripts/generate-api-key.ts -- --caller-id <caller-id> --credential-holder-type USER
```

- Use `--generate-step-up-key` only for a person who approves grants (a checker). Give the step-up
  private key only to that person.
- Each run prints the raw key once, and the entry. The raw key goes to its owner. Only the entry goes
  into `PARMANA_API_KEYS`.

## 3. Set the production variables

Set on the production project (`parmana-api-real`), in the Vercel project's environment settings:

| Name                        | Value                                                         |
| --------------------------- | ------------------------------------------------------------- |
| `NODE_ENV`                  | `production`                                                  |
| `PARMANA_STORAGE`           | `supabase`                                                    |
| `PARMANA_POLICY_DIR`        | `./policies`                                                  |
| `PARMANA_GATEWAY_KEY_ID`    | `gateway`                                                     |
| `INBOUND_AUDIENCE`          | `refunds.parmanasystems.com`                                  |
| `DATABASE_URL`              | the production connection string (secret)                     |
| `PARMANA_KEY_MATERIAL_JSON` | from step 1 (secret)                                          |
| `PARMANA_API_KEYS`          | one JSON array of the production entries from step 2 (secret) |

The variables must be set for the production environment only. Check the environment selector
before you save.

## 4. Verify

- `GET /health` returns 200.
- An unauthenticated `POST /v1/inbound/decisions` returns 401.
- A production caller's `GET /authority-grants` returns the grant list (empty is expected before
  any grant is approved).
- The witness reads the gateway public key from `/.well-known/jwks.json` and compares its fingerprint
  with the ceremony log.

## 5. Record

Write the ceremony log (not in this repo): date, the two people, the caller ids created, the gateway
fingerprint, and where each private key is kept. Never record a raw key or a private key in it.

## Rotation

Repeat steps 1 to 4 for any key that was seen outside its owner, and on the schedule in
`KEY-ROTATION.md`. Replace the whole `PARMANA_API_KEYS` value on each change. Keys that have been
rotated out stop working once the entry is removed.
