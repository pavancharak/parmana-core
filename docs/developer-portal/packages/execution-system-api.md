# `@parmana/execution-system`: API reference

[Portal home](../README.md) · [Publishing decision](publishing-envelope-verifier-and-execution-system.md) · [Envelope verifier API](envelope-verifier-api.md)

**Status: the three defects recorded on 2026-11-20 are fixed; the package is still held.** This page documents the public surface, so the owner can decide what to publish. The placeholder is renamed to `SimulatedExecutionSystem`, the timeout is applied, and responses are validated. The package still needs its receiving-system obligations documented, and an owner decision, before it is published.

**Requirements:** Node.js 24 or later. One entry point: `@parmana/execution-system`.

## What it is

The package defines the request Parmana sends to an execution system once an action is authorized, and a client that sends it over HTTP. It does not authorize anything itself. The receiving system must verify the authorization before it executes (see the [envelope verifier](envelope-verifier-api.md)).

## Types

### `ExecutionRequest`

| Field                   | Type                                | Meaning                                                                                                                                         |
| ----------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `businessTransactionId` | `string`                            | The Business Transaction identifier.                                                                                                            |
| `action`                | `string`                            | The approved action.                                                                                                                            |
| `target`                | `string`                            | The approved target.                                                                                                                            |
| `parameters`            | `Record<string, unknown>`           | The approved parameters.                                                                                                                        |
| `signals`               | `Record<string, unknown>`, optional | The runtime signals the decision was evaluated against. A receiving gateway can recompute their hash against the authorization's `signalsHash`. |
| `authorization`         | `SignedExecutionAuthorization`      | The signed proof that Parmana authorized the execution. The receiving system must verify its signature and expiry before executing.             |

### `ExecutionSystemClientOptions`

| Option    | Required | Meaning                                                                                  |
| --------- | -------- | ---------------------------------------------------------------------------------------- |
| `baseUrl` | Yes      | The base URL of the execution system.                                                    |
| `headers` | No       | HTTP headers sent with each request, for example an authorization header for the system. |
| `timeout` | No       | Declared, but **not applied** by the client. See defect 2.                               |

### `ExecutionSystem`

```ts
interface ExecutionSystem {
  execute(request: ExecutionRequest): Promise<ExecutionResult>;
}
```

Any execution system implements this interface. `ExecutionResult` comes from `@parmana/shared`.

## Implementations

### `HttpExecutionSystem`

Sends `POST {baseUrl}/execute` with the request as JSON. It applies the `timeout` option: a request that does not finish in time throws `Execution System did not respond within <n> ms. The action may have run; reconcile it.`, so a timed-out request must be reconciled, not resent. A non-2xx response throws `Error("Execution System returned HTTP <status>.")`.

The response is checked before it is returned. It must be an object with string `businessTransactionId`, `action` and `target`, a boolean `success`, an object `parameters`, and an `executedAt` timestamp string. Anything else throws `Execution System response: ... `. `executedAt` is returned as a `Date`.

The constructor refuses a `timeout` that is not a positive number.

### `SimulatedExecutionSystem`

**Executes nothing.** It returns `success: true` for any request. It is for tests and examples only. Anyone who uses it as a real execution system will record actions that never happened. It was named `DefaultExecutionSystem` until 2026-11-20, when it was renamed so its behaviour is clear.

## Defects (recorded 2026-11-20, fixed the same day)

1. **The placeholder reported success without executing.** Renamed to `SimulatedExecutionSystem`, with a documentation comment that says it executes nothing. The name was not changed for its behaviour, which is the same as before.
2. **`timeout` was declared but not applied.** Now applied with `AbortSignal.timeout`, with tests.
3. **The response was not validated.** Now checked field by field, with tests for each case.

Tests: `packages/execution-system/tests/unit/http-execution-system.test.ts` and `simulated-execution-system.test.ts`.

## What is not in this package

- No authorization check. The receiving system must verify the envelope itself.
- No connector. The execution system is the caller's integration point.
- No retry or idempotency. A request that times out or fails after the action ran must be reconciled by the caller.

## Before the package can be published

1. Document the receiving system's obligations: verify the envelope, and handle the signals.
2. Decide whether to publish with `SimulatedExecutionSystem` in the public surface. Its name now says it executes nothing, but the owner should confirm it belongs in a published package.
3. Publish through the release process, as set out in the [publishing page](publishing-envelope-verifier-and-execution-system.md).
