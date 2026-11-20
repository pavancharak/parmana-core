# Troubleshooting

[Portal home](../README.md) · [Error codes](../reference/error-codes.md) · [FAQ](../faq.md) · [Getting started](../getting-started.md)

This page starts from what you see and works back to the cause. The messages quoted here were observed in this verification, unless a section says otherwise. For the full list of codes, read the [error code reference](../reference/error-codes.md).

**First, find the status and the code.** In the SDKs, read `error.constructor.name`, `error.statusCode` (TypeScript) or `error.status_code` (Python), and the server code (`serverCode` in TypeScript, `server_code` in Python). Over HTTP, read the `code` field of the body.

## Debugging checklist

Run these in order. Each step narrows the cause.

| Step                                | Command                                                                                                                                                              | What a healthy answer looks like                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1. Is the server up?                | `curl -s $PARMANA_API_URL/health`                                                                                                                                    | `{"status":"UP"}`                                                    |
| 2. Is it ready, and what storage?   | `curl -s $PARMANA_API_URL/ready`                                                                                                                                     | `{"status":"READY", …, "authDisabled":false}`                        |
| 3. Does my key work?                | `curl -s -H "Authorization: Bearer $KEY" $PARMANA_API_URL/callers/me`                                                                                                | Your `callerId` and the capabilities you expect                      |
| 4. Is the policy version in effect? | `curl -s -H "Authorization: Bearer $KEY" "$PARMANA_API_URL/policies/validate" -X POST -H 'content-type: application/json' -d '{"policyId":"…","policyVersion":"…"}'` | `{"valid":true,"errors":[]}`. Then check it is the one you approved. |
| 5. What happened to my transaction? | `curl -s -H "Authorization: Bearer $KEY" "$PARMANA_API_URL/transactions/$ID/status?history=true"`                                                                    | `current.status` and the history                                     |
| 6. Was it refused?                  | `curl -s -H "Authorization: Bearer $KEY" $PARMANA_API_URL/refusal/$ID`                                                                                               | The refusal record, with its `decision`                              |
| 7. Does the record verify?          | The [evidence verification](../security/evidence-verification.md) steps                                                                                              | `valid: true`                                                        |

For the CLI, add `--verbose` to log each request and response code with secrets removed, and `--dry-run` to see the request without sending it. The CLI as an installed bin needs the workaround in [CLI](../sdk/cli.md#known-issue-the-installed-binary-prints-nothing).

## Authentication failures

| Symptom                                    | Cause                                             | Fix                                                                                      |
| ------------------------------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `401 {"error":"authentication required"}`  | No `Authorization` header, or the key is unknown. | Send `Authorization: Bearer <raw key>`. The raw key is what was generated, not its hash. |
| `401` from the SDK (`AuthenticationError`) | The same, seen through the SDK.                   | Check the environment variable is set in the process that runs the code.                 |
| `429` after two `401`s                     | The authentication-failure rate limit.            | Stop retrying with a bad key. Fix the key. Wait for the `Retry-After` window.            |

## Authorization and caller permission failures

| Symptom                                                                                                 | Code                                   | Cause                                                                                           | Fix                                                                                 |
| ------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `Caller is not permitted to invoke this capability.`                                                    | `CAPABILITY_NOT_ALLOWED`               | The action is not in your key's `allowedCapabilities`.                                          | Ask the operator to add it, or use a key that has it. Check with `GET /callers/me`. |
| `Caller is not permitted to assert this authority.principalId.`                                         | none                                   | The `principalId` is not in your key's `allowedPrincipalIds`.                                   | Use an allowed principal.                                                           |
| `Caller is not permitted to act for this tenantId.`                                                     | `TENANT_NOT_ALLOWED`                   | The `tenantId` is not allowed for your key.                                                     | Use an allowed tenant, or leave it out.                                             |
| `…was proposed by this same caller — the proposer (maker) may not also approve or reject it (checker).` | `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE` | A maker tried to approve their own change.                                                      | A different, listed checker approves.                                               |
| `403 NON_HUMAN_CALLER_DENIED`                                                                           | `NON_HUMAN_CALLER_DENIED`              | A service caller tried a human-only route.                                                      | Use a human's key for governance routes.                                            |
| `403 STEP_UP_AUTHORIZATION_INVALID`                                                                     | `STEP_UP_AUTHORIZATION_INVALID`        | The step-up envelope is missing, expired, wrong, or not signed by the checker's registered key. | Sign a fresh envelope with the checker's step-up key, and submit it at once.        |

## Policy evaluation failures

| Symptom                                                                                                              | Code                              | Cause                                                                                                                 | Fix                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `Policy 'vendor-payment' version '2.1.0' was not found.`                                                             | none (`404`)                      | The version is not on this server.                                                                                    | Check the name and version. Check `PARMANA_POLICY_DIR`.                                                                             |
| `No policy is bound to capability "…".`                                                                              | `CAPABILITY_NOT_BOUND` (`404`)    | The capability has no policy binding on this build. The test capability `test:fixture-execute` is unbound on purpose. | Name the policy and version in `policy` (as the examples do). A capability needs a binding for `GET /policies/in-effect` to answer. |
| `…was superseded: the version in effect is "2.1.1", the one most recently approved.`                                 | (`403`, `ExecutionRejectedError`) | You named a version that is no longer the one in effect.                                                              | Name the version in effect. See [Policy management](../policies/README.md#versions-and-the-version-in-effect).                      |
| `…has no PolicyChangeApprovalRecord -- it has never completed the Policy Governance approval flow.`                  | (`403`, `ExecutionRejectedError`) | The version was never approved through maker-checker. On a fresh server this is the normal first state.               | Approve the version. See [Maker-checker](../tutorials/maker-checker.md).                                                            |
| `Vendor payment rejected because the assessed payment risk exceeds the maximum permitted threshold.`                 | `POLICY_DENIED` (`403`)           | A policy rule rejected the request.                                                                                   | The reason is the policy's own. Show it. Do not retry the same request.                                                             |
| `Vendor payment rejected because one or more required policy conditions were not satisfied.`                         | `POLICY_DENIED` (`403`)           | A required condition is not met, for example no approval was attached.                                                | Attach the approval, or supply the required facts.                                                                                  |
| `declared signal(s) do not match the executed intent (paymentAmount=999 != intent.parameters.amount=1000).`          | (`403`)                           | A bound signal differs from the request.                                                                              | Build both values from the same variable.                                                                                           |
| `declared signal(s) do not match independently verified state (humanApproved=true != verified humanApproved=false).` | (`403`)                           | Parmana's independent check of the approval returned false.                                                           | See [Approval failures](#approval-failures).                                                                                        |

### Approval failures

An approval is refused when Parmana cannot verify it for this request. The message names the signal that failed, which is `humanApproved` in the examples. Causes observed in this verification:

| Cause                                                         | Observed result                                                                                    |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| No approval attached, and `humanApproved` is false            | A policy-condition refusal (`POLICY_DENIED`).                                                      |
| The approval's `ttlSeconds` has passed                        | `humanApproved` verified as false.                                                                 |
| The approval names a different target (`resourceId`)          | `humanApproved` verified as false.                                                                 |
| The approval's `maxAmount` is below the amount requested      | `humanApproved` verified as false.                                                                 |
| The approval was signed by a key the server does not trust    | `humanApproved` verified as false (or the server reports that no approval verifier is configured). |
| The approval is reused                                        | A second use is refused.                                                                           |
| The approval is attached to a transaction declared without it | Refused on execution. An approval cannot be added to a declared transaction.                       |

Check, in order: the approval's `capability` equals the intent's action; `resourceId` equals the target; `maxAmount` covers the amount; the approval has not expired; the approver's key is trusted by the server (`approverId` and `keyId` match the registered approver); the approval was not used before.

## Duplicates and status failures

| Symptom                                    | Code                             | Meaning                                                  | What to do                                                                                               |
| ------------------------------------------ | -------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `Business Transaction '…' already exists.` | `409`                            | The `businessTransactionId` was used. Nothing ran again. | Read the existing outcome: `trustRecord()` or `transactionStatus()`. Use a new id only for a new action. |
| `202` with `status: EXECUTING`             | (`202`, `ExecutionPendingError`) | Released and recorded, but the status is not yet final.  | Call `reconcileTransaction`. Do not resubmit.                                                            |
| `500` `EXECUTION_RECORD_INCOMPLETE`        | `EXECUTION_RECORD_INCOMPLETE`    | Released; the signed record could not be produced.       | Reconcile. Do not retry as a new transaction.                                                            |
| `502` `EXECUTION_OUTCOME_UNKNOWN`          | `EXECUTION_OUTCOME_UNKNOWN`      | Released; the connector call failed.                     | Reconcile against the connector.                                                                         |
| `503` `SIGNING_UNAVAILABLE`                | `SIGNING_UNAVAILABLE`            | Signing is unavailable. Nothing was executed.            | Retry later, with the same id.                                                                           |

## Signature and verification failures

These are the messages the verifiers print (observed):

| Message                                                                                                                   | Meaning                                                               | What to check                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `trustRecordHash mismatch: expected …`                                                                                    | A covered field of the record differs from what was signed.           | The record was changed, or was reformatted with a changed value. Use the original.                                              |
| `signature verification failed for keyId "default" (ed25519).`                                                            | The signature does not verify with the key in your trust file.        | The record was altered, or it was signed by another key. Compare the fingerprint.                                               |
| `schemaVersion 2 (or no schemaVersion) covers only seven top-level fields and is refused by default: set allowLegacyV2 …` | A schema 2 record, and the trust file does not accept it.             | Set `allowLegacyV2` knowingly, or verify a schema 3 record. See [Security](../security/README.md#schema-versions-and-coverage). |
| `record has no hybrid envelope: set hybridRequiredFrom or allowLegacyOnly …`                                              | A single-signature record, and the trust file does not accept it.     | Set `allowLegacyOnly` knowingly, or verify a hybrid record.                                                                     |
| `valid: true` with `coverage: legacy`                                                                                     | The record verified, but only its seven covered fields are protected. | Read the security page before relying on uncovered fields.                                                                      |

## Network and timeout failures

| Symptom       | SDK class        | Cause                                                | What to do                                                                                  |
| ------------- | ---------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| No response   | `NetworkError`   | The endpoint is unreachable, or a proxy blocked it.  | Check the endpoint, DNS and proxy. Read the status before any retry.                        |
| Slow response | `TimeoutError`   | The request exceeded `timeout` (default 30 seconds). | Check the status of the transaction. The action may have been released. Do not resubmit it. |
| `429`         | `RateLimitError` | The rate limit was reached.                          | Wait for `retryAfterSeconds`. Reduce the request rate.                                      |

The SDK retries `GET` requests only, when retries are enabled. It never retries a `POST`. A `POST` that timed out may still have run: read the transaction's status before you decide.

## Problems with the existing quickstart and local setup

These were found when the existing [quickstart](../../../docs/site/quickstart.mdx) was run as written on a fresh checkout. They are recorded in [COVERAGE](../COVERAGE.md#known-issues-found-during-this-review). The governed setup in [Getting started](../getting-started.md) avoids each one.

### The existing quickstart does not run as written

1. **The server refuses to start without `PARMANA_POLICY_DIR`.** The quickstart's server command does not set it. Error: `PARMANA_POLICY_DIR is not set. Refusing to start without a configured policy directory…`
2. **The server refuses to start without `PARMANA_KEY_DIR`.** Error: `PARMANA_KEY_DIR is not configured.` Generating the keys into `keys/` does not set this variable.
3. **The approver key generator does not create its output folder.** `generate-approver-key.ts --out-dir ~/.parmana` fails with `ENOENT` unless `~/.parmana` already exists. Run `mkdir -p ~/.parmana` first.
4. **The first execution is refused.** `vendor-payment@2.1.0` has no approval record on a fresh server, so the quickstart's execution fails with `…has no PolicyChangeApprovalRecord…`. The quickstart does not mention maker-checker.
5. **`PARMANA_ALLOW_UNGOVERNED_POLICY=true` does not help.** The examples runner sets it, but no server source file under `packages/*/src` reads it. The version in effect comes only from an approval record, and the code says no setting turns that off.

With the governed setup, steps 1 to 3 are done for you, and step 4 is the maker-checker flow that the setup's example runs.

### `npm run dev:setup` refuses the fixture flows

`npm run dev:setup` starts a server with `PARMANA_POLICY_DIR=./policies`, which does not include `vendor-payment`. Its caller key can invoke only `test:fixture-execute`, which is unbound by design. Verified: `POST /execute` for `vendor-payment@2.1.0` returns `404 Policy 'vendor-payment' version '2.1.0' was not found.`, and `GET /policies/in-effect?capability=test:fixture-execute` returns `404 CAPABILITY_NOT_BOUND`. Use the governed setup for the fixture flows.

### A `500` after the action was released: hybrid signing misconfigured

With `CRYPTO_MODE=hybrid` but no `SECONDARY_SIGNATURE_PROVIDER`, the server released the action and then could not produce the record. Observed response: `500 INTERNAL_SERVER_ERROR` with the cause `Secondary signature provider is not configured.`, and the message that the action was released and must not be retried as a new transaction.

Set `SECONDARY_SIGNATURE_PROVIDER=dilithium3`, with a `default-secondary` key in the key directory. Then reconcile the released transaction; do not resubmit it. See [Security](../security/README.md#schema-versions-and-coverage).

### A policy file does not match its approval record

The server refuses a policy whose file was changed outside the approval flow. The message, as the existing [troubleshooting guide](../../../docs/site/troubleshooting.mdx) describes it, names the content hash. This message was not reproduced in this verification. Restore the file to the approved content, or propose the new content through maker-checker.

## Debugging the CLI

- `parmana-ops` printed nothing and exited 0. The installed bin does not start the command. Run the file instead: `node "$(npm root -g)/@parmana/cli/dist/index.js" --help`. See [CLI](../sdk/cli.md#known-issue-the-installed-binary-prints-nothing).
- A `HTTP 403 SAME_ACTOR…` from `approval submit` with the hint "This token is not allowed to do this. Check which credential is set." means the token in `PARMANA_TOKEN` is the maker's, not the checker's.

## Tests and examples that fail on a fresh checkout

- **`npm test --workspace=typescript` fails** in this checkout. Six test files under `typescript/test/` are empty (zero bytes, committed that way), so vitest reports "No test suite found". The two integration suites need `PARMANA_POLICY_DIR` and a `./keys` directory. The examples integration test passed 3 of 3 when run from the repository root with the database variables unset.
- **Tutorials 60, 103 and 120 fail when run directly with `npx tsx`** until `PARMANA_POLICY_DIR` is set, with `PARMANA_POLICY_DIR is not set…`. Tutorial 103 also needs `PARMANA_KEY_DIR`. Their READMEs do not say so. `npm run examples` sets defaults for these variables and ran 116 examples with exit code 0.
- **`DATABASE_URL` in your environment** can make a test run target a database. The repository's test setup refuses hosted databases unless they are listed in `PARMANA_TEST_PROJECT_REFS` and `ALLOW_LIVE_SUPABASE=1` is set. Unset `DATABASE_URL` for local runs.

## Getting more help

- Open an issue in the repository with the status, the code, the request id if the server gave one, and the output of the debugging checklist. Do not include raw keys, approver private keys or step-up private keys.
- Report a security issue through [SECURITY.md](../../../SECURITY.md), not in a public issue.
