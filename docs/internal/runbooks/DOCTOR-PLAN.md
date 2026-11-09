# Doctor for parmana-core: plan

Status: the three stages are built and merged. This plan is kept as the design record. The reference for everything about the doctor, including how to run it, what it checks, CI and commits, TLS, and troubleshooting, is `DOCTOR.md` in this folder.

## Decisions

1. **Deployment first: local.** The first stage covers local development: the memory store, and file-based keys. It needs no credentials or network. Production (Supabase, AWS) follows in stage 2, checked offline first against the production configuration shape.
2. **Online checks: yes, opt-in.** Database, storage and key-provider reachability run only with `--online`. The default run needs no credentials and makes no network calls.
3. **Output: the same format as the connect doctor.** One line per check, PASS, WARN or FAIL, with a fix line for each problem. Secret values are never printed.

## Principle

The checks live in the shared configuration package (`packages/shared/src/config/`), not in a separate script. The server's startup validation, the `/ready` route and the doctor command call the same functions. A check cannot pass in the doctor and then fail at startup, because the two share the code.

## Stages

**Stage 1: offline checks, local deployment.**

- Run the same loader and validation as the server, and collect every problem rather than stopping at the first.
- Check the key material exists, and that the verification key is published.
- Check conflicting settings, such as live keys enabled while the kill switch is off, or hybrid signing required with no secondary provider.
- Add `npm run doctor`, and tests for each check in the shared package.

**Stage 2: production configuration, offline.**

- The same checks, applied to a production-shaped configuration: PostgreSQL storage, AWS key provider, and the secrets provider.
- Refuse live settings unless the operator has enabled them explicitly.

**Stage 3: online checks, opt-in.**

- With `--online`: the database and storage are reachable, the nonce and audit tables exist, and the key provider can return the public key.
- Each network check warns, rather than fails, when its setting is missing.
- Errors report the error code only, never a connection string.

## Non-goals

- No change to startup behaviour. The server still fails closed exactly as it does now.
- No change to the `/ready` route's responses.
- Doctor does not write to any database, and does not create keys.

## Open items

- Whether the connect doctor and this doctor should share a list of required settings. A setting added to one should not be missing from the other.
