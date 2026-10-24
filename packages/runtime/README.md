# @parmana/runtime

The core pipeline. `RuntimeEngine.execute()` takes an execution intent from an
AI agent, decides whether the agent may run it, and produces a signed record of
the decision and the outcome.

It is the only place a decision is made. Connectors run only after the runtime
has signed an authorization, and the gateway checks that signature again before
any connector is called.

## The pipeline

For each request, `RuntimeEngine.execute()` does the following in order:

1. Loads the policy and checks it against the capability-to-policy binding map.
2. Checks the policy's bound signals against the execution intent.
3. Evaluates the deterministic policy rules (`PolicyEngine.evaluate()`, a pure
   function with no I/O).
4. On approval, signs an authorization. Ed25519 is the default. ML-DSA-65 is used
   under `CRYPTO_MODE=hybrid`.
5. The execution gateway re-verifies that signed authorization before any
   connector runs.
6. The connector runs once, with a single-use, credential-isolated session that
   is destroyed after use.
7. A signed `ExecutionTrustRecord` is produced, recording what was authorized
   and what happened.

A request that is refused at any step gets a signed `RefusalRecord` instead. If
writing that record fails, the refusal still goes back to the caller unchanged.

## Using it

Most callers should use the facade and builder, not the engine directly:

```ts
import { RuntimeBuilder } from "@parmana/runtime";
```

- `Runtime`: the facade for running an intent end to end.
- `RuntimeBuilder`: assembles a runtime from its policy, signing, storage and
  connector dependencies.
- `RuntimeEngine`: the pipeline itself, for advanced use.

The public exports are listed in [`src/index.ts`](./src/index.ts). Everything
else is internal.

## Layout

| Path                       | Contents                                                             |
| -------------------------- | -------------------------------------------------------------------- |
| `src/Runtime*.ts`          | Facade, builder, factory and the engine.                             |
| `src/*Builder.ts`          | Builders for the decision, execution, intent and record structures.  |
| `src/business-validation/` | Checks an agent's stated facts against a registered business source. |
| `src/authority/`           | Evaluates per-agent authority grants.                                |
| `src/components/`          | Pipeline components, including trust-chain validation.               |
| `src/errors/`              | Typed runtime errors.                                                |
| `src/hooks/`               | Hooks that run around pipeline steps.                                |
| `src/services/`            | Services for transactions, execution, receipts and verification.     |
| `tests/`                   | Unit, integration and end-to-end tests.                              |

## Tests

Run the tests from this package:

```sh
npm test
```

This package has its own `vitest.config.ts`, which extends the repository root
config and loads its test setup. Running `npx vitest run` from the repository
root also runs these tests.

## Related docs

- [`docs/CURRENT-STATE.md`](../../docs/CURRENT-STATE.md): what is built and verified.
- [`docs/architecture/system-architecture.md`](../../docs/architecture/system-architecture.md): where the runtime sits in the system.
- [`docs/adr/ADR-0004-Runtime-Pipeline.md`](../../docs/adr/ADR-0004-Runtime-Pipeline.md): why the pipeline is shaped this way.
