# Tutorial 131: configuration and bootstrapping

## Objective

Show what a deployment must have before the server starts, and that each missing or invalid
setting is refused with a message that names it. The server reads its configuration once, at
startup. It refuses to start unless every setting it needs is present and valid, and it binds
its port only after the checks pass (handbook chapter 02).

## The steps

1. A complete local configuration loads into all twelve sections, and the signing keys are
   present: the server starts.
2. `PARMANA_POLICY_DIR` is not set: refused. The server cannot evaluate any policy without it.
3. `PARMANA_STORAGE` is an unknown value: refused, naming the value. An invalid setting is never
   silently defaulted.
4. `PARMANA_STORAGE=postgres` with no `DATABASE_URL`: refused. An in-memory store must never be
   used in production.
5. An empty signing key directory: refused at startup, naming the missing key. Without this check
   the first request that signs would be the one to fail.
6. `KEY_PROVIDER=aws-kms` with a signature algorithm the KMS signer does not support: refused
   before any action runs.

## How the checks are run

`loadConfig()` reads the environment once and validates every value. Two bootstrap checks run
before the port binds: `assertStorageConfigured()` and `assertSigningKeyMaterialConfigured()`.
Both skip themselves under `NODE_ENV=test`, which the examples runner sets. This tutorial sets
`NODE_ENV=production` for those checks only, so they run as they would in a deployment, and
restores the environment afterwards.

The full startup order, including the checks that run after the port binds, is in handbook
chapter 02, section "Startup order".

## Run

```bash
npx tsx examples/tutorials/131-configuration-and-bootstrapping/run.ts
```

It is part of `npm run examples`. Hermetic: a temporary key directory is created and removed,
and nothing is sent over the network.
