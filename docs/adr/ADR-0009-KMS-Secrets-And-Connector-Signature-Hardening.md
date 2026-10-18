# ADR-0009 — KMS-Backed Signing, Managed Secrets, and Connector Signature Verification

**Status:** Partially implemented (updated 2026-09-15 — see note below; originally Proposed/roadmap-only)

**Date:** 2026-09-13

**Update (2026-09-20):** AWS KMS refuses a raw Ed25519 message over 4096 bytes, which broke signing of a full Execution Trust Record in production. A message over that size is now signed as a fixed size commitment, see `ADR-0010-Large-Message-Signing-Under-KMS.md`.

**Update (2026-09-15):** Architecture §1 (gateway signing key → AWS KMS) and §4 (Paytm connector signature verification) are now built — see `ROADMAP.md`'s "Secrets, Signing-Key Custody & Connector Signature Hardening" section and `docs/CLAIMS.md`'s 2026-09-15 update on the G-40 entry for exact status and verification evidence. Architecture §2 (opaque connector secrets → AWS Secrets Manager) and §3 (GitHub App credential elimination) remain not built. **Update (2026-09-16):** Full setup guide and troubleshooting record for everything in this
ADR: `docs/site/deployment/aws-kms-signing.mdx` and
the 2026-09-15 KMS migration troubleshooting guide (in git history). Five additional real
production bugs were found and fixed getting this live — none visible from code review,
only from testing against real Vercel/AWS/traffic — full detail in those documents and in
`docs/VERIFICATION-GAPS.md` G-48/G-49.

**Update (2026-09-15, later same day):** Provisioning Step 1 (IAM OIDC identity provider + role) is now also done — `arn:aws:iam::013659367671:role/parmana-vercel-kms-signer`, trust policy scoped to this specific Vercel project/environment (`parmana-api-real`, production only), least-privilege policy limited to `kms:Sign`/`kms:GetPublicKey`/`kms:DescribeKey` on the one gateway key. Not yet done: setting `AWS_ROLE_ARN`/`AWS_REGION`/`KEY_PROVIDER=aws-kms` on the actual Vercel project (Provisioning Step 3) and Step 4 (deleting `PARMANA_KEY_MATERIAL_JSON` once the above is live and verified) — see `ROADMAP.md`'s update for full detail.

**Decision Makers:** Parmana Architecture Team

---

# Context

A code-level audit (reading `process.env` call sites and the actual connector wire
protocol, not documentation) found that Parmana's gateway signing key and its
connector credentials are all plaintext environment variables, and that one
connector's remote counterpart never verifies a cryptographic signature at all.

## Finding 1: gateway signing key material sits in `.env` / on local disk

`PARMANA_KEY_MATERIAL_JSON` (`packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts`),
when set, is a JSON object carrying the Ed25519 private key PEM directly in the
environment. When unset, the equivalent `default.private.pem` / `gateway.private.pem`
files sit in `./keys/` on the same host as `.env` (confirmed present on disk in this
repo). This key signs every Execution Authorization, Trust Record, Refusal Record,
and Attestation the gateway issues (`packages/crypto/src/VerificationCrypto.ts`,
`RefusalCrypto.ts`, `AuditEventCrypto.ts`, `ReceiptCrypto.ts`, `PolicyChangeCrypto.ts`,
`ExecutionChainCrypto.ts`, and `packages/runtime/src/RuntimeAuthorizationSigner.ts`
all call `KeyProvider.getPrivateKey()` and sign locally). Anything with the same
filesystem/host access as the running process — a compromised dependency, a coding
agent operating in this environment, a leaked deploy credential — can read this key
and forge cryptographically valid records for actions that were never policy-approved.

## Finding 2: connector credentials are plain env reads, several long-lived and unscoped

- `GITHUB_APP_PRIVATE_KEY` (`packages/api/src/bootstrap/createGitHubCredentialProvider.ts`):
  the GitHub App's actual private key. The connector's "ephemeral credential" design
  claim (docs/CLAIMS.md Claim 1) only covers the installation token it mints — the
  master key that mints those tokens is a static env var.
- `HUBSPOT_PRIVATE_APP_TOKEN`: a long-lived static bearer token, used as-is.
- `PAYTM_CONNECTOR_SHARED_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`: static
  credentials with no rotation mechanism, direct unscoped access to their respective
  backends.

## Finding 3: the Paytm connector's wire protocol has no signature check — a deeper gap than secrets-at-rest

Traced `packages/execution-gateway/src/connector-execution/GatewayPaytmAdapter.ts`
(sender) against `parmana-paytm-agent/src/server/handler.ts`'s
`executeAuthorizedConnectorRequest` (receiver, in the separate `parmana-paytm-agent`
repository, `D:\last\parmana-paytm-agent`): the `authorization.payload` sent over the
wire is plain, unsigned JSON (`{businessTransactionId, grantedCapability}`). The
receiving service's only checks are the bearer shared secret
(`PAYTM_CONNECTOR_SHARED_SECRET`) and a string match on `businessTransactionId`. There
is no cryptographic proof that Parmana's policy engine actually approved the request.
**Whoever holds the shared secret can call `POST /connector/paytm-refund` directly
with self-chosen `orderId`/`txnId`/`amount`, skipping Parmana's policy engine, rate
limits, and spend caps entirely.** This is not fixed by relocating the shared secret
to a better secrets store — it requires adding a signature check to the wire protocol
itself. (A separate, already-correct path exists: `/agent/refunds` calls back into
real Parmana policy via `ParmanaRefundAuthorizer` — only `/connector/paytm-refund`,
the path the Gateway itself calls after already authorizing internally, has this gap.)
**Correction (2026-09-28, G-70):** `/agent/refunds` was not correct. After Parmana approved,
it also called Paytm itself, while Parmana had already released the refund through
`/connector/paytm-refund`, so an approved refund could be paid twice. Fixed in
`parmana-paytm-agent` PR #6; see `docs/VERIFICATION-GAPS.md` G-70.

## Deployment context

Parmana runs on Vercel (serverless Functions), not Kubernetes — there is no
persistent cluster to self-host a secrets server on, and there is no separate
"agent" deployment in this codebase to isolate from "the gateway" (no `packages/agent`
exists; an external caller only ever reaches Parmana over `POST /execute` with an
API key — it never had filesystem access to `.env` in the first place). Two
"ready-to-execute" implementation prompts proposing a Kubernetes + HashiCorp Vault
migration were reviewed and rejected: both assumed infrastructure this deployment
doesn't have, both referenced file paths that don't exist in this repo
(`packages/api/src/connectors/*`, `ExecutionAuthorizationGateway.ts`,
`createSupabaseConnector.ts`), and both proposed fetching the raw private key into
the process from a KV-style store rather than a true sign-without-release key.

---

# Decision

Parmana SHALL move its signing key to a provider that never releases private key
material, and SHALL add a cryptographic signature check to the Paytm connector's
wire protocol. Connector credentials that are not signing keys SHALL move to a
managed secrets store rather than `process.env`. The GitHub App credential SHALL be
eliminated entirely rather than relocated.

This ADR proposes the target architecture and file-level plan. **No implementation,
infrastructure provisioning, or code change has been made under this ADR yet** — it
is the accepted design for follow-up work.

---

# Architecture

## 1. Gateway signing key → AWS KMS (sign-without-release)

AWS KMS added Ed25519 support in November 2025 (`ECC_NIST_EDWARDS25519` key spec,
`ED25519_SHA_512` signing algorithm), matching Parmana's existing
`PRIMARY_SIGNATURE_PROVIDER=ed25519` default — no signature algorithm migration is
required to adopt it.

This is not a drop-in swap of the existing `KeyProvider` interface: AWS KMS never
exports private key material, so `KeyProvider.getPrivateKey(): Promise<KeyObject>`
cannot be honestly implemented against a real KMS key. The seven call sites listed
in Finding 1 that currently do `getPrivateKey()` + local `crypto.sign()` need to call
a `sign(keyId, data)` operation instead. New abstraction, mirroring the existing
`KeyProvider`/`KeyBootstrap` pattern:

- `packages/crypto/src/Signer.ts` — new interface: `sign(keyId, data): Promise<Buffer>`.
- `packages/crypto/src/providers/signer/LocalFileSigner.ts` — wraps the existing
  `FileKeyProvider` unchanged; preserves current dev/test behavior exactly.
- `packages/crypto/src/providers/signer/KmsSigner.ts` — `sign()` via
  `@aws-sdk/client-kms`'s `SignCommand`; `getPublicKey()` via `GetPublicKeyCommand`;
  `getPrivateKey()` throws loudly rather than silently, so a missed call site fails
  fast during migration.
- `packages/crypto/src/SignerBootstrap.ts` — reuses the already-reserved
  `KEY_PROVIDER=aws-kms` value in `packages/shared/src/config/KeyProviders.ts`
  (defined today but unimplemented — `KeyBootstrap.ts` explicitly throws until "a
  real provider class exists," which is exactly this work).
- `packages/api/src/routes/keys.ts` currently constructs `new FileKeyProvider()`
  directly, bypassing `KeyBootstrap.create()` — this must be fixed to resolve the
  key provider through bootstrap, or the public-key discovery endpoint
  (`GET /keys/:keyId`, `GET /.well-known/jwks.json`) will keep serving stale local
  keys after the KMS migration.
- `packages/api/src/bootstrap/assertSigningKeyMaterialConfigured.ts` gains a KMS
  branch verifying the configured key is reachable and is `ECC_NIST_EDWARDS25519`/
  `SIGN_VERIFY`, parallel to the existing local-file check.

AWS authentication uses no static keys: `@vercel/oidc-aws-credentials-provider`'s
`awsCredentialsProvider()` exchanges Vercel's per-invocation OIDC token for
short-lived STS credentials via `AssumeRoleWithWebIdentity` (first-party, documented
at `vercel.com/docs/oidc/aws`).

## 2. Opaque connector secrets → AWS Secrets Manager

`HUBSPOT_PRIVATE_APP_TOKEN`, `PAYTM_CONNECTOR_SHARED_SECRET`, and
`SUPABASE_SERVICE_ROLE_KEY` are bearer credentials, not signing keys — KMS's
sign-without-release property doesn't apply to them, so a managed KV secrets store
is the correct fit here (deliberately different from the signing key's design).

- `packages/shared/src/config/SecretsProvider.ts` — `EnvSecretsProvider` (default,
  today's `process.env` behavior, unchanged for dev/test) and
  `AwsSecretsManagerProvider` (`@aws-sdk/client-secrets-manager`, cached, same
  OIDC-federated AWS credentials as the KMS signer).
- `createHubSpotCredentialProvider.ts` and `createPaytmCredentialProvider.ts`
  resolve their secret through `SecretsProvider` instead of `process.env` directly.
- Supabase config reading in `packages/shared/src/config/Config.ts` /
  `ConfigValidation.ts` follows the same pattern.
- New `PARMANA_SECRETS_PROVIDER=env|aws-secrets-manager` env var, mirroring the
  existing `PARMANA_STORAGE` / `KEY_PROVIDER` convention already in this codebase.

## 3. GitHub App credential → eliminated via Vercel Connect

Not relocated — removed. `@vercel/connect`'s
`getToken(connector, { subject: { type: "app" } })` mints a GitHub App installation
token on demand; `GITHUB_APP_ID` / `GITHUB_INSTALLATION_ID` / `GITHUB_APP_PRIVATE_KEY`
are deleted from `.env` and never re-provisioned. Only
`createGitHubCredentialProvider.ts`'s production branch changes; the existing
`NODE_ENV=test` branch (generated throwaway RSA keypair against the hermetic mock
server) is untouched.

## 4. Paytm connector: add signature verification to the wire protocol

**Parmana side** (`GatewayPaytmAdapter.ts`): build a canonical, unambiguous string —
`${businessTransactionId}|${action}|${orderId}|${txnId}|${amount}|${expiresAt}`
(pipe-delimited rather than JSON, to avoid key-ordering disagreements between two
independently maintained repos; `expiresAt` = now + a short TTL to block replay).
Sign it with the `Signer` abstraction from §1 (the same gateway key already used for
Trust Records). Add `signature` (base64), `keyId`, and `expiresAt` to the outbound
`authorization` object.

**`parmana-paytm-agent` side** (`src/server/handler.ts`'s
`executeAuthorizedConnectorRequest`): fetch Parmana's public key via
`GET ${PARMANA_API_URL}/keys/${keyId}` — deliberately mounted ahead of Parmana's
caller-auth middleware for exactly this reason, so no API key is needed for this
call. Rebuild the identical canonical string, verify with Node's built-in
`crypto.verify(null, data, publicKeyObject, signature)`, reject on an expired
`expiresAt`. This check is additive to the existing bearer-secret check, not a
replacement (defense in depth), and applies only to `/connector/paytm-refund` — the
already-governed `/agent/refunds` path is untouched.

---

# Consequences

## Positive

- The gateway's private signing key material never leaves KMS, even under full
  process/host compromise — only signing operations are possible, not exfiltration.
- The GitHub App credential is eliminated from Parmana's environment entirely rather
  than merely relocated.
- The Paytm connector's authorization boundary becomes cryptographic instead of
  "possession of one shared secret," closing the ability to bypass Parmana's policy
  engine, rate limits, and spend caps via that path.
- Reuses this codebase's existing extension points (`KeyProviders.AWS_KMS` was
  already reserved; the `PARMANA_STORAGE`/`KEY_PROVIDER` env-var-selected-provider
  convention already exists) rather than introducing a parallel pattern.

## Negative

- Seven signing call sites move from "hold a `KeyObject`, sign locally" to
  "call an async `sign()`" — a real refactor, not a config change.
- Introduces a hard dependency on AWS (KMS + Secrets Manager) and on Vercel's OIDC
  federation being correctly configured; a misconfigured trust policy fails startup
  (by design — fail closed, matching this codebase's existing convention in
  `assertSigningKeyMaterialConfigured.ts` and `createCallerAuthenticator.ts`).
- The Paytm signature fix requires a coordinated change across two independently
  deployed repositories.

These trade-offs are accepted because the alternative — a raw private key readable
by anything with host access, and a connector wire protocol with no cryptographic
authorization check — is the exact gap this ADR exists to close.

---

# Rejected Alternatives

## Vault-on-Kubernetes

Rejected: this deployment runs on Vercel serverless Functions, not Kubernetes; there
is no cluster to host a Vault server on, and the proposal's "isolate the agent pod
from the gateway pod" premise doesn't apply — there is no separate agent service in
this codebase.

## Fetching the raw private key into the process (Vault KV / Secrets Manager KV)

Rejected for the _signing key specifically_ (opaque connector secrets, which have no
meaningful "sign-only" operation, are fine in Secrets Manager): this only relocates
where the private key rests at rest, and a fully compromised process can still read
it into memory and exfiltrate it. KMS's `Sign` API never releases the key at all.

---

# Explicitly Out of Scope

- No fabricated timelines, costs, or "locked" figures. Earlier reviewed prompts
  invented specific numbers ("$1–2/month," "3 hours," "SOC 2 Type II certified")
  that have no verified basis and are not repeated here.
- No investor-pitch or external messaging documents.
- Whether `parmana-paytm-agent` itself adopts KMS/Secrets Manager for its own
  `PAYTM_MERCHANT_KEY` / `AGENT_API_KEY` — a separate, later decision.

---

# Provisioning Steps (for implementation time, not yet executed)

1. **AWS**: create an IAM OIDC identity provider trusting `https://oidc.vercel.com/<team-slug>`
   (or global-mode `https://oidc.vercel.com`); create an IAM role with a trust policy
   scoped to Parmana's specific Vercel project (`aud`/`sub` conditions, not a blanket
   trust); attach a least-privilege policy: `kms:Sign` / `kms:GetPublicKey` /
   `kms:DescribeKey` on exactly the one gateway KMS key ARN, and
   `secretsmanager:GetSecretValue` on exactly the three secret ARNs — no wildcards.
2. **AWS**: `aws kms create-key --key-spec ECC_NIST_EDWARDS25519 --key-usage SIGN_VERIFY`;
   create the HubSpot / Paytm / Supabase secrets in Secrets Manager.
3. **Vercel**: set `AWS_ROLE_ARN`, `AWS_REGION`, `KEY_PROVIDER=aws-kms`,
   `PARMANA_SECRETS_PROVIDER=aws-secrets-manager`; run `vercel connect create github`
   (interactive — requires a browser step to install/authorize the GitHub App) and
   wire in the resulting connector id.
4. Delete `PARMANA_KEY_MATERIAL_JSON`, `GITHUB_APP_PRIVATE_KEY`,
   `HUBSPOT_PRIVATE_APP_TOKEN`, `PAYTM_CONNECTOR_SHARED_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY` from Vercel's env vars and the local `.env` — only
   after the above is live and verified, never before.
5. **`parmana-paytm-agent`**: no new secret is needed for the signature check itself
   (it fetches Parmana's public key live over HTTP at verification time).

---

# Verification Plan

- Unit tests for `LocalFileSigner` (existing suite must pass unchanged) and new unit
  tests for `KmsSigner` against a mocked `@aws-sdk/client-kms` client (no real AWS
  calls in CI).
- New assertion on `GatewayPaytmAdapter`'s outgoing request shape
  (`signature`/`keyId`/`expiresAt` present).
- New tests on `parmana-paytm-agent`'s `executeAuthorizedConnectorRequest`: valid
  secret + valid signature succeeds; valid secret + missing/forged signature is
  rejected; valid secret + expired signature is rejected. This directly tests the
  exploit this ADR closes.
- Extend the existing `paytm-refund.integration.test.ts` (Parmana) and its
  `parmana-paytm-agent` counterpart to exercise the full signed flow through the
  hermetic mock server on both sides.

---

# Open Decisions

- Branch strategy across the two repositories — not yet decided.
- Whether `parmana-paytm-agent` separately adopts KMS/Secrets Manager for its own
  credentials — out of scope for this ADR.
- AWS region — assumed `us-east-1` in the steps above pending confirmation.

---

# Impact

Until this ADR is implemented, the gateway's signing key remains readable by
anything with the process's filesystem access, and the Paytm connector's wire
protocol remains bypassable by anything holding
`PAYTM_CONNECTOR_SHARED_SECRET` alone. This ADR is the accepted target architecture
for closing both gaps; it supersedes the two Kubernetes/Vault-based proposals that
were reviewed and rejected during its drafting.
