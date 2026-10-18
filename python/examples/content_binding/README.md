# Content Binding (from the client's perspective)

Submits a Business Transaction, then resubmits a **modified** payload
(different payment amount) under the **same** `businessTransactionId`,
and reports what actually happens.

## Read this before drawing conclusions from the output

**This example does NOT demonstrate cryptographic content-binding.** It
demonstrates Business Transaction ID uniqueness, which is a different,
weaker protection. Here is what was actually traced, with sources:

- The v1 envelope (`SignedExecutionAuthorization`, with
  `payload.businessTransactionHash`) exists in
  `packages/shared/src/domain/execution-authorization.ts`. Its doc
  comment explicitly says the hash lets "a receiving gateway ... reject
  any mismatch" between a signed authorization and modified content.
- That check is implemented in
  `packages/execution-gateway/src/ExecutionGateway.ts` (`verify()`):
  it recomputes the content hash via `ExecutableContentHasher` and
  compares it to `businessTransactionHash` -- this is the real
  content-binding check.
- **The plain local API server never constructs an `ExecutionGateway`.**
  `packages/api/src/application.ts`'s `createApplication()` accepts an
  optional `executionSystem` parameter, but the server's own
  `application` singleton is created with no argument, so it falls back
  to the default (non-gateway) execution system. `ExecutionGateway` has
  no HTTP server entry point anywhere in this repo -- it's a library
  class meant to be composed into a consuming service's own connector.
- So resubmitting a modified payload under the same
  `businessTransactionId` against the plain server is rejected by
  `BusinessTransactionService.accept()` throwing
  `DuplicateBusinessTransactionError` (`packages/runtime/src/services/
business-transaction-service.ts:36-44`) -- a simple "does this ID
  already exist" check, mapped to HTTP 409. It has nothing to do with
  verifying the payload's content against a signed hash. A modified
  payload under a **new, never-seen** `businessTransactionId` would sail
  straight through with no rejection at all.

**What would be required to see real content-binding rejection:** a
consuming service would need to construct its own `ExecutionGateway`
(from `@parmana/execution-gateway`) with a `Connector` and pass it as
the `executionSystem` argument to `RuntimeFactory.create(...)` /
`createApplication(...)`, wiring a real `SignedExecutionAuthorization`
with a `businessTransactionHash` through the request. No such server
exists in this repo to point the Python SDK at, so it cannot be
demonstrated end-to-end here. This is the same open question the
TypeScript SDK audit raised -- see the consolidated core-API findings
note.

## What this example does prove

- The Python SDK's `ConflictError` (mapped from HTTP 409) is raised
  correctly and specifically, distinguishable from `ValidationError`,
  `NotFoundError`, etc.
- The exact, real boundary of what protection exists today at the
  plain-API layer, so nobody mistakes ID-uniqueness for content-binding.

## Prerequisites

Same as `../quickstart/README.md`.

## Run

```bash
python python/examples/content_binding/run.py
```

## Expected output (real run against a local server, 2026-07-06)

```
Original transaction accepted: 7bc85031-eeca-41a3-a6d5-48f4fc7cd2f3
  amount authorized: 1000
  trust record hash: fd12a7d100a76e9713f8b74e65661d06f51e3e163164d5615a2b33845f603b49

Resubmitting SAME businessTransactionId with amount changed to 50000 ...
Rejected: Business Transaction '7bc85031-eeca-41a3-a6d5-48f4fc7cd2f3' already exists. (HTTP 409)

This is Business Transaction ID uniqueness (DuplicateBusinessTransactionError), NOT cryptographic
content-binding. See README.md for what that distinction means and what would be required to
observe real content-binding enforcement.
```

IDs and hashes will differ on every run.
