# Tutorial 90 — OpenAPI Self-Description

## Objective

Prove `GET /openapi.yaml` serves a valid, unauthenticated OpenAPI 3.1 document, and that the bundled spec's `$ref`s genuinely resolve — no composite schema left as a raw, unexpanded pointer under a strict resolver.

## What You'll Learn

- `GET /openapi.yaml` is exempt from caller authentication for the same reason `GET /health` is: a caller can't discover how to obtain an API key from documentation it isn't allowed to read
- Fully dereferencing the bundled spec leaves zero `$ref` strings anywhere in the output — including the Execution Trust Record's composite fields (`transaction`, `overrides`, `executions`, `verifications`, `receipts`), each of which fully expands to a real object schema
- No bundled component schema carries a stray `$id`/`$schema` from its source file — the actual root cause of a real historical bug: under JSON Schema 2020-12 / OAS 3.1's strict resolution rules, a leftover `$id` rebases every `$ref` inside that schema onto a different base URI, breaking tools like Swagger UI even though this codebase's own redocly lint step never caught it

## Running the Tutorial

```bash
npx tsx examples/tutorials/90-openapi-self-description/run.ts
```

## Why This Matters

An API's self-description is only useful if it's actually correct for the tools consuming it. This tutorial mirrors `packages/api/tests/unit/openapi-api.test.ts` and the core assertions of `openapi-bundle-refs.test.ts` — proving both that the route itself works and that the specific class of bundling bug it regression-tests (schemas retaining their own `$id`, rebasing `$ref` resolution) stays fixed.

## Next Tutorial

Continue with **Tutorial 91 – Graceful Shutdown**.
