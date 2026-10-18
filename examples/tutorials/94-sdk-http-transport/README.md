# Tutorial 94 — SDK HTTP Transport

## Objective

Exercise the published TypeScript SDK's `HttpTransport` directly — the client-side layer external integrators actually depend on — proving bearer-key attachment and its full status-code-to-typed-error-class mapping.

## What You'll Learn

- `HttpTransport` attaches `Authorization: Bearer <apiKey>` automatically when configured, omits it entirely when not, and lets an explicit per-request header override it
- Every documented HTTP error shape maps to a specific, catchable error class — `ValidationError`, `AuthenticationError`, `AuthorizationError`, `NotFoundError`, `ConflictError`, `InternalServerError` — and, critically, a `403` with `code: "POLICY_DENIED"` maps to `ExecutionRejectedError`, not the generic `AuthorizationError` an uncoded `403` (a caller-identity mismatch) maps to
- `nonThrowingStatuses` lets specific routes (like `POST /policies/validate`) treat certain status codes as normal responses instead of throwing
- Genuine network failures and request timeouts map to `NetworkError`/`TimeoutError` respectively — and the status-mapped errors above are never accidentally re-wrapped as one of these by the transport's own outer error handling

## Running the Tutorial

```bash
npx tsx examples/tutorials/94-sdk-http-transport/run.ts
```

## Why This Matters

Every other tutorial in this suite proves server-side behavior. External integrators using `@parmana/sdk` (or any language port following the same contract) depend on this exact mapping to write `catch (e) { if (e instanceof ExecutionRejectedError) ... }`-style handling — a regression here would silently break every integrator's error handling, not just this codebase's own server. This tutorial mirrors `typescript/test/HttpTransport.test.ts` against response shapes copied from the real, documented error catalog.

## Next Tutorial

Continue with **Tutorial 95 – Generic Approval Verifier**.
