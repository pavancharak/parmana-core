# 2.51 A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped)

Source: CLAIMS.md (commit d1d63c6), lines 645-682.

## Exact claim text

## 2.51 A Public Sandbox Runs the Same Governance With a Published Demo Key (Scoped)

**Claim.** The public sandbox runs the same code as production with `PARMANA_SANDBOX=true`. It has its own database, its own signing keys and its own approver. A visitor with the published demo key, which is allowed only `sandbox:receipt`, gets the same governance as production:

- A request with no signed approval is refused.
- A demo approval from `POST /sandbox/approvals` lets one request be released to the sandbox receipt endpoint, where it is signed.
- The signed record verifies offline.
- The same approval, reused, is refused.
- The sandbox policy refuses an overlong note.

The demo approver signs only for `sandbox:receipt`, and only the documentation site may call the API from a browser. This is ADR-0014.

**What the code enforces.**

- With `PARMANA_SANDBOX=true`, the server refuses to start if any built-in connector variable is set, even an empty one. The demo approver's variables are refused outside sandbox mode.
- `PARMANA_SANDBOX=true` is refused when `NODE_ENV=production`.
- `POST /sandbox/approvals` exists only in sandbox mode. It is behind caller authentication, signs only `sandbox:receipt`, and each approval expires after 300 seconds.
- Browser access is limited to the origins listed in `PARMANA_CORS_ORIGINS`. Other origins receive no CORS header.

**Scope and limits.**

- **The sandbox acts on nothing.** Its one capability releases to an endpoint that returns a receipt. No connector to a real system can be configured while sandbox mode is on.
- **Anyone can approve in the sandbox.** That is its purpose. It shows how a signed approval is used, not who may give one. In production only registered approvers sign.
- **The sandbox policy, the deployment scripts and the live check records are not in this repository.** The sandbox policy and its deployment are operated outside this repository, so this claim does not verify them. The code-level enforcement above is verified here.
- **Distinct credentials, not distinct people.** The sandbox maker and checker keys can be held by one person, as elsewhere in this document.
- **Retention.** The sandbox's record-retention job is operated outside this repository, and this claim does not verify it.

**Evidence.**

- `packages/api/src/bootstrap/createSandboxOptions.ts` (the sandbox-mode checks, the connector-variable refusal, the `NODE_ENV=production` refusal)
- `packages/api/src/routes/sandbox-approvals.ts` (`POST /sandbox/approvals`, the `sandbox:receipt` restriction, the 300-second expiry)
- `packages/api/src/app.ts` (the route is mounted only in sandbox mode)
- `packages/api/src/middleware/cors.ts` (`PARMANA_CORS_ORIGINS`)
- `packages/api/tests/unit/createSandboxOptions.test.ts` (the sandbox-mode checks)
- `packages/api/tests/integration/sandbox.integration.test.ts` (the approval route behind the key; the CORS behaviour; the route does not exist outside sandbox mode; the approval is accepted once and only for its resource)

Dated operational records for the sandbox are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).


## Cited evidence paths

- `packages/api/src/app.ts`: EXISTS
- `packages/api/src/bootstrap/createSandboxOptions.ts`: EXISTS
- `packages/api/src/middleware/cors.ts`: EXISTS
- `packages/api/src/routes/sandbox-approvals.ts`: EXISTS
- `packages/api/tests/integration/sandbox.integration.test.ts`: EXISTS
- `packages/api/tests/unit/createSandboxOptions.test.ts`: EXISTS

## Test results from the full run (vitest full run, 403 files, 0 failed)

| Test file | Status | Tests | Passed | Skipped |
|---|---|---|---|---|
| `packages/api/tests/integration/sandbox.integration.test.ts` | passed | 17 | 17 | 0 |
| `packages/api/tests/unit/createSandboxOptions.test.ts` | passed | 20 | 20 | 0 |
