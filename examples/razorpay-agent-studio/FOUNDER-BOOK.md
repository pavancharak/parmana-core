# The Parmana Founder Book

How to connect any external system to Parmana: the commands, the sequence of events, how credentials are generated and stored, every scenario we have met, and what each result means.

Version 1.0, 23 October 2026. This is a living document. When a new scenario, command or failure is found, add it to the right part and add a line to the changelog in Part 18.

---

## Contents

- Part 0. How to use this book
- Part 1. What Parmana is, in plain terms
- Part 2. Concepts and roles
- Part 3. How the system is built (architecture and trust boundaries)
- Part 4. Workstation setup
- Part 5. Credentials: what exists, how to generate each, how to store and rotate
- Part 6. Governed changes: propose, approve, revoke
- Part 7. The live key list (PARMANA_API_KEYS)
- Part 8. Building the external endpoint
- Part 9. Putting an agent behind an MCP tool
- Part 10. The connection sequence, step by step
- Part 11. Scenarios
- Part 12. Troubleshooting: exact messages and what they mean
- Part 13. Command reference
- Part 14. Evidence: what was tested on 23 October 2026
- Part 15. Gaps and decisions
- Part 16. Mapping to the Razorpay Agent Studio spec
- Part 17. Glossary and FAQ
- Part 18. Changelog

---

## Part 0. How to use this book

### 0.1 Status markers

| Marker | Meaning |
| --- | --- |
| ✅ | Run, and the result was seen, on 23 October 2026. The evidence is in Part 14. |
| ⚠️ | Written from the repository or from earlier work. Not run end to end. Treat as a plan until it is run. |
| ❌ | Does not exist yet. This is a gap, listed in Part 15. |

### 0.2 Rules that apply everywhere

1. **No secret in chat, email, a commit, a screenshot or a document.** Keys go to the password manager, to the encrypted store on your machine, or to a Vercel sensitive variable entered at a prompt. If a secret is printed by accident, treat it as exposed and rotate it (scenario H).
2. **Two people for every governed change.** A maker proposes and a different checker approves. The checker signs with a step-up key.
3. **Human credentials are `USER` type.** A non-human key cannot approve governed changes (scenario L).
4. **Test mode first.** Every example here was run against Razorpay test mode. Going live follows the go-live plan in Part 10, Step 12.
5. **Reload the right key before each step.** Session variables carry the last key loaded. Most surprising failures in this book come from that (scenario K).

---

## Part 1. What Parmana is, in plain terms

An agent or system often wants to do something that moves money or changes records: refund a payment, release goods, post a message. Parmana sits between the requester and the action, and answers one question each time: **may this caller do this, to this target, for this amount, right now?**

Parmana does three things:

1. **Decides.** It evaluates a versioned policy, checks the caller's grant (who may use which capability, within which limits, until when), and checks any required human approval. It approves or refuses.
2. **Releases.** If it approves, it sends a signed release to the external endpoint that actually performs the action. The external endpoint holds the real credentials (for example the Razorpay test keys). Parmana does not.
3. **Records.** Every decision, approved or refused, is written as a signed record that can be verified offline with Parmana's public key.

The point of the design is that no single component can act alone:
- the agent cannot approve itself;
- the approver cannot exceed the agent's grant;
- the policy cannot be changed without a second person;
- the endpoint acts only on a release Parmana signed, for its own address, within its validity window.

---

## Part 2. Concepts and roles

### 2.1 Concepts

| Term | Meaning | Where you see it |
| --- | --- | --- |
| **Caller** | Anything that calls Parmana with an API key. Identified by `callerId`. Examples: `razorpay-demo-agent`, `maker-pavan`, `checker-pavan`. | Key entry file; `GET /callers/me` |
| **Capability** | A namespaced action, `<namespace>:<action>`, for example `razorpay:refund`. | Policy, connector, grant |
| **Policy** | Ordered rules that decide approve or reject for a capability. Versioned (`name` + `version`). The last rule is the default reject. | `policies/`, `examples/razorpay-refund/policy.json`; `GET /policies/in-effect` |
| **External connector** | A registered HTTPS endpoint for a capability. Parmana sends it signed releases. Registered without a deploy (ADR-0013). | `GET /external-connectors` |
| **Authority grant** | A caller's permission for one capability, with limits (for example `parameters.amount` max 500) and a validity window (`validUntil`). | `GET /authority-grants` |
| **Approval** | A human's signed statement for one target and one amount. Checked against the registered approval issuers. Single use. | `send.ts --save-approval` |
| **Approval issuer** | A registered public key that may sign approvals, with an approver id and key id. Revocable. | `GET /approval-issuers` |
| **Signal source** | An external system Parmana asks for a fact. The source signs its answer. | `propose-source` |
| **Release** | The signed statement Parmana sends to a connector. It names the audience (endpoint URL), capability, target, parameters, approvals used, and an expiry. | Endpoint's `verifyParmanaRelease` |
| **Trust record** | The signed record of an approved decision and its execution. | `GET /trust-records/<businessTransactionId>` |
| **Refusal record** | The signed record of a refused decision, including the rule and reason. | `GET /refusal/<businessTransactionId>` |
| **businessTransactionId** | Parmana's id for one request. The endpoint uses it as the Razorpay receipt, so one decision refunds at most once. | Records; Razorpay refund `receipt` |

### 2.2 Roles

| Role | Who | Can do | Cannot do |
| --- | --- | --- | --- |
| Operator | You (the person at the keyboard) | Generate keys, deploy, propose changes | Approve their own proposals |
| Maker | A `USER` caller, for example `maker-pavan` | Propose policies, connectors, grants, revocations | Approve |
| Checker | A `USER` caller, for example `checker-pavan`, with a step-up key | Approve changes | Approve a change they proposed |
| Approver (manager) | A registered approval issuer, for example `manager-pavan` | Sign one approval per payment and amount | Lift a grant limit |
| Agent | An API key with capabilities, for example `razorpay-demo-agent` | Ask Parmana to release one action | Create approvals, change policy, exceed its grant |
| External endpoint | An HTTPS service you deploy | Act on verified releases | Trust anything unsigned |

### 2.3 Change states

A governed change moves through these states:

| State | Meaning | Next |
| --- | --- | --- |
| `PENDING_APPROVAL` | Proposed; waiting for a checker | Approved, or refused by the approve step |
| `APPROVED` | Applied | — |
| `REJECTED` | Refused by a checker (rejection reason recorded) | — |

For a grant, a revoke is itself a change. Revoking records `revokedByChangeId` and `revokedAt`.

---

## Part 3. How the system is built

### 3.1 Components

| Component | What it is | Where | Holds a secret? |
| --- | --- | --- | --- |
| Parmana API | The authorization service (Express). Routes for execute, policies, grants, connectors, approval issuers, records. | Vercel project `parmana-api-real` (`https://parmana-api-real.vercel.app`) | Yes: `PARMANA_API_KEYS` (hashes), signing keys, database URL |
| Governance script | Maker and checker commands | `examples/live-checks/governance.ts` | No: keys are passed at run time |
| Agent runner | Asks Parmana to release one refund | `examples/razorpay-refund/send.ts`, `examples/razorpay-refund-agent/send.ts` | Agent key, at run time |
| Refund agent (library) | Input checks and the Parmana call | `examples/razorpay-refund-agent/agent.ts` | No |
| MCP bridge | One tool, `propose_refund`, for an agent platform | `examples/razorpay-agent-studio/mcp.ts`, Vercel project `parmana-agent-studio-mcp` | Bearer token; Parmana agent key |
| External endpoint | Verifies the release and acts | `examples/razorpay-refund/endpoint.ts`, Vercel project `parmana-razorpay-demo` | Razorpay test keys |

### 3.2 The refund path, end to end

```
Agent / platform
   |  MCP tool call (bearer token)              [mcp.ts]
   v
Refund agent: validates pay_ id and paise        [agent.ts]
   |  POST /execute (agent key, capability razorpay:refund, amount in paise)
   v
Parmana API
   |  1. Authenticate the caller (key hash)
   |  2. Load the policy in effect (razorpay-refund 1.0.0)
   |  3. Check the grant: caller, capability, amount limit, validUntil
   |  4. Check the approval: signed by a registered issuer, this payment, this amount, unused
   |  5. Decide: APPROVED or REFUSED; write a signed record
   |  6. If APPROVED: sign a release for the endpoint's audience, with expiry
   v
External endpoint (parmana-razorpay-demo)
   |  7. Verify the release: signature, audience, expiry, capability
   |  8. Check for an existing refund with receipt = businessTransactionId
   |  9. If none: POST /v1/payments/{id}/refund with amount in paise
   v
Razorpay (test mode)
   |  10. Refund created; the endpoint answers with the refund id
   v
Parmana records the outcome (the endpoint's answer is recorded as its claim)
```

Points of control:
- Steps 1 to 5 happen inside Parmana. A refused request never reaches the endpoint.
- Step 7 is the endpoint's own check. It refuses anything Parmana did not sign for its own address.
- Step 8 makes a repeated release harmless.

### 3.3 Trust boundaries

| Boundary | What crosses it | Protection |
| --- | --- | --- |
| Platform to MCP bridge | The tool call | Bearer token (`AGENT_STUDIO_TOKEN`), compared in constant time |
| Bridge to Parmana | The caller's request | Agent key, sent as `Authorization: Bearer` |
| Parmana to endpoint | The release | Ed25519 signature (`verifyParmanaRelease`), audience, expiry |
| Endpoint to Razorpay | The refund call | Razorpay test key, HTTP basic auth, 4 s timeout per call |
| Operator to Parmana governance | Proposals and approvals | Maker and checker keys; checker step-up signature |

### 3.4 Why it is built this way

- **No Razorpay key in Parmana.** A breach of Parmana's keys cannot move money on its own.
- **The agent has no refund action.** Its only path to money is the Parmana request.
- **Limits are enforced twice.** The grant caps each request; the policy decides the rest. A manager's approval cannot lift a grant limit.
- **Acting once.** The receipt check, not memory, prevents double refunds across restarts and across serverless instances.
- **Test mode is enforced in code.** The endpoint refuses `rzp_live_` keys before any call.

---

## Part 4. Workstation setup

Run once per machine. Windows PowerShell.

### 4.1 Repository

```powershell
git clone https://github.com/pavancharak/parmana-core D:\last\parmana-core
cd D:\last\parmana-core
npm ci --ignore-scripts
npm run build
```

- `--ignore-scripts` skips the repository's `prepare` hook, which sets git hooks. Use it unless you want the hooks.
- `npm run build` regenerates OpenAPI files. On 23 October the regenerated files matched the repository.
- Node 24 is required by `package.json`. Node 22 works for the Razorpay examples; the full test suite has three environment-dependent failures on Node 22 (Part 15, gap 10).

### 4.2 Folders the scripts expect

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-entries" | Out-Null   # key entry files: hashes and callerIds, no raw keys
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-secrets" | Out-Null   # DPAPI-encrypted secrets for this Windows user
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-checker" | Out-Null   # checker step-up key: step-up.private.pem
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-approver" | Out-Null  # manager approver key files
New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-vercel-link" | Out-Null  # folder linked to parmana-api-real
```

What goes where:

| Folder | Contents | Secret? |
| --- | --- | --- |
| `parmana-entries` | One JSON per caller: `callerId`, `keyHash`, `allowedCapabilities`, `credentialHolderType`, `stepUpPublicKey` | No (hashes and public keys) |
| `parmana-secrets` | `<name>.dpapi` files: encrypted with Windows DPAPI, readable only by this Windows user on this machine | Yes (encrypted) |
| `parmana-checker` | `step-up.private.pem` | Yes |
| `parmana-approver` | `<approver>__<key-id>.private.pem` | Yes |
| `parmana-vercel-link` | Vercel project link for `parmana-api-real` | No |

### 4.3 Vercel CLI

```powershell
npx vercel --version                       # ✅ 62.x was used on 23 October
cd "$env:USERPROFILE\parmana-vercel-link"
npx vercel link --yes --project parmana-api-real   # ⚠️ the link existed from earlier work; a fresh link was not re-run
```

### 4.4 Session helpers

Paste into each new window. They are not saved anywhere.

```powershell
$g = "examples/live-checks/governance.ts"
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
$stepUp = "$env:USERPROFILE\parmana-checker\step-up.private.pem"
$stepUpId = "checker-pavan"

function Use-Key([string]$label) {
  $env:PARMANA_API_KEY = [System.Net.NetworkCredential]::new("", (Read-Host "$label API key" -AsSecureString)).Password.Trim()
}
function Save-Secret([string]$Name, [string]$Value) {
  New-Item -ItemType Directory -Force "$env:USERPROFILE\parmana-secrets" | Out-Null
  ConvertTo-SecureString $Value -AsPlainText -Force | ConvertFrom-SecureString | Set-Content "$env:USERPROFILE\parmana-secrets\$Name.dpapi" -Encoding ascii
}
function Read-Secret([string]$Name) {
  $secure = Get-Content "$env:USERPROFILE\parmana-secrets\$Name.dpapi" | ConvertTo-SecureString
  [System.Net.NetworkCredential]::new("", $secure).Password
}
```

✅ All three helpers were used on 23 October.

What each helper does:
- `Use-Key` reads a key with hidden input and sets `PARMANA_API_KEY` for the rest of the window. Every governance command after it uses that key.
- `Save-Secret` encrypts a value with DPAPI and writes it to `parmana-secrets`. Only this Windows user on this machine can read it back.
- `Read-Secret` decrypts a value into memory. It prints nothing unless you print it.

---

## Part 5. Credentials

### 5.1 The kinds of credential

| Credential | Used for | Who holds it | Where it is stored |
| --- | --- | --- | --- |
| Agent key | Calling `/execute` for allowed capabilities | The agent (or the MCP bridge) | Vercel sensitive variable of the bridge; `parmana-secrets`; password manager |
| Maker key | Proposing changes | The maker (a human) | Password manager |
| Checker key | Approving changes | The checker (a human) | Password manager |
| Checker step-up key (Ed25519 private) | Signing each approve | The checker | `parmana-checker\step-up.private.pem`; password manager |
| Manager approver key | Signing approvals for one payment and amount | The manager | `parmana-approver`; password manager |
| MCP bearer token | Calling the bridge | The platform | Vercel sensitive variable; password manager |
| Endpoint keys (Razorpay test keys) | Calling the external system | The endpoint | Vercel sensitive variables of the endpoint |
| Parmana public key | Verifying releases and records | Public | Embedded in the endpoint bundle at build time |

### 5.2 Generating an agent key

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id <caller-id> --allowed-capabilities "<cap>"
```

Flags:
- `--caller-id` (required): the caller's id. Use a stable, descriptive id; it appears in every record.
- `--allowed-capabilities` (optional): comma-separated capabilities the key may invoke. Omit only for a deliberate reason.
- `--allowed-principal-ids` (optional): restricts the principals the key may act for.
- `--credential-holder-type USER` (optional): marks a human credential. Required for makers and checkers.
- `--generate-step-up-key` (optional): also generates an Ed25519 step-up key. Only for `USER` credentials.

What the script prints:
- `Key :` the raw key (43 characters). Shown once. The script writes nothing to disk.
- `Key hash :` the SHA-256 of the raw key. This is what Parmana stores.
- One line of JSON beginning `{"callerId"`. This is the entry. It contains the hash, not the key.
- With `--generate-step-up-key`: a PEM private key block, shown once.

Capture the output and split it:

```powershell
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\<caller-id>.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"
Set-Clipboard -Value $k
```

✅ `key length: 43` on 23 October. Anything else means the paste went wrong.

Then store the key. Either paste it into the password manager straight away, or keep it encrypted for this machine:

```powershell
Save-Secret "<caller-id>.key" $k
Remove-Variable k
```

✅ `Save-Secret` and `Read-Secret` round-trip on this machine.

### 5.3 Generating a human maker or checker

```powershell
$out = npx tsx scripts/generate-api-key.ts --caller-id maker-<name> --credential-holder-type USER --generate-step-up-key
```

A checker also needs its step-up PEM saved as a file, because the approve command reads it from a path:

```powershell
$pem = ($out -join "`n") -replace '(?s).*(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----).*', '$1'
$pem | Set-Content "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Encoding ascii
Select-String -Path "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Pattern "BEGIN PRIVATE KEY"
```

Expected: one matching line. ✅ On 23 October the checker's step-up file had one `BEGIN PRIVATE KEY` line.

Rules:
- Makers and checkers are different people, with different ids. A checker cannot approve its own proposal.
- The raw key and the step-up PEM go to the password manager. Keep the step-up file only where the checker runs approvals.
- A human credential is never given to a machine or an agent.

### 5.4 Manager approver keys

A manager approver is a registered approval issuer. Its private key signs one approval per payment and amount.

Check what is registered (read-only, needs any valid key):

```powershell
Use-Key "Checker"
curl.exe -s "$env:PARMANA_URL/approval-issuers" -H "Authorization: Bearer $env:PARMANA_API_KEY"
```

The response lists every issuer with `approverId`, `keyId`, `revoked`, `publicKeyPem`. No private key appears. ✅ On 23 October the active issuer was `manager-pavan` / `manager-pavan-key-1` (not revoked).

Sign an approval (run as the operator who holds the manager's key):

```powershell
npx tsx examples/razorpay-refund/send.ts --case approved --payment <pay_id> --amount <paise> `
  --approver-key-file "$env:USERPROFILE\parmana-approver\<approver>__<key-id>.private.pem" `
  --approver-id <approver> --approver-key-id <key-id> `
  --save-approval approval.json --out record.json
```

The approval is saved to `approval.json`. It is single-use: a second use is refused (scenario E). Delete it when the test is over.

Creating a new approver issuer: ❌ there is no command. The API has `POST /approval-issuers/changes` and `POST /approval-issuers/changes/{id}/approve`, but `governance.ts` does not implement them (its header says approver issuers "cannot be added or revoked here"). Until that command is built, a new issuer needs direct API calls. Do not create approver keys outside a governed flow.

### 5.5 MCP bearer tokens

```powershell
$bytes = New-Object byte[] 32
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
Save-Secret "agent-studio-token" $token
Remove-Variable token
```

✅ 43 characters. The bridge compares it with the caller's header in constant time. Give it to the platform through a private channel only.

### 5.6 Putting secrets into Vercel

```powershell
cd <project-folder>
npx vercel env rm <NAME> production --yes          # ignore "not found"
$value | npx vercel env add <NAME> production --sensitive
npx vercel env ls production                       # names only; values show as Hidden
```

- `--sensitive` makes the value write-only: it cannot be read back from the dashboard or CLI.
- Piping a value adds a trailing newline. The CLI reports `Removed trailing newline from stdin input` and strips it. ✅ Seen 23 October.
- A changed variable applies only to the next deployment. Redeploy after every change (scenario M).

### 5.7 Rotation and revocation

Rotate when a key may have been seen by anyone other than its holder, when a holder leaves, or on a schedule you set.

Procedure for an agent key (scenario H):
1. Generate a new key under the same caller id (5.2).
2. Replace the entry file in `parmana-entries`.
3. Replace `PARMANA_API_KEYS` as a whole (Part 7). The old key stops working when the list is replaced.
4. Update the bridge or endpoint secret that holds the key, and redeploy.
5. Check the new key with `/callers/me`.
6. Remove the old entry from the folder, so it cannot return in a later list update.

Procedure for a grant (not a key): revoke it (Part 6). The key keeps working but is refused for that capability.

---

## Part 6. Governed changes

### 6.1 The four kinds of change

| Kind | Purpose | Propose (maker) | Approve (checker) |
| --- | --- | --- | --- |
| Policy | Rules for a capability | `propose-policy --file <json>` | `approve --kind policy --id <id>` |
| Connector | An endpoint for a capability | `propose-connector --capability <cap> --endpoint-url <https-url> --policy <name> --allowed-parameters <csv>` | `approve --kind connector --id <id>` |
| Signal source | An external fact source | `propose-source --name <n> --endpoint-url <https-url> --public-key-file <pem> --key-id <id>` | `approve --kind source --id <id>` |
| Grant | Permission for a caller | `propose-grant --caller-id <id> --capability <cap> --max-amount <n> --valid-days <d>` | `approve --kind grant --id <id>` |

Revocations are changes too:

| Kind | Propose | Approve |
| --- | --- | --- |
| Grant | `propose-revoke --kind grant --caller-id <id> --capability <cap>` | `approve --kind grant --id <revoke-id>` |
| Connector | `propose-revoke --kind connector --capability <cap>` | `approve --kind connector --id <revoke-id>` |
| Source | `propose-revoke --kind source ...` | `approve --kind source --id <revoke-id>` |

### 6.2 How to run a pair

Maker:

```powershell
Use-Key "Maker"
npx tsx $g propose-grant --caller-id razorpay-demo-agent --capability razorpay:refund --max-amount 500 --valid-days 7
```

The output is JSON with a `changeId` and `"status": "PENDING_APPROVAL"`. Copy the `changeId`.

Checker:

```powershell
Use-Key "Checker"
npx tsx $g approve --kind grant --id <changeId> --step-up-key-file $stepUp --step-up-key-id $stepUpId
```

The approve command prints the change, then asks you to type `APPROVE`. Typing anything else stops it. A correct approval ends with `Status: APPROVED`.

✅ Verified on 23 October for a revoke and a grant.

### 6.3 Rules Parmana enforces

- ✅ **One active grant per caller and capability.** A new grant is refused while an active one exists: `'<caller>' already holds a grant for '<cap>'. Revoke it first.` Even an expired grant still shows as `active` until it is revoked. Revoke first, then propose.
- ✅ **One active connector per capability.** `Capability '<cap>' already has an active external connector. Revoke it first.`
- ✅ **One pending policy change per version.** `A PENDING_APPROVAL change already exists for policy '<name>' version '<v>'.` To change a policy, approve or leave the pending one, and propose a new version.
- ✅ **The checker must be a verified human.** `This action requires a caller credential provisioned as a verified human (credentialHolderType: USER).`
- ✅ **Policy approvals have a separate checker scope.** On 23 October an approval refused with `CHECKER_NOT_IN_SCOPE` while grant approvals with the same key succeeded (scenario I).
- ❌ **No reject command.** A change you do not want applied stays pending. Gap 1 in Part 15.
- ✅ **Expired grants are refused.** `validUntil` is enforced at decision time. Renew by revoking and re-proposing.

### 6.4 Reading the state

Read-only, any valid key:

```powershell
curl.exe -s "$env:PARMANA_URL/policies/pending-changes" -H "Authorization: Bearer $env:PARMANA_API_KEY"
curl.exe -s "$env:PARMANA_URL/policies/in-effect?capability=<cap>" -H "Authorization: Bearer $env:PARMANA_API_KEY"
curl.exe -s "$env:PARMANA_URL/external-connectors" -H "Authorization: Bearer $env:PARMANA_API_KEY"
curl.exe -s "$env:PARMANA_URL/authority-grants" -H "Authorization: Bearer $env:PARMANA_API_KEY"
curl.exe -s "$env:PARMANA_URL/authority-grants/changes" -H "Authorization: Bearer $env:PARMANA_API_KEY"
```

✅ All five returned data on 23 October.

How to read them:
- `policies/in-effect` shows the policy name, version, `authorityGrantRequired` and the signal facts. Check it after every policy approval.
- `external-connectors` shows `status` (`active` or `revoked`), `endpointUrl`, `allowedParameters`.
- `authority-grants` shows `validUntil` and `limits`. An `active` grant with a past `validUntil` is not in force.
- `authority-grants/changes` shows pending and resolved changes, with `resolvedBy` and `rejectionReason` where present.

### 6.5 Changing a limit

A grant's limit is set when it is proposed. To change a limit, revoke the grant and propose a new one with the new `--max-amount`. Approve both changes. Check the new grant with `authority-grants`. This is the same procedure as renewal (scenario Q).

### 6.6 Changing a policy

1. Write the new rules as a new file with a new `policyVersion`.
2. Propose it (maker). It must not be the same version as one already pending.
3. Approve it (checker). Check `policies/in-effect` shows the new version.
4. Do not edit a version that is already in force. Parmana keys policies by version.

---

## Part 7. The live key list (PARMANA_API_KEYS)

Parmana reads every caller's key entry from one Vercel secret, `PARMANA_API_KEYS`. The whole list is replaced at once. Lose an entry and that caller is locked out until it is restored.

### 7.1 Procedure

1. **Check the folder** holds every caller that must keep working:
   ```powershell
   Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | Select-Object Name
   ```
2. **Build and print the list** (no change yet):
   ```powershell
   $link = "$env:USERPROFILE\parmana-vercel-link"
   $entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
   $entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
   ```
   Every expected caller must appear. If one is missing, stop.
3. **Replace the list and redeploy:**
   ```powershell
   $value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
   vercel env rm PARMANA_API_KEYS production --yes --cwd $link
   $value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
   npx vercel ls parmana-api-real --cwd $link          # read the newest Production URL from the table on screen
   npx vercel redeploy <that-production-url> --target production --cwd $link
   ```
4. **Check** the caller's key:
   ```powershell
   $k = Read-Secret "<caller-id>.key"
   curl.exe -s -o NUL -w "%{http_code}" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"
   Remove-Variable k
   ```
   ✅ `200`. `401` with `authentication required` means the key is not in the live list or the wrong key was used (scenario K).

### 7.2 Why these details matter

- **Step 2 is the only safety check.** Nothing else stops a list update from removing a caller.
- **`ls` output piped to a filter returned nothing on 23 October.** Read the table on screen and copy the URL. Gap 8 in Part 15 covers the setup script's version of this problem.
- **The redeploy is needed.** A changed secret reaches the running service only through a deployment (scenario M).

---

## Part 8. Building the external endpoint

### 8.1 What the endpoint must do

- Verify the release Parmana sends: signature, audience, expiry, capability.
- Act once per release, using `businessTransactionId` as an idempotency key.
- Answer with the outcome, which Parmana records as the endpoint's claim.
- Refuse anything it cannot verify, without calling the external system.

### 8.2 The template (Razorpay refund endpoint)

`examples/razorpay-refund/endpoint.ts`:

- `createHandler({ publicKeyPem, audience, refund, now? })` returns a function that takes the parsed body.
- It calls `verifyParmanaRelease(body, { publicKeys: { default: publicKeyPem }, audience })`. Verification checks the signature against the public key, the audience against the endpoint's own URL, and the expiry window.
- It refuses any capability other than `razorpay:refund` with status 401.
- It reads `release.parameters.amount`, `release.target` (the payment id) and `release.businessTransactionId`.
- It calls `refund({ paymentId, amount, receipt })`.
- The default export is the Vercel function. It refuses non-POST requests with 405 and unparseable bodies with 400.

`examples/razorpay-refund/razorpay.ts`:

- `assertTestMode` refuses any key id that does not start with `rzp_test_`, before any call.
- `createRefunder` lists the payment's refunds (`GET /v1/payments/{id}/refunds?count=100`), and returns the existing one if its receipt matches. Otherwise it creates one (`POST /v1/payments/{id}/refund`) with `receipt` and `notes.parmanaBusinessTransactionId`.
- Each Razorpay call has a 4 second timeout, so two calls fit inside Parmana's 10 second connector timeout.
- Amounts are in paise.

### 8.3 Build the deployable folder

```powershell
npx tsx examples/razorpay-refund/build-endpoint.ts --parmana-url https://parmana-api-real.vercel.app `
  --endpoint-url https://parmana-razorpay-demo.vercel.app/api/refund --out ..\parmana-razorpay-demo
```

What it does:
- Fetches Parmana's public key from `GET {parmana-url}/keys/default`.
- Bundles `endpoint.ts` with esbuild into `api/refund.mjs`, writing in the public key and the endpoint URL as constants.
- Writes a `package.json` and a `vercel.json` with a 30 second `maxDuration`.

The `--endpoint-url` must be the exact address the endpoint is registered under. A release for any other address is refused. ⚠️ The build was run on earlier work; the endpoint is live and answers as expected (below).

### 8.4 Deploy and check

```powershell
cd ..\parmana-razorpay-demo
npx vercel link --yes --project parmana-razorpay-demo
# add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET (test mode) as sensitive variables, entered at the prompt
npx vercel deploy --prod --yes
curl.exe -s -X POST https://parmana-razorpay-demo.vercel.app/api/refund -H "Content-Type: application/json" -d "{}"
```

✅ Expected response, seen on 23 October: `{"errors":["the body is not { release, signature }"]}`. An unsigned body is refused before anything else.

### 8.5 Adapting the endpoint for another external system

1. Keep the verification part exactly as it is. Change only the capability check and the action.
2. Make the action idempotent with a stable key taken from the release (for example `businessTransactionId`), and check for prior action before acting.
3. Keep the external system's test keys in Vercel sensitive variables. Refuse live keys in code, not only in documentation.
4. Bound every external call with a timeout that fits inside the connector timeout Parmana uses (10 seconds).
5. Answer with the outcome in the response body. Do not answer with a success status for a failure.

---

## Part 9. Putting an agent behind an MCP tool

Agent platforms such as Razorpay Agent Studio call tools over MCP (Model Context Protocol). The bridge exposes one tool and forwards to the refund agent.

### 9.1 What the bridge does

`examples/razorpay-agent-studio/mcp.ts`:
- Protocol: MCP over HTTP, JSON responses. Methods `initialize`, `ping`, `tools/list`, `tools/call`. Notifications return 202.
- Authentication: the `Authorization` header must equal `Bearer <AGENT_STUDIO_TOKEN>`, compared in constant time. Anything else is 401 and calls nothing.
- Tool: `propose_refund(paymentId, amountPaise, purpose?, approval?)`. The input is validated first. Parmana is called only for valid input.
- Results: `APPROVED` with Razorpay's answer, or `REFUSED` with the rule and reason. Bad input is a tool error, not a server error.
- Startup: the token must be at least 32 characters, or the bridge refuses to start.

### 9.2 Build and deploy

```powershell
npx tsx examples/razorpay-agent-studio/build-mcp.ts --out ..\parmana-agent-studio-mcp
cd ..\parmana-agent-studio-mcp
npx vercel link --yes --project parmana-agent-studio-mcp
```

Then the three sensitive variables, `AGENT_STUDIO_TOKEN`, `PARMANA_URL`, `PARMANA_API_KEY` (Part 5.6), and:

```powershell
npx vercel deploy --prod --yes
```

Two fixes are needed for the bundle to deploy (scenario N):
- Add a `vercel.json` that replaces the project's build command, since the project may still carry the repository's:
  ```json
  { "buildCommand": "echo prebuilt", "installCommand": "echo no install", "functions": { "api/mcp.mjs": { "maxDuration": 60 } } }
  ```
- Add `public/index.html`, since the project may expect a `public` output folder.

✅ Deployed on 23 October at `https://parmana-agent-studio-mcp.vercel.app/api/mcp`.

### 9.3 Checks

```powershell
# No token: 401 expected
curl.exe -i -X POST https://parmana-agent-studio-mcp.vercel.app/api/mcp -H "Content-Type: application/json" -d "{}"

# With token: 200 expected, listing propose_refund
$t = Read-Secret "agent-studio-token"
'{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | Set-Content "$env:TEMP\mcp-tools-list.json" -Encoding ascii
curl.exe -i -X POST https://parmana-agent-studio-mcp.vercel.app/api/mcp -H "Authorization: Bearer $t" -H "Content-Type: application/json" --data-binary "@$env:TEMP\mcp-tools-list.json"
```

✅ Both results seen on 23 October (401, then 200 with `propose_refund`).

Important: pass the body as a file with `--data-binary`. Inline JSON with escaped quotes in PowerShell arrived mangled and returned `400 Parse error`.

### 9.4 Registering with a platform

The platform owner registers the URL and the bearer token as a custom tool or connector. ❌ For Razorpay Agent Studio, public documentation does not describe a self-serve path for custom MCP tools. Razorpay must register it. Gap 4 in Part 15.

---

## Part 10. The connection sequence, step by step

Use this list to connect any new external system. The order matters, because each step depends on the previous one.

**Step 1. Decide the shape.**
- The capability: `<namespace>:<action>`. One namespace per external system.
- Money or records changed? If yes, the policy needs a human approval rule. If read-only, a grant may be enough.
- The caller: which agent or service, and which principal.
- The limit: the maximum per request, in the system's smallest unit (paise for rupees).

**Step 2. Write the policy.**
- Start from `policies/` or `examples/razorpay-refund/policy.json`.
- Rules are evaluated in order. The last rule must be `always` → reject.
- Declare `boundSignals` for any value the policy trusts from the request, and `approvalSignals` for approvals.
- Submit it with `propose-policy`. The proposal is validated before it is stored; an invalid file is refused. ✅ The validator's tests pass.

**Step 3. Build the endpoint.**
- Use the template (Part 8). Change only the capability and the action.
- Build with `build-endpoint.ts` (or your own build), embedding Parmana's public key and the endpoint URL.

**Step 4. Deploy the endpoint.**
- Create the Vercel project and add the external system's test keys as sensitive variables.
- Check that an unsigned body is refused (Part 8.4).

**Step 5. Propose the policy (maker) and approve it (checker).**
- Confirm with `policies/in-effect?capability=<cap>`.

**Step 6. Propose the connector (maker) and approve it (checker).**
- `--endpoint-url` must match the endpoint's registered address exactly.
- `--allowed-parameters` lists only what the endpoint needs. Anything else is not sent.
- Confirm with `external-connectors`: status `active`.

**Step 7. Create the caller's key.**
- Generate (Part 5.2), with `--allowed-capabilities` set to the new capability only.
- Save the entry and the key.

**Step 8. Replace the live key list (Part 7) and check `/callers/me`.**

**Step 9. Propose the grant (maker) and approve it (checker).**
- Set `--max-amount` to the limit from Step 1 and `--valid-days` to the period you want.
- Confirm with `authority-grants`: `validUntil` is in the future.

**Step 10. Run the cases.**
- At minimum: no approval (refused), a valid approval (approved), above the limit (refused), a replay (refused).
- Keep each `record-*.json`. Each run prints `PASS` or `FAIL`.

**Step 11. Confirm in the external system.**
- For a payment system: the test dashboard, the refund list for the period, the amount, the receipt.

**Step 12. Connect the trigger, then go live.**
- Connect the platform or event source (Part 9, or scenario G).
- Go live only after the go-live plan in Part 11, scenario P, is agreed with the counterparty.

---

## Part 11. Scenarios

Each scenario states the situation, the steps, the expected result, and the status.

### Scenario A. Create a new agent key and make it usable

**Situation.** A new caller needs to ask Parmana for one capability.

**Steps.** Generate the key (5.2). Save the entry and the key. Propose and approve a grant (6.2). Replace the live key list (7.1). Check `/callers/me`.

**Expected.** `200` from `/callers/me`, and the grant shows `active` with a future `validUntil`.

**Status.** ✅ Done for `razorpay-demo-agent` on 23 October.

### Scenario B. Approved refund

**Situation.** A valid manager approval exists for this payment and amount, within the grant.

**Steps.** Run the approved case (5.4 and Part 13).

**Expected.** `Answer : APPROVED`, a `Razorpay answered` line with `refundId` starting `rfnd_`, `Verifies offline : true`, `PASS`.

**Status.** ✅ On 23 October: refund `rfnd_TrPyItqZ6h7Dgo`, ₹1, processed in test mode, record `4346a484-f85d-4c3c-bc61-2f416aabd586`.

### Scenario C. Refused: no approval

**Situation.** The request has no approval.

**Steps.** Run the agent runner without `--approval-file`, or the `no-approval` case.

**Expected.** `Answer : REFUSED`, rule `reject-manager-approval-required`. The endpoint is never called.

**Status.** ✅ On 23 October.

### Scenario D. Refused: above the grant limit

**Situation.** A valid approval exists, but the amount is above the grant maximum.

**Steps.** Run the `over-limit` case with an amount above the grant.

**Expected.** `REFUSED`, `Authority : NOT_AUTHORIZED`, the reason names the granted maximum. A valid approval does not lift a grant limit.

**Status.** ✅ On 23 October: 800 paise against a 500 maximum, refused as expected.

### Scenario E. Refused: replayed approval

**Situation.** An approval already used is presented again.

**Steps.** Run the `replay` case with the saved `approval.json`.

**Expected.** `REFUSED`, rule `signal-state-verification-violation` (the approval is spent and no longer matches the verified state).

**Status.** ✅ On 23 October.

### Scenario F. Agent platform calls the bridge

**Situation.** An agent platform wants to propose refunds through a tool.

**Steps.** Build and deploy the bridge (Part 9). Give the platform the URL and the token by a private channel. The platform registers the tool.

**Expected.** Without a token: 401. With a token: the tool list, and a tool call returns the same result as Scenario B or C.

**Status.** ✅ Bridge deployed and checked (401, then 200 with the tool list). ❌ Platform registration not done (Gap 4).

### Scenario G. A system sends signed events

**Situation.** An external system posts signed events to Parmana's connector, rather than an agent calling a tool.

**Steps.** ❌ Not built. Needed:
- an HTTPS receiver that reads the raw body;
- a check of `X-Event-Signature` as HMAC-SHA256 of `timestamp + "." + raw_body`;
- a check that `X-Event-Timestamp` is within 5 minutes and not in the future;
- an idempotency store keyed on `Idempotency-Key`, kept for 24 hours; a duplicate returns the stored answer and triggers nothing;
- retries for 5xx and timeouts only, with the same key and a fresh signature;
- a reply path to the customer or the caller.

**Expected.** A correctly signed event is accepted (202). A duplicate returns 200 with `status: duplicate`. A bad signature or an old timestamp returns 401.

**Status.** ❌ Not built. Specified by the Razorpay spec, Appendix A.

### Scenario H. Rotate a key after exposure

**Situation.** A key was printed, pasted or shared.

**Steps.** Rotation procedure (5.7). Treat the old key as exposed from the moment it appeared.

**Expected.** The old key returns `401` after the list update. The new key returns `200`.

**Status.** ✅ Procedure and list update verified on 23 October. The old keys printed in chat during setup were replaced and do not work.

### Scenario I. Policy approval refused: `CHECKER_NOT_IN_SCOPE`

**Situation.** A checker approves a policy change and the server refuses with `CHECKER_NOT_IN_SCOPE`.

**Steps.** Confirm the same checker key can approve a grant (it can). Check the policy-change checker list on Vercel: the `POLICY_CHANGE_CHECKERS` secret on `parmana-api-real`. The value is hidden, so check it in the dashboard, not the CLI.

**Expected.** The checker is on the list, and the approve succeeds. If not, adding the checker is a security decision: decide it with the owner of the policy process, then change the secret and redeploy.

**Status.** ✅ Refusal seen on 23 October for a duplicate policy change. ⚠️ Cause not confirmed: the list is not visible from the repository or the sandbox.

### Scenario J. Timeout after a release

**Situation.** The agent or runner timed out. The refund may already exist.

**Steps.** Do not send the request again. Read the record first:

```powershell
$k = Read-Secret "<caller-id>.key"
curl.exe -s "$env:PARMANA_URL/trust-records/<businessTransactionId>" -H "Authorization: Bearer $k"
Remove-Variable k
```

Then check the external system for a refund with that receipt. A resend would return the existing refund rather than create a second one, because of the receipt check, but a resend still needs a new approval.

**Expected.** The trust record shows the outcome. The external system shows one refund, or none.

**Status.** ⚠️ The receipt check is covered by unit tests with a fake Razorpay (16 tests in the Razorpay examples). The trust-record lookup has not been run against live Parmana.

### Scenario K. `authentication required` or `Caller is not permitted`

**Situation.** A call is refused for authentication.

**Steps.**
- `authentication required` (401): check the key length (43), check the hash against the entry file (5.2), check the live list (Part 7). If the key is right, the list is stale: redeploy.
- `Caller is not permitted to invoke this capability`: the wrong key is loaded. This happened on 23 October after `Use-Key "Checker"` in the same window. Reload the caller's key: `$env:PARMANA_API_KEY = Read-Secret "<caller-id>.key"`.

**Status.** ✅ Both reproduced and fixed on 23 October.

### Scenario L. `This action requires a caller credential provisioned as a verified human`

**Situation.** An approve is attempted with a non-human key.

**Steps.** Load the checker's key (`Use-Key "Checker"`) and retry.

**Status.** ✅ Reproduced and fixed on 23 October.

### Scenario M. A Vercel change has no effect

**Situation.** A variable was changed but the behaviour did not change.

**Steps.** Redeploy the project that holds the variable. For the bridge: `npx vercel deploy --prod --yes` in the bundle folder. For Parmana: `npx vercel redeploy <production-url> --target production --cwd $link`.

**Status.** ✅ On 23 October, the list change needed a redeploy before the agent key was accepted.

### Scenario N. A Vercel deploy fails

| Error | Cause | Fix |
| --- | --- | --- |
| `npm error Missing script: "openapi"` | The project's build command is the repository's, and the bundle has no such script | Add the `vercel.json` build override (9.2) |
| `No Output Directory named "public" found` | The project expects a `public` output folder | Add `public/index.html` (9.2) |
| `Deployment Protection is on for this project` | Vercel Authentication is on | Requests with the project's bearer token still work. Turn protection off only if the caller cannot send the token |
| `vercel link` in the repository root connects the wrong repository | The link was made in the wrong folder | Unlink; link from the bundle folder |

**Status.** ✅ All four seen and fixed on 23 October.

### Scenario O. `Unable to communicate with the Parmana Runtime`

**Situation.** A governance command fails with a connectivity message.

**Steps.** Check `GET /health` (expected `{"status":"UP"}`). Retry the command once. Do not re-propose a change because of this message.

**Status.** ✅ Seen once on 23 October. The retry approved the grant.

### Scenario P. Going live

**Situation.** Test mode has passed and the counterparty agrees to live use.

**Steps.**
1. Agree with the counterparty: the trigger, the approval model, the limit, and the refusal status code.
2. Switch the external system's keys from test to live. The endpoint must still refuse test keys in live, and live keys in test. Make both checks explicit in code.
3. First live action: a small refund on one of the company's own payments. Show the approval and the refund end to end.
4. Only then route real requests through Parmana.

**Status.** ❌ Not done. The Razorpay endpoint refuses `rzp_live_` keys today, so it cannot go live until that rule is changed deliberately.

### Scenario Q. Changing a limit

**Situation.** The per-request limit must change.

**Steps.** Revoke the grant (6.1). Propose a new grant with the new `--max-amount` (6.2). Approve both. Check `authority-grants`.

**Expected.** The old limit is refused and the new one is applied. Re-run the over-limit case to confirm.

**Status.** ✅ The revoke and re-grant steps were run on 23 October (the limit stayed at 500 paise).

### Scenario R. Changing a policy

**Situation.** The rules must change.

**Steps.** Part 6.6.

**Status.** ✅ Propose and approve steps verified on 23 October. A duplicate of the in-force version is pending and was not approved (scenario I).

### Scenario S. A second agent on the same capability

**Situation.** A second caller needs `razorpay:refund`.

**Steps.** Generate a second key (5.2) with its own `callerId`. Propose a grant for that caller. Approve it. Replace the live key list (Part 7).

**Expected.** Each caller has its own grant and its own limit. One caller's grant does not affect the other.

**Status.** ⚠️ Follows from the rules in 6.3 and the list procedure in Part 7. Not run.

### Scenario T. A new capability on an existing endpoint

**Situation.** The endpoint should also serve a second capability.

**Steps.** Parmana's connector has one capability per registration. Register a second connector for the second capability, with its own policy. The endpoint must check the capability it receives, and refuse the rest (as the Razorpay endpoint does with 401).

**Status.** ⚠️ Not run. The endpoint's capability check is covered by unit tests.

### Scenario U. Incident: a refund looks wrong

**Situation.** A refund appears that should not exist.

**Steps.**
1. Stop further requests: revoke the grant for the caller (6.1). A revoke is a governed change, so ask a checker to approve it. If the checker is unavailable, rotate the caller's key (5.7) and replace the list (Part 7).
2. Find the decision: the trust record for its `businessTransactionId` (scenario J).
3. Check the external system: the refund, its amount, its receipt.
4. Record the incident in Part 18.

**Status.** ⚠️ The steps are the ones this book already relies on. Not rehearsed.

---

## Part 12. Troubleshooting: exact messages

| Message | Where | Meaning | What to do |
| --- | --- | --- | --- |
| `authentication required` | Parmana, 401 | The key is not accepted | Scenario K |
| `Caller is not permitted to invoke this capability.` | Runner | The key does not allow the capability | Load the caller's key (scenario K) |
| `authority-not-authorized` / `NOT_AUTHORIZED` | Parmana refusal | Amount above the grant | Correct refusal. Change the limit only through a governed change (Q) |
| `reject-manager-approval-required` | Parmana refusal | No signed approval | Correct refusal. Add an approval |
| `signal-state-verification-violation` | Parmana refusal | Approval spent, or not matching | Correct refusal for replays (E) |
| `A PENDING_APPROVAL change already exists for policy '<name>' version '<v>'.` | Governance | A change for this version is pending | Approve or leave it; propose a new version for new content |
| `Capability '<cap>' already has an active external connector. Revoke it first.` | Governance | A connector is active | Revoke, approve, then propose |
| `'<caller>' already holds a grant for '<cap>'. Revoke it first.` | Governance | A grant exists, even if expired | Revoke, approve, then propose |
| `CHECKER_NOT_IN_SCOPE` | Governance | Checker not allowed for this change type | Scenario I |
| `This action requires a caller credential provisioned as a verified human (credentialHolderType: USER).` | Governance | Non-human key used to approve | Scenario L |
| `Unable to communicate with the Parmana Runtime.` | Governance | Connectivity | Scenario O |
| `Refund rejected because the amount must be greater than 0 paise.` | Parmana refusal | Amount zero or below | Use whole paise above 0 |
| `The change to review ... Type APPROVE to approve exactly this change (anything else stops)` | Governance | Confirmation prompt | Type `APPROVE` only if the change is the one intended |
| `Could not add <name> to Vercel.` | Setup script | `vercel env add` failed | Check the variable name, the project link, and that you are in the right folder |
| `Removed trailing newline from stdin input` | Vercel CLI | A piped value had a newline | Expected; the CLI strips it |
| `Error: Environment Variable was not found.` | Vercel CLI, on `env rm` | Nothing to remove | Expected when the variable was never set |
| `curl: (3) URL rejected: Port number was not a decimal number` | curl | The URL had unescaped text, usually from a broken command | Re-paste the command; put the body in a file |
| `{"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error."}}` | MCP bridge, 400 | The body arrived mangled | Send the body with `--data-binary "@file"` (9.3) |
| `Error: [BUILD_UTILS_SPAWN_1] ... exited with 1` | Vercel deploy | Build command from the repository | Scenario N |
| `Missing script: "openapi"` | Vercel deploy | Same | Scenario N |

---

## Part 13. Command reference

### 13.1 Setup and builds

| Purpose | Command |
| --- | --- |
| Install | `npm ci --ignore-scripts` |
| Build the SDK and OpenAPI | `npm run build` |
| Build the endpoint bundle | `npx tsx examples/razorpay-refund/build-endpoint.ts --parmana-url <url> --endpoint-url <url> --out <folder>` |
| Build the MCP bundle | `npx tsx examples/razorpay-agent-studio/build-mcp.ts --out <folder>` |
| Run the Razorpay tests | `npx vitest run examples/razorpay-agent-studio examples/razorpay-refund-agent examples/razorpay-refund` |

### 13.2 Keys

| Purpose | Command |
| --- | --- |
| Generate a key | `npx tsx scripts/generate-api-key.ts --caller-id <id> [--allowed-capabilities <csv>] [--allowed-principal-ids <csv>] [--credential-holder-type USER] [--generate-step-up-key]` |
| Generate a random token | `[Convert]::ToBase64String(...)` (Part 5.5) |

### 13.3 Governance

| Purpose | Command |
| --- | --- |
| Propose a policy | `npx tsx $g propose-policy --file <json>` |
| Propose a connector | `npx tsx $g propose-connector --capability <cap> --endpoint-url <url> --policy <name> --allowed-parameters <csv>` |
| Propose a signal source | `npx tsx $g propose-source --name <n> --endpoint-url <url> --public-key-file <pem> --key-id <id>` |
| Propose a grant | `npx tsx $g propose-grant --caller-id <id> --capability <cap> --max-amount <n> --valid-days <d>` |
| Propose a revoke | `npx tsx $g propose-revoke --kind grant\|connector\|source ...` |
| Approve | `npx tsx $g approve --kind policy\|connector\|source\|grant --id <id> --step-up-key-file $stepUp --step-up-key-id $stepUpId` |

### 13.4 Agent and approval runs

| Purpose | Command |
| --- | --- |
| The four demo cases | `npx tsx examples/razorpay-refund/send.ts --case approved\|no-approval\|over-limit\|replay --payment <pay_> --amount <paise> [...]` |
| The agent runner | `npx tsx examples/razorpay-refund-agent/send.ts --payment <pay_> --amount <paise> [--approval-file <json>] --out <json>` |
| Sign an approval | `--approver-key-file <pem> --approver-id <id> --approver-key-id <id> --save-approval <json>` |

### 13.5 Reads (any valid key for the caller that should see it)

| Purpose | Request |
| --- | --- |
| Health | `GET /health` |
| Who am I | `GET /callers/me` |
| Policy in force | `GET /policies/in-effect?capability=<cap>` |
| Pending policy changes | `GET /policies/pending-changes` |
| Connectors | `GET /external-connectors` |
| Grants | `GET /authority-grants` |
| Grant changes | `GET /authority-grants/changes` |
| Approval issuers | `GET /approval-issuers` |
| Trust record | `GET /trust-records/<businessTransactionId>` |
| Refusal record | `GET /refusal/<businessTransactionId>` |
| Public key | `GET /keys/default` |

### 13.6 Vercel

| Purpose | Command |
| --- | --- |
| Link a folder | `npx vercel link --yes --project <name>` |
| Add a secret | `$value \| npx vercel env add <NAME> production --sensitive` |
| Remove a secret | `npx vercel env rm <NAME> production --yes` |
| List secrets (names) | `npx vercel env ls production` |
| List deployments | `npx vercel ls <project> --cwd <folder>` |
| Deploy | `npx vercel deploy --prod --yes` (in the folder) |
| Redeploy | `npx vercel redeploy <url> --target production` |

### 13.7 Session helpers

`Use-Key`, `Save-Secret`, `Read-Secret` (Part 4.4).

---

## Part 14. Evidence: what was tested on 23 October 2026

| Area | What was run | Result | Identifiers |
| --- | --- | --- | --- |
| Refund refused, no approval | Runner, no approval | REFUSED, `reject-manager-approval-required` | Transaction `a0f74bc9-e929-43e8-87b8-8b1962ace5e5` |
| Refund approved | Runner, with manager approval | APPROVED; refund processed; record verifies offline | Refund `rfnd_TrPyItqZ6h7Dgo`; transaction `4346a484-f85d-4c3c-bc61-2f416aabd586` |
| Refund over limit | Runner, ₹8 against ₹5 grant | REFUSED, `NOT_AUTHORIZED` | Transaction `5960dc40-7383-429c-a251-c863d32f3f1d` |
| Refund replay | Runner, approval reused | REFUSED, `signal-state-verification-violation` | Transaction `0bb0de83-b31f-4e7f-b9b2-22014901691e` |
| Grant renewal | Revoke, approve, propose, approve | Revoke `68e3d72a-a8a8-409a-9b0f-9808f53ba8c4`; grant `7fda621d-b8dd-4eeb-938e-b508e301da7b` active to 2026-10-30 | As listed |
| Policy duplicate | Approve a duplicate pending change | Refused: `CHECKER_NOT_IN_SCOPE` | `cf85a4af-082a-424a-a646-31acc1cf8019` (still pending) |
| Key list | Replace `PARMANA_API_KEYS` | Four entries; agent key returns 200 on `/callers/me` | — |
| Bridge | Unauthenticated and authenticated `tools/list` | 401, then 200 with `propose_refund` | — |
| Endpoint | Unsigned body | Refused with the envelope message | — |
| Repository checks | Razorpay examples; policy validator | 22 tests pass (earlier count) and 16 tests pass (policy checks, re-run today) | — |
| Public health | `GET /health` | `{"status":"UP"}` (seen on the operator's machine) | — |

What this table does not prove:
- The record lookup after a timeout (scenario J) was not run against live Parmana.
- The cause of `CHECKER_NOT_IN_SCOPE` was not confirmed.
- Scenarios G, S, T and U were not run.

---

## Part 15. Gaps and decisions

| # | Gap | Impact | Action | Owner |
| --- | --- | --- | --- | --- |
| 1 | No `reject` command for governed changes | An unwanted change stays pending | Add `reject` with step-up, and a test | Engineering |
| 2 | No command to propose or approve an approval-issuer change | New approvers need direct API calls | Add `propose-approver` and an approve kind | Engineering |
| 3 | `CHECKER_NOT_IN_SCOPE` for policy approvals | Policy changes cannot be approved by this checker | Confirm `POLICY_CHANGE_CHECKERS`; decide whether to add the checker | Owner of the policy process |
| 4 | The bridge is not registered with Razorpay Agent Studio | Agent Studio cannot call Parmana | Razorpay registers the tool | Razorpay |
| 5 | No event receiver for signed `refund.requested` events | The spec's trigger path is missing | Build with tests (scenario G) | Engineering |
| 6 | The approval model: per-refund approval or a limit without one | A spec-style request is always refused today | Decide; change the policy through a governed change | Decision: owner, with Razorpay |
| 7 | The ₹1,00,00,000 backstop is not built; the grant is ₹5 for testing | Limits are not the agreed ones | Decide the limit; set grant and policy to match | Decision: owner, with Razorpay |
| 8 | The setup script reads the production URL from piped `vercel ls` output | The script stops at the redeploy step | Take the URL as a parameter | Engineering |
| 9 | The refusal HTTP status (the spec says 403) | Unconfirmed | Confirm with Parmana's API behaviour | Engineering |
| 10 | Node 22 fails three tests in `distrustCompromisedRoots` | CI on Node 22 would fail | Run CI on Node 24 (`package.json` requires it) | Engineering |
| 11 | No second approval test for a second caller (scenario S) | Multi-caller behaviour is unverified | Run it | Engineering |
| 12 | The MCP bridge's endpoint and the Razorpay endpoint are not behind a shared change process | Drift is possible | Keep both in the repository; review changes together | Engineering |

---

## Part 16. Mapping to the Razorpay Agent Studio spec (20 October 2026)

| Spec item | Built | Gap |
| --- | --- | --- |
| Support channel posts signed `refund.requested` (Appendix A) | No | Gap 5 |
| Agent reads `pay_` and amount; asks once if missing | Input validation in `agent.ts` rejects bad input before any call. The one-question reply to the customer is not built | Gap 5 (reply path) |
| Backstop ₹1,00,00,000, held for the team | No | Gap 7 |
| `POST /execute` with payment id, `razorpay:refund`, amount in paise; no approval, no manager flag | Yes (the runner sends no approval when none is given) | Gap 6: Parmana then refuses without an approval |
| Approved: customer hears the amount and that the refund goes to the original method | The approval result is returned; the customer message is not built | Gap 5 |
| Refused: 403 with a reason; customer hears "a member of our team will follow up" | Parmana returns a refusal record; the HTTP status is not confirmed | Gap 9 |
| Refund is a Razorpay normal refund (`POST /v1/payments/{id}/refund`) | Yes, from the Razorpay endpoint | Spec step 4a says Parmana executes it; ours is the endpoint. Agree the wording |
| Idempotency: `Idempotency-Key` for 24 hours; duplicate returns `status: duplicate` | Not for events. The receipt check prevents double refunds | Gap 5 |
| Retries for 5xx and timeouts; never for 400 or 401 | Not in the agent | Gap 5 |
| Signing: HMAC-SHA256 of `timestamp + "." + raw_body`; 5-minute window | Not for events. Parmana's own releases are Ed25519-signed and verified by the endpoint | Gap 5 |
| Testing: "3 of 3 cases that can run in a test passed" (simulated, 14 October) | Live test mode on 23 October: four cases, with a real ₹1 refund | None; update the spec's testing section |
| Go-live: live payments, first live request a ₹1 refund | Test mode only | Scenario P |

---

## Part 17. Glossary and FAQ

### 17.1 Glossary

| Term | Meaning |
| --- | --- |
| Audience | The endpoint URL a release is addressed to. The endpoint refuses a release for any other address. |
| Authority grant | A caller's permission for one capability, with limits and a validity window. |
| Business transaction | One request, with a Parmana id. Its id is the Razorpay receipt. |
| Capability | `<namespace>:<action>`, the thing being authorized. |
| Checker | The human who approves governed changes, with a step-up key. |
| Connector | A registered endpoint for a capability. |
| DPAPI | Windows Data Protection API. Encrypts a value for one user on one machine. |
| Ed25519 | The signature scheme for releases, records and step-up envelopes. |
| Maker | The human who proposes governed changes. |
| Policy in force | The version of a policy that decides requests now. |
| Release | Parmana's signed statement that an action is approved, addressed to one endpoint. |
| Step-up key | The checker's Ed25519 key, used to sign each approval. |
| Trust record | The signed record of an approved decision and its execution. |

### 17.2 FAQ

**Can the agent approve its own refund?** No. An approval is signed by a registered approval issuer, not by the agent. The agent holds only its own key, which can request but not approve.

**Can a manager's approval exceed the grant limit?** No. The grant limit is checked separately, and a refused limit stays refused (scenario D).

**Does Parmana hold the Razorpay key?** No. The endpoint holds it. Parmana holds keys for its own callers and signing keys.

**What happens if the endpoint is down?** The release is not acted on. The decision is recorded. Do not re-run the request without a fresh approval (scenario J).

**Why are there two checkers' keys?** The key (for calling the API) and the step-up key (for signing each approval) are different. A leak of one does not give the other.

**Why can't I change a policy in place?** Policies are versioned. A changed rule set is a new version. An in-force version is not edited, so records made under it stay verifiable.

**Why does every change need two people?** It is the control that stops one person from changing what another person's approval depends on.

**Where do the test records go?** To the `record-*.json` files in the folder where the command was run. They contain no raw keys. The `approval.json` file is single-use and should be deleted after the test.

**How do I know a record is genuine?** Verify it offline with Parmana's public key (`verifyExecutionTrustRecordOffline`). The runner does this automatically for approved cases: `Verifies offline : true`.

---

## Part 18. Changelog

- **1.0 (23 October 2026).** First version. Built from the Razorpay refund agent work: workstation setup; credential generation and storage; governed changes; the live key list; the connection sequence; scenarios A to U; troubleshooting; command reference; test evidence; gaps; mapping to the Razorpay spec; glossary and FAQ.
- Status markers were checked on 23 October. The sandbox could not reach the live API. Live reads must be run on an operator's machine before their markers change to ✅.

**To add an entry:** write the situation, the commands, the expected result, and the status, with the date verified. Add a line here.
