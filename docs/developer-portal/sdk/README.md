# SDKs and packages

[Portal home](../README.md) · [API reference](../api/README.md)

This page lists every package in the repository that is marked public, what it is for, and whether you can install it from a public registry. It was checked against npm and PyPI on the day this portal was written.

## Which package do I need?

| If you want to...                                                           | Use                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Call Parmana from a Node.js or TypeScript application or agent              | [`@parmana/sdk`](typescript.md)                                                                          |
| Call Parmana from Python                                                    | [`parmana`](python.md)                                                                                   |
| Check an Execution Trust Record without the Parmana SDK, in any environment | [`@parmana/verifier`](verifier.md) (npm) or [`parmana-verifier`](verifier.md) (PyPI)                     |
| Propose and approve policy changes from a terminal, as an operator          | [`@parmana/cli`](cli.md) (`parmana-ops`)                                                                 |
| Write a connector that receives signed releases                             | [`@parmana/connector-sdk`](connector-sdk.md) (npm) or [`parmana-connector-sdk`](connector-sdk.md) (PyPI) |
| Run the Parmana server                                                      | Not a package. See [Deployment](../deployment/README.md).                                                |

## Published packages

"Registry" is the version on the public registry. "Repository" is the version in this checkout. They match except where noted.

| Package                      | Registry | Registry version | Repository version | Status                                                                            | Purpose                                                                                           |
| ---------------------------- | -------- | ---------------- | ------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `@parmana/sdk`               | npm      | 4.1.1            | 4.1.1              | **Implemented**                                                                   | TypeScript SDK. The client, builders, errors, approval and step-up signing, offline verification. |
| `parmana`                    | PyPI     | 4.1.1            | 4.1.1              | **Implemented**                                                                   | Python SDK. The same surface as the TypeScript SDK, synchronous.                                  |
| `@parmana/verifier`          | npm      | 2.0.3            | 2.0.3              | **Implemented**                                                                   | Offline verifier and `parmana-verify` command. No dependencies.                                   |
| `parmana-verifier`           | PyPI     | 2.0.3            | 2.0.3              | **Implemented**                                                                   | Python version of the offline verifier, same results.                                             |
| `@parmana/cli`               | npm      | 4.1.1            | 4.1.1              | **Implemented**, with a known defect in its command launch. See [cli.md](cli.md). | `parmana-ops`: policy, approver, step-up and key commands.                                        |
| `@parmana/connector-sdk`     | npm      | 4.1.1            | 4.1.1              | Documented elsewhere; not exercised here                                          | Connector authoring contracts.                                                                    |
| `parmana-connector-sdk`      | PyPI     | 4.1.1            | 4.1.1              | Documented elsewhere; not exercised here                                          | Python connector authoring contracts.                                                             |
| `@parmana/crypto`            | npm      | 4.1.1            | 4.1.1              | Implemented as a building block; use the SDK's signing helpers                    | Canonical serialization, signing and verification primitives.                                     |
| `@parmana/shared`            | npm      | 4.1.1            | 4.1.1              | Building block                                                                    | Domain model and configuration shared across packages.                                            |
| `@parmana/envelope-verifier` | npm      | **0.1.0**        | 4.1.1              | Building block                                                                    | Verifies that an execution request was authorized. Registry version differs from the repository.  |
| `@parmana/execution-system`  | npm      | **0.1.0**        | 4.1.1              | Building block                                                                    | Execution system protocol. Registry version differs from the repository.                          |

Packages marked public in `package.json` but **not on npm** are server building blocks. They are not integration points, and you do not install them. They are the runtime, policy engine, governance, approval, gateway, storage, replay and governance UI: `@parmana/api`, `@parmana/runtime`, `@parmana/policy`, `@parmana/approval`, `@parmana/capability-registry`, `@parmana/execution-control`, `@parmana/execution-gateway`, `@parmana/replay`, `@parmana/storage` and `@parmana/governance-ui`. They run inside the server built from this repository.

## Install commands, as checked

```bash
npm install @parmana/sdk@4.1.1
npm install @parmana/verifier@2.0.3
npm install -g @parmana/cli@4.1.1          # see cli.md for how to run it
pip install "parmana==4.1.1"
pip install "parmana[verify]==4.1.1"       # for parmana.crypto signing and offline checks
pip install "parmana-verifier==2.0.3"
```

The install commands were run in fresh directories and confirmed that the packages resolve, the exports exist, and the verifier's `parmana-verify` command runs.

## Discover the methods

- The **complete method index** for each SDK is generated from the source. It lists every public method, its signature, and the HTTP request it sends:
  - [TypeScript: 58 methods](typescript-method-index.md)
  - [Python: 50 methods](python-method-index.md)
- The **endpoint index** lists all 66 operations in the OpenAPI document, with the SDK method that calls each one where there is one: [Endpoint index](../api/endpoint-index.md).
- In an editor, the TypeScript package ships type declarations (`dist/index.d.ts`), so autocomplete shows the signatures. In Python, the methods are typed and documented in their docstrings.

## Which SDK methods reach which endpoints

Each SDK method maps to one HTTP request, with two exceptions:

- `createTransaction` / `create_transaction` sends two requests: `POST /transactions`, then `POST /transactions/{id}/execute`.
- `endpoint` and, in Python, `version` are local. `version()` in TypeScript is not local: it sends `GET /version`.

Some OpenAPI operations have no SDK method (for example the kill switch, the handbook download, and the sandbox approval). Call those over HTTP. They are listed in the [endpoint index](../api/endpoint-index.md).

## Versioning and compatibility

- The SDK packages share one version number with the server repository (4.1.1 at the time of writing).
- The offline verifiers have their own version (2.0.3).
- A record carries a `schemaVersion`. The verifiers and the SDKs handle schema version 2 (legacy) and 3 (whole-record). See [Evidence verification](../security/evidence-verification.md).
- The server's `GET /version` reports `0.4.0` in this build. This does not match the packages. Do not use it to check compatibility until that is resolved; see [COVERAGE](../COVERAGE.md#known-issues-found-during-this-review).

## Next

- [TypeScript SDK](typescript.md)
- [Python SDK](python.md)
- [Offline verifier](verifier.md)
- [CLI](cli.md)
- [Connector SDK](connector-sdk.md)
