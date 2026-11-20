# `@parmana/execution-system`: API reference

[Portal home](../README.md) · [Publishing decision](publishing-envelope-verifier-and-execution-system.md) · [Envelope verifier API](envelope-verifier-api.md)

**Status: held. Not for publishing yet.** This page documents the public surface of version 4.1.1 so the owner can decide what to publish. It also records three defects that block publishing. The package's own README is a placeholder, so this page is the only description of its API.

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

Sends `POST {baseUrl}/execute` with the request as JSON, and returns the parsed response body. A non-2xx response throws `Error("Execution System returned HTTP <status>.")`. The client sends `Content-Type: application/json` and the configured headers.

### `DefaultExecutionSystem`

**A placeholder. Do not use it outside tests.** Its `execute` returns `success: true` and an `executedAt` time, and it does not execute anything. Anyone who uses it as a real execution system will record actions that never happened.

## Defects that block publishing

1. **`DefaultExecutionSystem` reports success without executing.** It is exported from the package's public entry point. A published package must not contain a placeholder that looks like a working system. Remove it from the public surface, or rename it and make its name state that it does nothing.
2. **`timeout` is declared but not applied.** `HttpExecutionSystem` never passes it to `fetch`. A caller who sets a timeout gets no timeout. Apply it, with a test, or remove it from the options.
3. **The response is not validated.** `execute` casts the parsed JSON to `ExecutionResult` without checking its shape. A malformed or hostile response is accepted as a result. Validate the fields the caller relies on.

## What is not in this package

- No authorization check. The receiving system must verify the envelope itself.
- No connector. The execution system is the caller's integration point.
- No retry or idempotency. A request that times out or fails after the action ran must be reconciled by the caller.

## Before the package can be published

1. Resolve the three defects above, with tests.
2. Document the receiving system's obligations: verify the envelope, and handle the signals.
3. Then publish through the release process, as set out in the [publishing page](publishing-envelope-verifier-and-execution-system.md).
