# 3.18 Deployment Infrastructure Requirements (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 1752-1782.

## Exact claim text

## 3.18 Deployment Infrastructure Requirements (Scoped)

**Claim:** running Parmana in production requires new infrastructure of its own — a container process, signing key material, and (for anything beyond a single ephemeral instance) a Postgres database via Supabase. Parmana does not read, write, or replace an integrated system's own database, and every connector it can call out to is additive and individually optional: unset its credentials and the connector is simply not registered, with no effect on Parmana's own boot or on the external system itself.

**New, required to run Parmana at all (`docs/site/deployment/production.mdx`, `Dockerfile`):**

- **A container process.** One Docker image (`Dockerfile`), one process per container, running `packages/api/dist/server.js`, deployable to any Docker-based platform — validated with a bare `docker build`/`docker run`, not tied to a specific PaaS's proprietary build system.
- **Signing key material.** Two key pairs (`default`, the authorization-signing key; `gateway`, the Execution Gateway's attestation-signing key — deliberately separate, `PARMANA_GATEWAY_KEY_ID` overridable) are required in `PARMANA_KEY_DIR`. Neither is generated automatically, and the image's `keys/` directory ships empty on purpose — key material must never be baked into the image (`Dockerfile`'s own comment). Supplied either as mounted `.pem` files or via `PARMANA_KEY_MATERIAL_JSON`. `assertSigningKeyMaterialConfigured.ts` (`packages/api/src/bootstrap/`) fails closed at boot — before the port binds — if neither is present.
- **A PostgreSQL database, self-hosted or hosted by a provider such as Supabase, for anything other than a disposable single instance.** `PARMANA_STORAGE=memory` (the default) needs no external database for business-transaction/execution-trust-record data — but the caller-authentication audit trail (`CallerAuditSink`) and the envelope-verifier's replay-protection store (`NonceStore`) are **always** PostgreSQL-backed in any non-test deployment, never falling back to in-memory regardless of `PARMANA_STORAGE`, and both fail closed at boot if `DATABASE_URL` is not configured — via `assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (not `assertStorageConfigured.ts`, which validates only business-transaction/execution-trust-record storage, gated on `PARMANA_STORAGE=supabase` or `postgres`; see that file's own doc comment). `SUPABASE_URL` itself is not read by this check — `DATABASE_URL` is the only variable that satisfies it, a documented, temporary substitute pending resolution of Supabase ticket SU-437429. In practice, precisely stated: a real deployment always needs Supabase for the audit trail and nonce store; `PARMANA_STORAGE=supabase` additionally routes business-transaction/execution-trust-record storage through the same database rather than memory. There is no configuration under which a real (non-test) deployment runs with zero external database.
- **The schema applied to that database, manually.** `supabase/migrations/` must be applied to the target PostgreSQL database before a real deployment can serve traffic. The tracked runner, `npm run db:migrate -- apply`, applies each file once. `scripts/apply-all-migrations.sql` (a concatenation of every migration file) is for an empty database only. **Corrected 2026-09-25:** this section used to call the bundle idempotent and safe to run again. It is not safe to run again on a database that holds data (`docs/internal/VERIFICATION-GAPS.md` G-61). The container itself does not migrate at boot. The Docker Compose deployment of 2.40 runs the migrations for it, each once, and since 2026-09-25 `npm run db:migrate` does the same for any Postgres, with `baseline` for a database set up with the bundle (G-61, closed).
- **Caller authentication configuration.** `PARMANA_API_KEYS` (a JSON array of `{callerId, keyHash}` entries) is required; the process refuses to start without it, unless `PARMANA_AUTH_DISABLED=true` is explicitly set for local development only (logs a loud warning on every boot — never set in a real deployment).

**Not new, not replaced:** an integrated business's own operational database, its own audit/SIEM infrastructure, and every external system a connector calls are untouched by any of the above. Parmana holds no credential for and makes no call to a connector's external system unless that connector is explicitly configured — an unconfigured connector has zero footprint against the system it would have integrated with. Parmana's own database (Supabase) stores only Parmana's authorization/audit/execution-trust-record data, never an integrated business's operational records; callers provide business context to Parmana via signals in each request, not the reverse.

**What this claim does not assert:** deployment footprint, cost, or scaling characteristics beyond what `docs/site/deployment/production.mdx` documents (this is a correctness/completeness claim about _what infrastructure is required_, not a capacity or performance claim); a packaged one-command installer, database-schema auto-migration at boot, or a signing-key-generation tool — none of these exist in this repository today (schema application and key generation are both manual operator steps, described above and in `docs/site/deployment/production.mdx`, not automated by anything Parmana ships). **Update 2026-09-25:** for the self hosted Docker Compose deployment, all three now exist and are claimed, scoped, in 2.40: one command start, migrations applied by the `migrate` service, and key and API key generation by the `setup` service. For the image run on its own, this paragraph still holds.

**Update 2026-10-06, server image provenance:** `.github/workflows/server-image.yml` builds this `Dockerfile` when a GitHub release is published, pushes it to `ghcr.io/pavancharak/parmana-api:<release tag>`, and attaches SLSA build provenance (`slsa-github-generator` `generator_container_slsa3.yml`) to the image digest in the registry. Claimed only once a release has run it; until then no published image exists. The provenance covers that image only: the hosted API and the sandbox are built by Vercel, not from this image, and carry no SLSA provenance. It shows which commit and workflow built the image, not that the image is free of defects.

**Update 2026-10-23, first published image:** release `server-v1.0.1` published `ghcr.io/pavancharak/parmana-api:server-v1.0.1` from commit `72a71f2`, digest `sha256:7e17dfb8e1e5e391cc0acd0a2a19801d1b1b888b529ee75a977846c219dce97c`, built on Node 24.22.1, with its SLSA provenance created, signed and attached (workflow run 39885625781, attempt 2). The first attempt and the `sdk-v1.6.1` run failed with `denied: permission_denied: write_package`: the package was linked to the old `parmana` repository. `parmana-core` now has write access to the package and the old repository's access was removed.

Evidence

- `docs/site/deployment/production.mdx` (the authoritative deployment runbook this claim is drawn from, which replaced the root `DEPLOYMENT.md` on 2026-09-28: required configuration, storage, schema application, caller authentication, health checks, graceful shutdown)
- `Dockerfile` (single-image, single-process build; `keys/` deliberately empty in the image; non-root runtime user)
- `packages/api/src/bootstrap/assertStorageConfigured.ts` (business-transaction/execution-trust-record storage, gated on PARMANA_STORAGE=supabase or postgres), `assertSigningKeyMaterialConfigured.ts` (fail-closed startup validation, before the port binds)
- `packages/api/src/bootstrap/assertDatabaseUrlConfigured.ts`, called unconditionally from `createCallerAuditSink.ts`/`createNonceStore.ts` (the actual fail-closed check for CallerAuditSink/NonceStore described above; checks DATABASE_URL only)
- `packages/shared/src/config/StorageProviders.ts` (`memory`/`postgres`/`supabase`), `packages/shared/src/config/Config.ts` (the sole `process.env` read site for application config)
- `supabase/migrations/` (schema source), `scripts/apply-all-migrations.sql` (manual application path with no CLI link)

---


## Cited evidence paths

- `.github/workflows/server-image.yml`: EXISTS
- `docs/internal/VERIFICATION-GAPS.md`: EXISTS
- `docs/site/deployment/production.mdx`: EXISTS
- `packages/api/dist/server.js`: EXISTS
- `packages/api/src/bootstrap/`: EXISTS
- `packages/api/src/bootstrap/assertDatabaseUrlConfigured.ts`: EXISTS
- `packages/api/src/bootstrap/assertStorageConfigured.ts`: EXISTS
- `packages/shared/src/config/Config.ts`: EXISTS
- `packages/shared/src/config/StorageProviders.ts`: EXISTS
- `scripts/apply-all-migrations.sql`: EXISTS
- `supabase`: EXISTS
- `supabase/migrations/`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

No cited test file.
