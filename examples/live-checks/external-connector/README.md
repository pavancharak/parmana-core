# Live check: an external connector in production (ADR-0013 step 6)

ADR-0013 lets an operator put any system behind Parmana by registering an HTTPS endpoint for a capability, through
maker checker, with no change to Parmana's code. Steps 1 to 5 are built, tested and documented. This check proves the
last part against the real production server, before `docs/CLAIMS.md` may claim it: an approved request is released,
signed, to a registered endpoint on the public internet, and the record verifies offline.

Nothing in this check acts on a real system. The endpoint answers with a receipt and changes nothing.

## Result, 2026-10-01: passed

| Request (transaction `97ddeaa9-8e2d-4dbc-93c7-452cca85db8f`) | Result                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. No approval                                               | Refused, with the policy's reason                                 |
| 2. Approval signed by `manager-charak1987` for the target    | `APPROVED` in 23.9 s, released once, the record verifies offline  |
| 3. The same approval again                                   | Refused: `receiptApproved=true != verified receiptApproved=false` |

The endpoint logged exactly one `release_acted` per approved transaction. The first attempt
(`ec2f6c00-1009-43f0-9faf-1aeb84917860`) completed on the server, but its agent stopped waiting at the SDK's
default 30 seconds; its record, fetched with `-Stage Verify`, is `APPROVED` and verifies offline. That is
`docs/VERIFICATION-GAPS.md` G-84; `send.ts` now waits up to 120 seconds. Both records are in `evidence/`. The claim
is `docs/CLAIMS.md` 2.50.

## What is deployed

| Part         | Where                                                  | What it is                                                      |
| ------------ | ------------------------------------------------------ | --------------------------------------------------------------- |
| The endpoint | `https://parmana-release-check.vercel.app/api/release` | Vercel project `parmana-release-check`, deployed 2026-10-01     |
| Its code     | `endpoint.ts`, bundled by `build-endpoint.ts`          | Example 07's release handler; its action only returns a receipt |
| Parmana      | `https://parmana-api-real.vercel.app`                  | Production                                                      |

The endpoint is built with two public values written in: Parmana's public key (from `GET /keys/default`) and its own
URL, which is the audience every release must name. It needs no environment variable and holds no secret. Vercel's
deployment protection covers only the per deployment URLs, not the production address above, so Parmana can reach it.

Checked on 2026-10-01: `POST` with body `{}` answers `401 {"errors":["the body is not { release, signature }"]}`.

## Files

| File                 | Purpose                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------- |
| `policy.json`        | `livecheck-receipt` 1.0.0: approves only with a signed approval for the target. Passes `PolicyValidator`. |
| `endpoint.ts`        | The endpoint, as a Vercel function.                                                                       |
| `build-endpoint.ts`  | Bundles it, with the SDK from this repository, into a folder Vercel deploys as it is.                     |
| `send.ts`            | The agent's side: three requests, each checked against what the rules require.                            |
| `run-live-check.ps1` | The whole procedure as stages, for Windows PowerShell. Keys are read hidden, never printed or stored.     |

## Build and deploy the endpoint

Done once, already done for the address above. To build it again (for example for another address):

```powershell
npm run build
npx tsx examples/live-checks/external-connector/build-endpoint.ts `
  --parmana-url https://parmana-api-real.vercel.app `
  --endpoint-url https://parmana-release-check.vercel.app/api/release `
  --out ..\parmana-release-check
cd ..\parmana-release-check
npx vercel deploy --prod --yes --scope pavan-dev-singh-charaks-projects
```

If Vercel gives the project another address, build again with that address before registering: a release made for
any other address is refused.

## The check

Run every stage from the repository root, in Windows PowerShell, in this order. Each stage prints what it did; stop
at the first one that does not print what is expected below.

```powershell
$s = ".\examples\live-checks\external-connector\run-live-check.ps1"
powershell -ExecutionPolicy Bypass -File $s -Stage ProposePolicy
```

| #   | Stage                 | Who                  | Needs                                                                                       | Expect                                                                                                                         |
| --- | --------------------- | -------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `ProposePolicy`       | Maker                | Maker API key                                                                               | `Proposed: <id>, PENDING_APPROVAL`                                                                                             |
| 2   | `ApprovePolicy`       | Checker              | Checker API key, `-StepUpKeyFile`                                                           | The proposed policy shown, then `Status: APPROVED`                                                                             |
| 3   | `ProposeRegistration` | Maker                | Maker API key                                                                               | `401 ... as required`, then `Proposed: <id>, PENDING_APPROVAL, stored as https://parmana-release-check.vercel.app/api/release` |
| 4   | `ApproveRegistration` | Checker              | Checker API key, `-StepUpKeyFile`                                                           | The proposed registration shown, then `Status: APPROVED`                                                                       |
| 5   | `AgentKey`            | Operator             | `-KeysFile` (the current `PARMANA_API_KEYS.json`), the linked Vercel folder, the Vercel CLI | A raw key shown once, the file updated, `PARMANA_API_KEYS` set, the API redeployed                                             |
| 6   | `Send`                | Approver, then agent | `-ApproverKeyFile`, the `livecheck-agent` key                                               | Three lines, then `All three behaved as required.`                                                                             |

Stage 6 signs one approval for a new target, `live-check-<date and time>`, then sends:

1. A request with no approval. Expect: refused, with the policy's reason.
2. The same request with the signed approval. Expect: `APPROVED`, the endpoint's answer (`success: true` and a
   receipt id), the record saved to `live-check-record.json`, and `Verifies offline  : true`.
3. The same approval again. Expect: refused, an approval is used once.

Then check the endpoint's side in the Vercel logs of `parmana-release-check`: one line `release_acted` naming the
same `businessTransactionId`, the capability, the policy at 1.0.0 and the approver, and no `release_refused`.

Example, with the paths from this deployment's own credentials runbook:

```powershell
powershell -ExecutionPolicy Bypass -File $s -Stage ApprovePolicy -StepUpKeyFile D:\key\<folder>\reviewer-charak1987.step-up.private.pem
powershell -ExecutionPolicy Bypass -File $s -Stage AgentKey -KeysFile D:\key\<folder>\PARMANA_API_KEYS.json
powershell -ExecutionPolicy Bypass -File $s -Stage Send -ApproverKeyFile D:\key\manager-charak1987__manager-charak1987-key-2.private.pem
```

## When it fails

| You see                                                    | Meaning and fix                                                                                                                                                                               |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HTTP 403 ... NON_HUMAN_CALLER_DENIED`                     | The maker or checker key is not registered as a human. Use the right key.                                                                                                                     |
| `HTTP 403 ... SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`        | The checker key is the maker's. Use the checker's.                                                                                                                                            |
| `HTTP 403 ... STEP_UP_AUTHORIZATION_INVALID`               | The step up key file does not match the checker's registered key, or more than 120 seconds passed. Run the stage again.                                                                       |
| `HTTP 400 ... EXTERNAL_ENDPOINT_ADDRESS_REFUSED`           | The endpoint's host did not resolve only to public addresses at that moment. Run the stage again; if it persists, stop.                                                                       |
| `HTTP 409 ... CONFLICT`                                    | The capability already has an active registration or an open change. Revoke or resolve it first.                                                                                              |
| `This key may not use livecheck:receipt`                   | Stage 5 has not taken effect: the redeploy is not finished, or a different key was given.                                                                                                     |
| `409 NO_APPROVED_POLICY_VERSION` or `CAPABILITY_NOT_BOUND` | Stage 2 or stage 4 was not approved.                                                                                                                                                          |
| `503 CONNECTOR_NOT_REGISTERED`                             | The registration is not active (stage 4). Nothing was sent.                                                                                                                                   |
| `502 EXECUTION_OUTCOME_UNKNOWN`                            | The release failed: read the endpoint's logs (`release_refused` names the failed check). Do not send again as a new transaction; resolve the intent (`POST /execution-intents/{id}/resolve`). |
| Request 1 or 3 `APPROVED, which is WRONG`                  | A rule did not hold. Stop, keep the output and the record, and report it.                                                                                                                     |

## Afterwards

- Keep `live-check-record.json` (no secret) and the endpoint's log line as the evidence for the `docs/CLAIMS.md` entry.
- Revoke the registration (`ProposeRevoke`, then `ApproveRevoke`), and remove `livecheck-agent` from
  `PARMANA_API_KEYS` (restore `PARMANA_API_KEYS.json.before-livecheck`, set it, redeploy), unless the check is to stay
  available. The endpoint can stay: it refuses everything not signed by Parmana for its own address, and acts on
  nothing.
