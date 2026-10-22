# Policy change approval (maker and checker) runbook

How a policy change is proposed, approved or rejected in production, and what each refusal means. Written from `packages/api/src/routes/pending-policy-changes.ts`, `packages/api/src/governance/policyChangeCheckers.ts` and `packages/api/src/auth/PolicyChangeStepUpVerifier.ts`. For the conceptual rules, read `docs/site/handbook/07-policy-governance-maker-checker.mdx`. This page covers the operations.

Set `$env:PARMANA_URL` to the production base URL first.

---

## 1. The three roles

| Role | Who | What they can do | Where it is configured |
|---|---|---|---|
| Maker | A human `USER` key, any caller except the checker for that change | Propose a change | `PARMANA_API_KEYS` entry, `credentialHolderType: USER` |
| Checker | A human `USER` key listed for that policy | Approve or reject | `POLICY_CHANGE_CHECKERS` (for approve), plus a `stepUpPublicKey` on the key entry |
| Step-up key | The checker's Ed25519 key pair | Signs a single-use envelope for each approve or reject | Public half in `stepUpPublicKey`; private half kept by the checker |

A maker cannot approve their own proposal. The server refuses it with `SameActorCannotApproveOwnChangeError`.

---

## 2. Propose

```powershell
$body = @{ proposedContent = $policy; reason = "why this change" } | ConvertTo-Json -Depth 20
Invoke-RestMethod -Method Post -Uri "$env:PARMANA_URL/policies/<name>/<version>/pending-changes" -Headers @{ Authorization = "Bearer $maker" } -ContentType "application/json" -Body $body
```

- `<name>` and `<version>` are the URL path. They must match `proposedContent.policyId` and `proposedContent.policyVersion`.
- `reason` is required. Without it the server returns `400 reason is required.`
- The response has `pendingPolicyChangeId` and `status: PENDING_APPROVAL`.

**Why `ConvertTo-Json -Depth 20`:** the policy is nested. The default depth of 2 cuts it off and the server gets a truncated policy.

---

## 3. Approve (checker)

The checker signs an envelope for this exact change and this exact action, then sends it with the approval.

```powershell
$out = npx tsx scripts/sign-policy-change-step-up.ts --private-key-file <checker.step-up.private.pem> --key-id checker-step-up --pending-policy-change-id <ID> --action approve
$envelope = $out | Where-Object { $_ -like '{"payload"*' }
$body = '{"stepUpAuthorization":' + $envelope + '}'
Invoke-RestMethod -Method Post -Uri "$env:PARMANA_URL/policies/pending-changes/<ID>/approve" -Headers @{ Authorization = "Bearer $checker" } -ContentType "application/json" -Body $body
```

Send `$body` exactly as built. Do not run the envelope through `ConvertFrom-Json` and back. Windows PowerShell rewrites the timestamps, and the signature then fails.

**Expect:** `status : APPROVED` and `resolvedBy` set to the checker's `callerId`. The live policy is written and a signed approval record is stored.

### What the server checks, in order

The order matters. The first failing check decides the response.

| # | Check | Refusal |
|---|---|---|
| 1 | A caller is authenticated | `401` |
| 2 | The caller is a human (`USER`) | refused by `requireHumanCaller` |
| 3 | The change exists | not found |
| 4 | The checker is not the maker | `SameActorCannotApproveOwnChangeError` |
| 5 | The checker is listed for this policy in `POLICY_CHANGE_CHECKERS` | `403 CHECKER_NOT_IN_SCOPE` |
| 6 | The step-up envelope is valid | `STEP_UP_AUTHORIZATION_INVALID` (we saw both `400` and `403`; read the body and status) |
| 7 | The change is still `PENDING_APPROVAL` | conflict, refused without applying anything |
| 8 | The live policy and approval record are written | the change is marked `APPROVED` only after this succeeds |

Check 5 is checked before the signature, so an out-of-scope checker is refused without any signature work.

---

## 4. Reject (checker)

```powershell
$rb = '{"stepUpAuthorization":' + $envelope + ',"rejectionReason":"why"}'
Invoke-RestMethod -Method Post -Uri "$env:PARMANA_URL/policies/pending-changes/<ID>/reject" -Headers @{ Authorization = "Bearer $checker" } -ContentType "application/json" -Body $rb
```

Sign the envelope with `--action reject`. The checks run in this order: caller authentication, human caller, `rejectionReason` required (`400`), change exists, maker is not the checker, `POLICY_CHANGE_CHECKERS` scope (`403 CHECKER_NOT_IN_SCOPE`), then step-up.

Reject and approve use the same checker list, so a caller who may not approve a policy may not reject its changes either.

Rejecting never touches the live policy file. It is safe to use for testing a new key: the rotation test in section 6 rejects a proposal, so nothing goes live.

---

## 5. The step-up envelope

Created by `scripts/sign-policy-change-step-up.ts`. The server verifies:

- the signature, with the `stepUpPublicKey` of the calling checker;
- the expiry: the envelope is valid for **120 seconds**, and the server refuses a longer TTL;
- the pending change ID and the action (`approve` or `reject`) match the request;
- the nonce has not been used before. The nonce is recorded only after the other checks pass, in `consumed_policy_change_step_up_nonces`.

**The envelope is stamped with the PC clock.** If the PC is more than about two minutes behind the server, the envelope is expired on arrival, and every approval fails with `STEP_UP_AUTHORIZATION_INVALID`. This was the real cause of most of our failures. Check first:

```powershell
"local UTC: $((Get-Date).ToUniversalTime().ToString('o'))"
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { $_.Exception.Response.Headers['Date'] }
```

Fix with `w32tm /resync` from an administrator PowerShell, or turn **Set time automatically** off and on in Windows settings.

**Sign and send in one step.** Don't pause between signing and sending.

**The nonce tells you how far the check got.** If you know the nonce (`([regex]::Match($envelope, '"nonce":"([^"]+)"')).Groups[1].Value`):

- A row in `consumed_policy_change_step_up_nonces` means the envelope passed every check and was used. Any failure after that is elsewhere.
- No row means a check failed before the nonce step. Re-check the clock, the pending change ID, the action, and the key.

---

## 6. Test a key rotation without changing production

A reject leaves nothing live, so use it to test the maker and checker keys:

1. Maker proposes an existing policy file, with a `reason` containing "rotation test".
2. Checker signs a `reject` envelope and sends it with a `rejectionReason`.
3. Expect `status : REJECTED` and `resolvedBy` set to the checker.

Run both parts close together, because the envelope expires in 120 seconds.

---

## 7. Quick reference

| What you see | Most likely cause | Go to |
|---|---|---|
| `401` on propose or approve | Key not in `PARMANA_API_KEYS`, or wrong key | Troubleshooting guide, section 11 |
| `CHECKER_NOT_IN_SCOPE` | `POLICY_CHANGE_CHECKERS` does not list this checker for this policy | Section 8 below |
| `STEP_UP_AUTHORIZATION_INVALID` | Clock, expired envelope, wrong pending ID or action, or wrong key | Section 5 |
| `reason is required.` | `reason` missing from the proposal body | Section 2 |
| `rejectionReason is required.` | Missing from the reject body | Section 4 |

---

## 8. `POLICY_CHANGE_CHECKERS`: the format

It is a JSON **object** keyed by policy name. Each value is an array of checker `callerId`s:

```json
{"checker-wiring-check":["pavancharak"],"razorpay-refund":["pavancharak"]}
```

A plain string such as `pavancharak` is **not** valid and the server refuses to start. An unset or empty value lists nobody, so approve is refused for every policy. Each `callerId` must be non-empty.

The variable is read by both entry points: `api/index.ts` (Vercel) and `packages/api/src/server.ts` (Node). The architecture test `tests/architecture/vercel-entry-policy-checkers.test.ts` checks that the Vercel entry passes it. Run it after changing either entry point:

```powershell
npx vitest run tests/architecture/vercel-entry-policy-checkers.test.ts
```

---

## 9. Changing a policy's approval, after it is live

Each approved version is stored, and a new version is a new proposal. The server refuses to replace an approved version in place with different content (`409`, and the stored version is unchanged). Propose a new version (for example `1.0.2`) rather than editing an approved one.
