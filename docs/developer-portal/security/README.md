# Security and cryptographic verification

[Portal home](../README.md) · [Evidence verification](evidence-verification.md) · [Architecture](../architecture.md) · [Repository threat model](https://github.com/pavancharak/parmana-core/blob/main/THREAT-MODEL.md) · [Security policy](https://github.com/pavancharak/parmana-core/blob/main/SECURITY.md)

This page explains what Parmana signs, what the signatures cover, how the keys are trusted, and what happens when something goes wrong. The claims are checked against the code and against tests run for this portal. Where the protection has a limit, the limit is stated next to the claim.

For the full threat model, read [THREAT-MODEL.md](https://github.com/pavancharak/parmana-core/blob/main/THREAT-MODEL.md). For how to report a vulnerability, read [SECURITY.md](https://github.com/pavancharak/parmana-core/blob/main/SECURITY.md).

## What is signed

| Object                      | Signed by                                                           | Algorithm                                         | Purpose                                                                                                   |
| --------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Execution Trust Record**  | the deployment's `default` key                                      | Ed25519; optionally also ML-DSA-65 (`dilithium3`) | The evidence for one Business Transaction: the transaction, the authorization, the decision, the outcome. |
| **Gateway attestation**     | the `gateway` key                                                   | Ed25519                                           | The gateway's statement about a release. Its public half is in the key directory.                         |
| **Receipt**                 | the deployment's signing key (and the secondary key in hybrid mode) | Ed25519 (ML-DSA-65 secondary in hybrid mode)      | A signed statement that a verified record existed, with its hash.                                         |
| **Approval artifact**       | the approver's own key                                              | Ed25519                                           | A human's approval for one action, scoped by capability, target, amount, expiry, and single use.          |
| **Policy step-up envelope** | the checker's own key                                               | Ed25519                                           | A checker's approval of one policy change, valid for 120 seconds.                                         |
| **Approval record**         | the deployment's signing key                                        | the signing key's algorithm (Ed25519 by default)  | The stored approval of a policy version, written when the checker's approval succeeds.                    |

## Hashing and canonical JSON

- Every signed structure is first turned into **canonical bytes**. The rule is the same in the server, the TypeScript SDK, the Python SDK and the standalone verifier: object keys sorted by code unit, array order kept, no insignificant whitespace, non-ASCII characters written as they are, encoded as UTF-8.
- The record's `trustRecordHash` is the lowercase hexadecimal **SHA-256** of the canonical bytes of the covered content.
- Signatures are computed over those canonical bytes (or over the hash, for the hybrid envelope).
- Fingerprints of public keys are `sha256:` plus the SHA-256 of the key's SPKI DER encoding, as 64 lowercase hex digits.

Verified: changing one covered field of a record changes `trustRecordHash`, and both the hash and the signature checks fail (the three verifiers agree).

## Trust roots

A signature proves only that the holder of a key made it. Whether to believe a record depends on which keys you trust:

- **Your trust root** is a set of public keys that you chose and checked. Pin each one by its fingerprint, compared with a value from a second source. [Evidence verification](evidence-verification.md#step-2-pin-the-keys-you-trust) shows the steps.
- **The server publishes** its keys at `GET /keys/{keyId}` and `GET /.well-known/jwks.json`. A published key is a candidate for pinning. It is not a trust decision on its own.
- **Approver keys** are trusted through approval-issuer governance (a person proposes and another approves; see [Manage approvers](../../../docs/site/guides/manage-approvers.mdx)). Test deployments may trust a local test approver through `PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE`, only with `NODE_ENV=test`. The server refuses that setting in any other environment.
- **Checker step-up keys** are stored in the checker's caller entry (`stepUpPublicKey`).

## Schema versions and coverage

The record's `schemaVersion` says which fields the signatures cover. The verifier reports this as `coverage`. The [complete schema 3 reference](schema-v3.md) covers the cutover, the configuration, the decision and the rollout.

| Schema version         | What the signatures cover                                                                                                                                  | Coverage reported | Default on this build                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------- |
| **2** (or unversioned) | Seven top-level fields: `trustRecordId`, `businessTransactionId`, `transaction`, `authorization`, `overrides`, `executions`, `createdAt`.                  | `legacy`          | No. Rollback only (`HYBRID_SCHEMA_VERSION=2`). |
| **3** (hybrid)         | Every top-level field except `signature`, `signatures`, `schemaVersion`, `verifications` and `receipts`. `schemaVersion` is covered by the hybrid message. | `full`            | **Yes**, since 2026-11-20 (ADR-0016).          |

**Verified in this portal, on records from the same run:**

| Change to the record                               | Schema 2 (`legacy`)                                   | Schema 3 (`full`)              |
| -------------------------------------------------- | ----------------------------------------------------- | ------------------------------ |
| A covered field (`executions[0].decision.outcome`) | Detected: `trustRecordHash mismatch`, signature fails | Detected                       |
| An uncovered field (`updatedAt`)                   | **Not detected: `valid: true`**                       | Detected: both signatures fail |

So a schema 2 record's `valid: true` tells you only that its covered fields are unchanged. It does not cover `updatedAt`, `evidenceAnchor`, `verifications` or `receipts`. A party who can write to the stored file can change those without the check failing. The verifier documents this in its format notes; this portal reproduced it.

**Schema 2 can also be stripped.** `schemaVersion` is not covered by the legacy signature. Someone who can write to stored records could remove the hybrid envelope and set the version to 2. The fix is `hybridRequiredFrom` in the trust file, which requires a hybrid envelope for records created at or after a cutover time.

**Schema 3 is the default.** Hybrid signing makes the server issue schema 3 records. Configure hybrid signing:

```bash
CRYPTO_MODE=hybrid
PRIMARY_SIGNATURE_PROVIDER=ed25519
SECONDARY_SIGNATURE_PROVIDER=dilithium3
# HYBRID_SCHEMA_VERSION is 3 when unset. Set 2 only to roll back.
```

Verified: with this configuration, a record reported `"coverage":"full"` under the verifier's default trust rules (no legacy flags), and the TypeScript and Python SDK offline checks agreed (`coverage: "full"`). A tampered copy was rejected by all three. The server's source describes the schema 3 setting as an issuance decision (ADR-0016), and it is off unless set. Choose it deliberately for production, and confirm the verifiers you hand records to accept it.

Configuration notes:

- **`CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER` breaks execution.** The action is released, and the server then fails to produce the record. In a run for this portal the response was `500` with `Secondary signature provider is not configured.` See [Troubleshooting](../troubleshooting/README.md#hybrid-signing-without-a-secondary-provider-now-refused-at-start-up).
- The secondary key must be a `dilithium3` (ML-DSA-65) key, generated with the repository's key script (`scripts/generate-keypair.ts --algorithm dilithium3`) or equivalent. This needs Node.js 24 with OpenSSL 3.5 or later.

## Tamper detection

Verified results, using one record and the same pinned keys:

| Test                                               | Result                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Original record, schema 2, legacy settings         | `valid: true`, exit 0                                                               |
| Changed covered field                              | `valid: false`, `trustRecordHash mismatch`, `signature verification failed`, exit 1 |
| Original hybrid record, schema 3, default settings | `valid: true`, `coverage: full`                                                     |
| Hybrid record, changed field                       | `valid: false`, hash and both signatures fail                                       |
| Record signed by a different key                   | `signature verification failed for keyId "default"`                                 |

The verifier's trust rules add more checks: a key whose PEM does not match its fingerprint is not used; a compromised key rejects its signatures whatever their timestamp; a record created outside a key's validity window is not verified with that key.

## Evidence integrity

- The record is signed when it is written. Verifications and receipts are attached afterwards, and the record's signature does not cover them (for schema 2 and 3 alike). Keep the signed record as your evidence, and treat verifications and receipts as separate, dated statements.
- `replay` checks the stored hash and signature again. It does not evaluate the policy and does not execute anything.
- `receipt` requires the record to be `VERIFIED` first.
- A **refusal** is recorded too. A refused execution has a refusal record, signed, retrievable by its business transaction id.

## Fail-closed behaviour

Parmana refuses rather than guesses. These behaviours were observed:

| Situation                                                                               | Behaviour observed                                                                    |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| The server starts without a policy directory                                            | Refuses to start: `PARMANA_POLICY_DIR is not set.`                                    |
| `NODE_ENV=production` with memory storage (the default when `PARMANA_STORAGE` is unset) | Refuses to start, before the port is bound: memory is not durable.                    |
| `CRYPTO_MODE=hybrid` without `SECONDARY_SIGNATURE_PROVIDER`, or equal to the primary    | Refuses to start. Earlier builds released actions first, then failed to record them.  |
| The server starts without a signing key directory                                       | Refuses to start: `PARMANA_KEY_DIR is not configured.`                                |
| No approval, or an approval that does not verify                                        | Refused with `403`.                                                                   |
| An approval reused, expired, or for another target                                      | Refused with `403`, `humanApproved` verified as false.                                |
| The policy version is not the one in effect                                             | Refused with `403`: "was superseded".                                                 |
| A policy version with no approval record                                                | Refused with `403`: "has no PolicyChangeApprovalRecord".                              |
| The payment source does not answer (refund policy)                                      | Refused: `SOURCE_UNAVAILABLE`.                                                        |
| A bad or missing caller key                                                             | `401`. Nothing is evaluated.                                                          |
| The test approver configured outside `NODE_ENV=test`                                    | Refuses to start.                                                                     |
| `DATABASE_PROVIDER` set (a removed setting)                                             | Refuses to start: `DATABASE_PROVIDER is no longer read; set PARMANA_STORAGE instead.` |
| The action released, but the record cannot be signed                                    | `500`: the action ran; do not resubmit.                                               |
| The action released, then the connector call fails                                      | `502`, `EXECUTION_OUTCOME_UNKNOWN`: reconcile.                                        |

## Caller authentication

- Keys are sent as `Authorization: Bearer <key>`. The server holds only the SHA-256 hash of each key (`PARMANA_API_KEYS`).
- The OpenAPI document states that the stored hash is compared in constant time.
- Repeated authentication failures are rate limited (`RATE_LIMIT_AUTH_FAILURE_PER_MINUTE`).
- A key may act only for its allowed principals and invoke only its allowed capabilities, and the server checks both on every request.

## Key management

| Item                                | Where it lives                                                                                      | Notes                                                                |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Signing key (`default`)             | The key directory (`PARMANA_KEY_DIR`) for `KEY_PROVIDER=local`, or a KMS for `KEY_PROVIDER=aws-kms` | The server signs with it and never returns it.                       |
| Gateway key (`gateway`)             | The key directory, or KMS                                                                           | Signs gateway attestations.                                          |
| Secondary key (`default-secondary`) | The key directory                                                                                   | Required for hybrid mode.                                            |
| Approver keys                       | The approver's own machine                                                                          | The server holds only the public key.                                |
| Checker step-up keys                | The checker's own machine                                                                           | The server holds only the public key, in the checker's caller entry. |
| Caller keys                         | The caller's secret store                                                                           | The server holds the hash. Shown once, when generated.               |

**Rotation.** The repository has `scripts/rotate-verification-key.ts` (`npm run rotate:verification-key`). It was not run in this verification. Rotate a signing key only with the old public key kept in your trust set, so records signed before the rotation still verify. Mark an old key `compromised` only when you must reject its signatures.

**KMS.** `KEY_PROVIDER=aws-kms` is supported. The server checks that a KMS key is reachable at start-up, and the signing algorithm is restricted to Ed25519 in that mode. The verification script `npm run verify:kms` was not run here.

**Never** put a private key in a repository, an environment variable shown in logs, or a shared secret store that the signer cannot control. `PARMANA_KEY_MATERIAL_JSON` can carry key material that the server writes into the key directory at boot (see the comments in the repository's `.env.example`). Treat that variable as a secret, and see [Environment variables](../reference/environment-variables.md).

## Limits

- **Coverage** depends on the schema version. Schema 2 leaves most fields outside the signature (see above).
- **The signature proves the key holder made it, not that the business action happened.** Use the connector's own records and the correspondence report to show that the action ran as recorded.
- **Trust is only as good as the pinned keys.** An attacker who controls your trust file controls what you believe.
- **Source answers are as good as the source.** A sourced fact is only as trustworthy as the registered source that answers it.
- **Records from a deployment with no storage durability are lost on restart.** Memory storage is for development only.
- **`/v2/*`, `/execution-intents/*` and `/kill-switch/*` are experimental or opt-in.** Read their status in the [API overview](../api/README.md#experimental-and-opt-in-routes).

## Checklist for a production deployment

- [ ] Hybrid signing with schema 3 is configured, and the verifiers you hand records to accept `coverage: full`.
- [ ] `NODE_ENV=production`, PostgreSQL storage, and no test approver or auth-disabled setting.
- [ ] Signing keys in a KMS or a key directory the server alone can read; approver and checker keys with their owners.
- [ ] Trust files pinned by fingerprint, compared with a second source.
- [ ] `hybridRequiredFrom` set in every trust file, so a schema 2 stripping attack is refused for records created after the cutover.
- [ ] Policy changes approved through maker-checker, and `POLICY_CHANGE_CHECKERS` set to named people.
- [ ] Caller keys scoped to their capabilities and principals, and reviewed.
