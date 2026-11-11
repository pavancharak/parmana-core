# 2.21 Distinguishable HTTP Status for Policy Denial and Replay

Source: CLAIMS.md (commit d1d63c6), lines 494-523.

## Exact claim text

## 2.21 Distinguishable HTTP Status for Policy Denial and Replay

Three failures return three different responses, so a caller can tell them apart:

- A policy `REJECTED` decision returns `HTTP 403` with `code: "POLICY_DENIED"`.
- An execution request whose authorization was already consumed returns `HTTP 409` with `code: "NONCE_ALREADY_CONSUMED"`. This is raised only when every other gateway check passed, or was not applicable, and only the nonce check failed.
- Any other gateway verification failure, such as a forged signature, an expired envelope or tampered content, returns a plain, uncoded error with `HTTP 500`.

Only the status code and response body change. The authorization logic and the underlying checks are unchanged.

**Scope.**

- The `409` replay path is reached today only when a caller invokes `@parmana/execution-gateway`'s `ExecutionGateway.execute()` directly with an already-consumed authorization.
- It is not reached through `POST /execute` or `POST /transactions`. A resubmitted `businessTransactionId` is refused earlier, with the `409` `DuplicateBusinessTransactionError` described in 2.20. That refusal happens before the runtime, policy evaluation or the gateway run.
- The `403` `POLICY_DENIED` response is returned through the HTTP API.

**Evidence.**

- `packages/runtime/src/ExecutionGate.ts` (`RuntimeError` with `status: 403` and `code: "POLICY_DENIED"`)
- `packages/shared/src/errors/nonce-already-consumed-error.ts` (`NonceAlreadyConsumedError`, `status: 409`, `code: "NONCE_ALREADY_CONSUMED"`)
- `packages/execution-gateway/src/ExecutionGateway.ts` (`isSoleFailureNonceReplay` decides when to throw `NonceAlreadyConsumedError`; any other combination of failed checks throws the unchanged uncoded `Error`)
- `packages/api/src/middleware/error-handler.ts` (the `NonceAlreadyConsumedError` branch, and the `RuntimeError` branch that reads `status` and `code`)
- `packages/execution-gateway/tests/unit/execution-gateway.test.ts` and `execution-gateway.dilithium3.test.ts` (a replayed request is rejected without being released twice, as `NonceAlreadyConsumedError` with status 409)
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` ("rejected transaction produces no authorization")
- `packages/api/tests/integration/caller-auth.integration.test.ts` (a policy-rejected transaction through `POST /execute` returns 403 with `POLICY_DENIED`)
- `typescript/src/transport/mapHttpErrorResponse.ts` and `typescript/test/Errors.test.ts`, `HttpTransport.test.ts` (the TypeScript SDK maps `POLICY_DENIED` to `ExecutionRejectedError`, ahead of the generic 403 mapping)
- `examples/tutorials/102-distinguishable-http-status/run.ts` (all three failure shapes side by side)

Dated updates, including the removal of the connector tests that once also covered this path, are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `examples/tutorials/102-distinguishable-http-status/run.ts`: EXISTS
- `packages/api/src/middleware/error-handler.ts`: EXISTS
- `packages/api/tests/integration/caller-auth.integration.test.ts`: EXISTS
- `packages/execution-gateway/src/ExecutionGateway.ts`: EXISTS
- `packages/execution-gateway/tests/unit/execution-gateway.test.ts`: EXISTS
- `packages/runtime/src/ExecutionGate.ts`: EXISTS
- `packages/runtime/tests/unit/execution-authorization-wiring.test.ts`: EXISTS
- `packages/shared/src/errors/nonce-already-consumed-error.ts`: EXISTS
- `typescript/src/transport/mapHttpErrorResponse.ts`: EXISTS
- `typescript/test/Errors.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                            | Status | Tests | Passed | Skipped |
| -------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/integration/caller-auth.integration.test.ts`     | passed | 27    | 27     | 0       |
| `packages/execution-gateway/tests/unit/execution-gateway.test.ts`    | passed | 14    | 14     | 0       |
| `packages/runtime/tests/unit/execution-authorization-wiring.test.ts` | passed | 10    | 10     | 0       |
| `typescript/test/Errors.test.ts`                                     | passed | 77    | 77     | 0       |
