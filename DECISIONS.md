# DECISIONS: parmana-core (PRIVATE)

Baseline commit: `227182bf7f2099735bd2206cf9c99ea030db9172` (branch `claude/parmana-repo-separation-svz6oz`)

Copyright holder for all new material: Parmana Systems Private Limited.

## Section 2: Forbidden content

### 2.1 Forbidden in parmana-verifier (any file, any folder)
- Policy engine code, approval logic, maker-checker logic, execution gate
- Connector code for any service (Razorpay, Paytm, HubSpot, GitHub, Slack, or others)
- Signing keys of any kind, including test keys that match production keys
- KMS, secrets manager, or any key-management code
- Real secrets: API keys, tokens, passwords, webhook secrets, private keys, PEM blocks, connection strings with credentials
- Real `.env` files or `.env` files with real values
- Customer names, customer data, transaction data, or internal dashboards
- Production configuration: Vercel, Fly, Docker production settings, deployment secrets
- Patent drafts or any file describing a mechanism in the patent-drafts list (section 2.3)
- Planning, strategy, pricing, investor, or positioning documents
- Any file containing a forbidden claim phrase (section 2.4)

### 2.2 Forbidden in either repository
- Real secrets of any kind
- Real customer or transaction data, including test data copied from production
- Credentials for GitHub, cloud providers, or payment networks

### 2.3 Patent-drafts list (PATENT-RISK)
Any file that implements or documents these mechanisms is PATENT-RISK. PATENT-RISK files may only go in parmana-core:
1. Runtime Credential Isolation: `SessionCredentialSecureConnector`, `createConnectorRegistry.ts`, and the connector-wrapping logic
2. Cryptographically Signed Execution Audit Trail: `executeTransaction.ts` and signature-over-parameters-and-timestamp logic
3. Maker-Checker Policy Enforcement at Execution Time: `policyEngine.ts` and approval-routing logic
4. SignalIntentBinder and CapabilityPolicyBinder
5. Any other file that the patent attorney later adds to this list

### 2.4 Forbidden claim phrases
These phrases may not appear in any file in parmana-verifier. Check every file in parmana-core's public-facing docs too. Use case-insensitive matching.
- "structurally impossible"
- "cannot execute without approval"
- "no agent can bypass"
- "no agent can do anything without approval"
- "human-on-demand"
- "escalation" (when used to describe a working feature)

The phrase "Parmana" is allowed. Do not add new claims. Describe only what tests in the repository demonstrate.

## Section 3: Classification labels

- `PUBLIC`: allowed in parmana-verifier under section 4.1
- `PRIVATE`: allowed only in parmana-core
- `PATENT-RISK`: matches section 2.3. Goes in parmana-core only.
- `SECRET-RISK`: contains or may contain secrets, keys, tokens, `.env` values, or customer data. Goes in parmana-core only, after the secret values are removed in the copy.
- `REVIEW`: cannot be classified with certainty. Goes in parmana-core until reviewed.

A file can carry a secondary flag. The full per-file labels are in the inventory (not included in this repository; kept by the owner).

## Dated entry: 2026-10-18

**What was separated.** Every tracked file (2,609) was copied into this folder, preserving paths. Git history was not copied. Because no file was classified PUBLIC, no file is in parmana-verifier yet. Labels: PRIVATE 1,910; PATENT-RISK 208; SECRET-RISK 0; REVIEW 491.

**PATENT-RISK.** 208 files match a section 2.3 mechanism by identifier (`SessionCredentialSecureConnector`, `createConnectorRegistry`, `executeTransaction`, `PolicyEngine`, `SignalIntentBinder`, `CapabilityPolicyBinder`). 21 of them also verify or sign the execution trust record or audit signature, which overlaps item 2 and needs attorney review: `packages/crypto/src/{AuditEventCrypto,ExecutionChainCrypto,ExecutionChainHasher,ExecutionIntentCanonicalView,ExecutionTrustRecordCanonicalView,OfflineVerifier,TrustRecordHasher}.ts`, the matching offline-verifier tests, `proof-audit/verify/*.mjs`, `proof-audit/artifacts/test1/tampered-signature-trust-record-.json`, `python/parmana/crypto/offline_verifier.py`, `python/tests/test_offline_verifier.py`, `typescript/src/crypto/offline-verifier.ts`, `scripts/{verify-trust-record,verify-execution-intent,generate-offline-intent-fixture,generate-offline-verifier-fixture}.ts`.

**SECRET-RISK.** None confirmed. The scan covered the working tree and all git history. PEM headers appear with no key body. Connection strings, env assignments and high-entropy matches are placeholders or test fixtures. The `.env.example` values were checked by structure only; see below.

**REVIEW.** 491 files remain in REVIEW. 408 are in `typescript/`, `python/`, `python-connector-sdk/` and `packages/connector-sdk/`, where the root LICENSE grants Apache-2.0 but section 4.1 does not list them. 34 are in `proof-audit/`, 30 are verifier-closure files in `packages/crypto/`, and 14 are in `examples/audit/` and `examples/04-verified-execution/`. Also: `LICENSE`, `NOTICE`, `deploy/sandbox/evidence/check-record.json`, `schemas/common/execution-trust-record.schema.json`, and `.env.example`.

**Deviations.**
1. The original `.env.example` was not copied. This folder has a regenerated `.env.example` containing variable names only with `<set-me>` placeholders, because three of its values could not be confirmed as placeholders.
2. Step 4 produced no verifier code. The verifier is a scaffold only, pending attorney review of the section 2.3 overlap.

**Open decisions for the owner.** Confirm the SDK-directory licensing. Confirm the `PARMANA_GATEWAY_ID` value. Run a dedicated secret scanner (for example gitleaks) across all history before any publication. Confirm the company name against the incorporation certificate. Have the patent attorney review section 2.3 and the verifier contents.

## Update: 2026-10-18 (open items)

**Secret scan, full history (gitleaks 8.21.2, repository `.gitleaks.toml`).** Run read-only over the existing repository (baseline `227182b`) and over this core repository. Each reports the same four findings, all introduced in commit `c60f096` in the existing history:

- `.env.example`, private-key rule: a placeholder header with no key body (`...`).
- `docs/site/guides/credentials-maker-checker-approver.mdx`, private-key rule: a PowerShell search string for the header. Not a key. Since replaced with a pattern.
- `python/tests/test_decoder.py` (two lines), generic rule: 23-character key identifiers used as test input, not credentials.

No live credential was found in either history. The findings are kept, not rewritten. Rewriting history is outside this task and would break the existing public repository.

**`PARMANA_GATEWAY_ID`.** The value in `.env.example` is the public default `parmana-gateway`, defined in `packages/api/src/bootstrap/createGatewayIdentity.ts`. It is not a secret.

**Forbidden claim phrases and literal PEM headers.** Resolved in commit `ca366df`. The phrase scan and the header scan both return zero outside this file, which quotes the rules.

**Attorney review.** The owner reported "no issues" on the verifier before it was published. The section 2.3 list has not been separately reviewed.

**Still open, owner decisions:**
1. Whether tests may keep writing evidence into `proof-audit/`, or should write to a temporary folder.
2. Licensing of the SDK directories under the existing Apache carve-out (408 REVIEW files).
3. Confirmation of the company name against the incorporation certificate.
