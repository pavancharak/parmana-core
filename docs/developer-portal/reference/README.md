# Developer reference

[Portal home](../README.md) · [Glossary](../glossary.md) · [FAQ](../faq.md)

This section is the lookup material: where each definition lives, the complete indexes, the configuration, and the error codes. Use it when you know the name of a thing and want its exact definition.

## Indexes

| Index                                                        | What it lists                                                              | Generated from                                                    | Count |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----- |
| [TypeScript method index](../sdk/typescript-method-index.md) | Every public `ParmanaClient` method, its signature, its HTTP request       | `typescript/src/client/*.ts` and `dist/client/ParmanaClient.d.ts` | 58    |
| [Python method index](../sdk/python-method-index.md)         | Every public `ParmanaClient` method, its signature, its HTTP request       | `python/parmana/client.py` and `python/parmana/api/*.py`          | 50    |
| [Endpoint index](../api/endpoint-index.md)                   | Every OpenAPI operation, its auth, its SDK method                          | `openapi/openapi.yaml`                                            | 66    |
| [Error code index](error-code-index.md)                      | Every error code literal in the server source, and the file that raises it | `packages/*/src`                                                  | 105   |
| [Error code catalogue](error-codes.md)                       | The codes that matter most, with observed messages and their meaning       | Hand-written, checked against the observed runs                   | —     |
| [Environment variable reference](environment-variables.md)   | Every server, SDK and CLI setting, with its default and status             | Hand-written, checked against the code                            | —     |

The generated indexes are rebuilt by [tools/generate-indexes.mjs](../tools/generate-indexes.mjs). They are marked as generated, and should not be edited by hand.

## Where the definitions live

| Thing                                             | Where to read it                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The REST API, every route                         | [`openapi/openapi.yaml`](https://github.com/pavancharak/parmana-core/blob/main/openapi/openapi.yaml). The bundled form is `openapi/openapi.bundled.yaml`. The server serves it at `GET /openapi.yaml` and `GET /openapi.json`.                                                                                                                                                                                                                           |
| Request and response JSON Schemas                 | [`schemas/requests/`](https://github.com/pavancharak/parmana-core/tree/main/schemas/requests/) (17 request schemas), [`schemas/responses/`](https://github.com/pavancharak/parmana-core/tree/main/schemas/responses/) (33 response schemas), and [`schemas/common/`](https://github.com/pavancharak/parmana-core/tree/main/schemas/common/) (28 shared object schemas, including the policy, the authority, the signals and the execution trust record). |
| The Business Transaction request                  | [`schemas/requests/transaction-create-request.schema.json`](https://github.com/pavancharak/parmana-core/blob/main/schemas/requests/transaction-create-request.schema.json)                                                                                                                                                                                                                                                                               |
| The Execution Trust Record                        | [`schemas/common/execution-trust-record.schema.json`](https://github.com/pavancharak/parmana-core/blob/main/schemas/common/execution-trust-record.schema.json) and the response schema beside it                                                                                                                                                                                                                                                         |
| TypeScript types                                  | `typescript/src/models/*.ts` (25 files). The compiled declarations are in `typescript/dist/` after `npm run build`.                                                                                                                                                                                                                                                                                                                                      |
| Python types                                      | `python/parmana/models/*.py` (30 files).                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Policy file format                                | [How to write a policy](../../../docs/guides/policy-writing.md) and `packages/policy/src/types/Policy.ts`                                                                                                                                                                                                                                                                                                                                                |
| The trust file and record format for the verifier | The verifier repository's `docs/FORMAT.md`                                                                                                                                                                                                                                                                                                                                                                                                               |
| Error mapping in the TypeScript SDK               | `typescript/src/transport/mapHttpErrorResponse.ts`                                                                                                                                                                                                                                                                                                                                                                                                       |
| Configuration parsing                             | `packages/shared/src/config/Config.ts` and `ConfigValidation.ts`                                                                                                                                                                                                                                                                                                                                                                                         |

## Core concepts, quickly

| Concept                  | Short definition                                                         | Full entry                                          |
| ------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------- |
| Business Transaction     | The declared request: authority, authorization, intent, policy, signals. | [Glossary](../glossary.md#business-transaction)     |
| Execution Trust Record   | The signed evidence for one transaction.                                 | [Glossary](../glossary.md#execution-trust-record)   |
| Policy version in effect | The most recently approved version of a policy name.                     | [Glossary](../glossary.md#policy-version-in-effect) |
| Human approval           | A signed artifact from a trusted approver, verified by the server.       | [Glossary](../glossary.md#human-approval)           |
| Maker-checker            | Two-person approval of a policy change, with a step-up signature.        | [Glossary](../glossary.md#maker-checker)            |

## Configuration

Parmana is configured with environment variables. The full reference is in [Environment variables](environment-variables.md). The variables a deployment must set are in [Deployment](../deployment/README.md#environment-variables).

Configuration errors stop the server at start-up, with a message that names the variable. The messages the verification observed are listed in [Troubleshooting](../troubleshooting/README.md).

## Versions

| Item                                                                                         | Version                                                                                             |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@parmana/sdk`, `parmana`, `@parmana/cli`, `@parmana/connector-sdk`, `parmana-connector-sdk` | 4.1.1                                                                                               |
| `@parmana/verifier`, `parmana-verifier`                                                      | 2.0.3                                                                                               |
| Repository packages (`packages/*`)                                                           | 4.1.1                                                                                               |
| OpenAPI document                                                                             | API `1.0.0`, OpenAPI 3.1.0                                                                          |
| `GET /version` on this build                                                                 | `4.1.1`, the `@parmana/api` package version (an earlier build reported a hand-typed `0.4.0`; fixed) |
| Node.js                                                                                      | 24 or later                                                                                         |
| Python                                                                                       | 3.10 or later                                                                                       |

## Glossary and FAQ

- [Glossary](../glossary.md): the terms used across the portal.
- [FAQ](../faq.md): common questions, answered with the verified behaviour.
