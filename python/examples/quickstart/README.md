# Quickstart

Constructs a `ParmanaClient`, submits a Business Transaction through
`POST /execute`, and prints the resulting Execution Trust Record.

## What this proves

- The client can reach a real running Parmana Runtime and get back a
  fully-formed `ExecutionTrustRecord`, including the fields a previous
  SDK version silently dropped or never modeled:
  - `trust_record.signature` (a real `Signature` object, not missing)
  - `trust_record.executions[0].evidence` (what was actually executed)
  - `trust_record.executions[0].completed_at` / `.metadata`
- `trust_record.signature.algorithm` decodes to a real `SignatureAlgorithm`
  enum member (`isinstance` holds), not a bare string.

## Prerequisites

- Node.js >= 24 and the repo's root `npm install` already run (to build/run
  `packages/api` via `tsx`).
- A local Parmana API server running on `http://localhost:3000`, with
  caller authentication disabled (this example never supplies an
  `api_key`) and a Gateway keypair present (`keys/default.{private,public}.pem`,
  `keys/gateway.{private,public}.pem` -- not generated automatically;
  `npx tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id default`
  and `... --key-id gateway`). From the repo root:

  ```bash
  PARMANA_STORAGE=memory \
    PARMANA_POLICY_DIR=/absolute/path/to/policies \
    PARMANA_KEY_DIR=/absolute/path/to/keys \
    PARMANA_AUTH_DISABLED=true \
    npx tsx packages/api/src/server.ts
  ```

  `memory` storage is used here so the example has no external database
  dependency. The repo's committed `.env` defaults to Supabase-backed
  storage; override `PARMANA_STORAGE` as shown above to run fully locally.

  This example targets `test:fixture-execute`, a generic,
  `NODE_ENV=test`-only fixture connector (`createTestFixtureConnector.ts`)
  that needs no credential of its own -- the `payments:execute`/
  `vendor-payment` connector and its `VENDOR_PAYMENT_TOKEN` this example
  originally targeted were removed from the repository entirely
  (docs/VERIFICATION-GAPS.md G-27), not renamed.

- The Python SDK installed: `pip install -e ./python`.

## Automated proof

`python/tests/test_quickstart_example.py` runs this exact script (via
its exported `run_quickstart()`) against a real, freshly-spawned local
server on every `pytest` run -- this isn't just an example that happens
to compile, it's asserted to actually work.

## Run

```bash
python python/examples/quickstart/run.py
```

## Expected output (real run against a local server, 2026-09-14)

```
Connected to http://localhost:3000 (SDK v1.6.0)

Business Transaction ID: 40ba54d1-1038-443c-80ec-9cd6ad7757a1
Trust Record ID:         9c82c5c6-b465-41c8-8a03-ac07ec839c20
Trust Record Hash:       a08a041317a6f28307a30c97147ef320e896578153118e978f7998a63cf52037
Signature Algorithm:     SignatureAlgorithm.ED25519

Full Execution Trust Record:
{
  "trust_record_id": "9c82c5c6-b465-41c8-8a03-ac07ec839c20",
  ...
  "executions": [
    {
      ...
      "decision": {
        "outcome": "APPROVED",
        "reason": "Vendor payment authorized. Vendor verification, invoice verification, payment approval, funding, and risk assessment requirements were satisfied."
      },
      "evidence": {
        "business_transaction_id": "40ba54d1-1038-443c-80ec-9cd6ad7757a1",
        "action": "test:fixture-execute",
        "target": "vendor://payments",
        "parameters": { "amount": 1000, "currency": "USD" },
        "success": true,
        "attributes": {
          "connector": {
            "connectorId": "test-fixture",
            "connectorVersion": "1.0.0",
            "capability": "test:fixture-execute",
            "credentialProviderId": "static",
            "responseSummary": { "success": true, "metadata": {} },
            "connectorEvidenceHash": "18afc40e481ba3ef2072e31f0d1cc5ef37ca2ab753d152d3a0e9e4aaec939f74"
          }
        }
      }
    }
  ],
  ...
  "signature": {
    "algorithm": "ed25519",
    "key_id": "default",
    "value": "HKC7KaZS4uV/KMaYi3K+4fVcFrxqVRYpE+AD26myEJckqdbeYGgwULKGHwu31FG2cSXaurfxb7lzvGTsZqt9AQ==",
    "signed_at": "2026-09-14 10:06:56.210000+00:00"
  }
}
```

IDs, hashes, and signature values will differ on every run. The `attributes.connector` block
is populated by `@parmana/connector-sdk`'s `SdkConnectorExecutor`.

As of 2026-09-14 this example is built with `create_business_transaction()`, which derives
the transaction's three id pairs (see [the Python SDK docs](https://docs.parmanasystems.com/sdks/python)) instead of
hand-assembling `Authority`/`Authorization`/`Intent` with hardcoded ids.
