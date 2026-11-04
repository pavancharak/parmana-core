# Sandbox governance setup: commands, steps and status

Date: 2026-10-31. Sandbox: `https://parmana-sandbox.vercel.app`. Production is unaffected.

No secret is written in this document. Raw keys and step-up private keys stay in the password manager or in local files outside the repo.

## 1. Caller keys

Generated with the repo's script, on your machine, in `D:\last\parmana-core`:

```powershell
npm run generate:api-key -- --caller-id sandbox-visitor --credential-holder-type SERVICE --allowed-principal-ids sandbox-visitor --allowed-capabilities sandbox:receipt
npm run generate:api-key -- --caller-id sandbox-maker --credential-holder-type USER --allowed-principal-ids sandbox-maker
npm run generate:api-key -- --caller-id sandbox-checker --credential-holder-type USER --allowed-principal-ids sandbox-checker --generate-step-up-key
```

Each command prints one JSON entry for `PARMANA_API_KEYS`. The checker command also prints a step-up private key, which must be saved to a `.pem` file.

The sandbox's `PARMANA_API_KEYS` (Production) is one JSON array with all three entries. It is set in the Vercel dashboard. After any change, redeploy.

## 2. Policy binding setting

The `POLICY_CHANGE_CHECKERS` variable (Production) is a JSON object, keyed by policy name:

```json
{ "sandbox-receipt": ["sandbox-checker"] }
```

Without it, the approval is refused with `403 CHECKER_NOT_IN_SCOPE`.

## 3. Check each key

```powershell
$key = (Select-String -Path "<the generated file>" -Pattern '^Key\s*:\s*(\S+)').Matches[0].Groups[1].Value
Invoke-RestMethod -Uri "https://parmana-sandbox.vercel.app/callers/me" -Headers @{ Authorization = "Bearer $key" }
```

Expected: `callerId` matches the key.

Result on 2026-10-31: visitor, maker and checker all return their own `callerId`.

## 4. Propose the policy (maker)

```powershell
git show 1dc20a1^:deploy/sandbox/policy.json > sandbox-policy.json
$policy = Get-Content sandbox-policy.json -Raw | ConvertFrom-Json
$body = @{ proposedContent = $policy; reason = "Bind sandbox:receipt for the public sandbox on the parmana_sandbox schema" } | ConvertTo-Json -Depth 20
Invoke-RestMethod -Method Post -Uri "https://parmana-sandbox.vercel.app/policies/sandbox-receipt/1.0.0/pending-changes" -Headers @{ Authorization = "Bearer $maker" } -ContentType "application/json" -Body $body
```

Result: pending change `662a0f0c-4f29-4586-9235-4ed75bde6c9d`, `status : PENDING_APPROVAL`.

## 5. Approve (checker, with a step-up envelope)

Check the step-up private key matches the registered public key first:

```powershell
node -e "const c=require('crypto');const k=c.createPrivateKey(require('fs').readFileSync(process.argv[1]));console.log(c.createPublicKey(k).export({type:'spki',format:'der'}).toString('base64'))" $keyFile
```

It must print the base64 body of the checker's `stepUpPublicKey`. Sign and approve in one block, because the envelope expires:

```powershell
$out = npx tsx scripts/sign-policy-change-step-up.ts --private-key-file $keyFile --key-id checker-step-up --pending-policy-change-id $id --action approve
$envelope = $out | Where-Object { $_ -like '{"payload"*' }
$body = '{"stepUpAuthorization":' + $envelope + '}'
Invoke-RestMethod -Method Post -Uri "https://parmana-sandbox.vercel.app/policies/pending-changes/$id/approve" -Headers @{ Authorization = "Bearer $checker" } -ContentType "application/json" -Body $body
```

Result: `status : APPROVED`, `resolvedBy : sandbox-checker`.

Errors met on the way:

- `Malformed JSON body`: the envelope was empty, because the signing command failed. Cause: a placeholder path.
- `authentication required`: `$checker` held an old key.
- `STEP_UP_AUTHORIZATION_INVALID`: the private key file belonged to an earlier checker key. Fix: extract the new private key from the generated file into its own `.pem`, and confirm its public key matches.

## 6. Check the result

```powershell
$key = "<visitor key>"
Invoke-RestMethod -Uri "https://parmana-sandbox.vercel.app/policies/in-effect?capability=sandbox:receipt" -Headers @{ Authorization = "Bearer $key" }
```

Result on 2026-10-31: `404 CAPABILITY_NOT_BOUND`. The approval stored the policy, but the capability is not yet bound to it.

Playground flow with the visitor key:

| Step                             | Result                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| `GET /callers/me`                | 200, `sandbox-visitor`                                                               |
| `GET /policies/in-effect`        | 404, not bound                                                                       |
| `POST /execute` without approval | 403 `POLICY_DENIED` (refused, as intended)                                           |
| `POST /sandbox/approvals`        | 201, signed approval                                                                 |
| `POST /execute` with approval    | 403 `POLICY_DENIED`: declared `receiptApproved=true` does not match verified `false` |
| `POST /execute` replay           | 403, same reason                                                                     |

## 7. Open issues

1. **Capability binding.** The approved policy is not bound to `sandbox:receipt`. `/policies/in-effect` returns 404. The binding is a separate step, which the setup doesn't yet include. Needs investigation in `packages/api` for the binding registration.
2. **Verified signals.** With the capability bound, the approval step passes `receiptApproved` through a verified check, which currently reads `false`. Needs the same investigation.
3. **Shared Supabase project.** Sandbox and connectors share one project. The retention job is not rebuilt (G-135).

## 8. What the playground needs before it works end to end

- Capability bound to `sandbox-receipt` 1.0.0, so `/policies/in-effect` returns 200.
- Approval artifact verified against the bound policy, so the execute-with-approval step returns 200.
- Then the playground page can show real responses for each step.
