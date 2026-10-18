# Tutorial 80 — Fail-Closed Config Validation

## Objective

Exercise `parseCryptoMode`, `parseStorageProvider`, and `parseApiKeys` directly: the functions that turn raw environment variable strings into validated config, rejecting anything invalid at load time with a named, specific error.

## What You'll Learn

- An unrecognized `CRYPTO_MODE` or `PARMANA_STORAGE` value throws immediately, naming both the variable and the invalid value — never silently falls back to a default
- A retired variable name (`DATABASE_PROVIDER`, superseded by `PARMANA_STORAGE`) is caught by name specifically, with a message pointing at its replacement — not just treated as an unknown/ignored variable
- `PARMANA_API_KEYS` gets the same discipline for structured input: invalid JSON and a well-formed-JSON-but-wrong-shape entry both throw named errors identifying exactly what's wrong

## Running the Tutorial

```bash
npx tsx examples/tutorials/80-fail-closed-config-validation/run.ts
```

## Why This Matters

A misconfigured deployment that fails at startup with a clear, specific message is diagnosable in seconds; one that silently defaults to something plausible-but-wrong, or crashes hours later deep inside unrelated code, is not. This tutorial exercises the real validation functions `Config.ts` calls at load time, mirroring `packages/shared/tests/unit/config-validation.test.ts`.

## Next Tutorial

Continue with **Tutorial 81 – Connector Execution Gateway**.
