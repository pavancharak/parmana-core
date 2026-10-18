# Builder Quickstart

The same flow as [`examples/quickstart`](../quickstart/README.md), built with
`create_business_transaction()` instead of constructing `Authority`, `Authorization`,
`Intent`, `BusinessTransactionMetadata`, and `BusinessTransaction` by hand and keeping three
id pairs in sync yourself.

## What this proves, beyond quickstart

- `create_business_transaction()` derives `metadata.business_transaction_id`,
  `authorization.authority_id`, and `intent.authorization_id` automatically, and every one
  of them round-trips correctly through a real server (not just an isolated unit test,
  see `tests/test_builders.py` for those, and `tests/test_builder_example.py` for this
  live-server proof).
- A fresh `business_transaction_id` is generated automatically (`uuid4()`) when you don't
  supply one. This is the exact idempotency-key mistake documented in
  `docs/site/guides/end-to-end-paytm-flow.mdx` ("businessTransactionId is an idempotency key") is
  structurally harder to make by accident.

## Prerequisites

Identical to [`examples/quickstart`](../quickstart/README.md): a local Parmana API server
on `http://localhost:3000` with caller authentication disabled and a Gateway keypair
present. See that README for the exact server-startup command.

## Automated proof

`python/tests/test_builder_example.py` runs this exact script (via its exported
`run_builder_example()`) against a real, freshly-spawned local server on every `pytest`
run.

## Run

```bash
python python/examples/builder/run.py
```

## Going further: a real business system, not the test fixture

This example targets `test:fixture-execute`, hermetic and requiring no external connector.
To see the identical builder pattern reach a real Paytm refund, staging environment, real
signature verification, and a real cross-service audit trail, see
`docs/site/guides/end-to-end-paytm-flow.mdx`, the
complete, verified-live runbook, including every real error message you might hit along
the way and why.
