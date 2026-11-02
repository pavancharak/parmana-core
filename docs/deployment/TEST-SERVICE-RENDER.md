# Test deployment of the Parmana API on Render

Purpose: a test-only Parmana API that the inbound refund pilot can call (RFC-0025). Not production.
It uses a separate test database and test keys, and holds no real partner's key.

## 1. Database (test project only)

- Use the `parmana-connectors and sandbox` Supabase project. It is the only project on the free plan
  with room for this, and the owner has approved sharing it. Test rows from this API live alongside the
  sandbox data, so clear them out regularly (`inbound_decisions` and `inbound_outcomes`).
- Apply the migrations in order, then check each table:

  ```sql
  select to_regclass('public.inbound_decisions');  -- expect inbound_decisions
  select to_regclass('public.inbound_outcomes');   -- expect inbound_outcomes
  ```

- Copy the Postgres connection string into Render's environment as `DATABASE_URL`. Do not paste it
  into chat or commit it.

## 2. Keys and caller access (generated on your machine)

- Generate a caller API key for the partner, locally:

  ```powershell
  npx tsx scripts/generate-api-key.ts -- --caller-id partner-a
  ```

  This prints a caller API key. Store it in the pilot's secrets only, not in this repo.

- The inbound refund path signs with the gateway key read from `PARMANA_KEY_MATERIAL_JSON` (not from a
  key directory). Set `PARMANA_KEY_MATERIAL_JSON` to a JSON object whose `gateway` entry holds
  `privateKeyPem` and `publicKeyPem`. Generate a new test key pair for this; never reuse production
  keys. The pilot pins the public key.

## 3. Render service

- Type: web service, Node 24 or later.
- Build command: `npm ci && npm run build` (the root build, which also builds the shared and storage packages the API uses)
- Start command: `node packages/api/dist/server.js` (confirmed: the build writes `server.js` to that folder).
- Environment variables:

| Name                        | Value                                        |
| --------------------------- | -------------------------------------------- |
| `NODE_ENV`                  | `production` (so test-mode bypasses are off) |
| `HOST`                      | `0.0.0.0`                                    |
| `PORT`                      | set by Render                                |
| `PARMANA_STORAGE`           | `supabase`                                   |
| `DATABASE_URL`              | test database connection string              |
| `PARMANA_POLICY_DIR`        | `./policies` (committed in the repo)         |
| `PARMANA_KEY_MATERIAL_JSON` | gateway key material, as above               |
| `PARMANA_GATEWAY_KEY_ID`    | `gateway`                                    |
| `PARMANA_API_KEYS`          | JSON array with the caller entry from step 2 |
| `INBOUND_AUDIENCE`          | `billing.example` (must match the pilot)     |

Other settings in `.env.example` keep their defaults. Do not set any HubSpot, GitHub or Paytm value.

## 4. Verify

- Logs show the server listening, with no startup error about a missing setting.
- An unauthenticated request to `POST /v1/inbound/decisions` returns 401.
- An authenticated request with the partner's caller key returns 201 with a signed decision. Check the
  signature against the pinned public key.

## 5. Pilot change (after this works)

The pilot switches from signing its own decisions to calling `POST /v1/inbound/decisions` with the
caller key, and verifies the returned decision with the pinned Parmana public key.
