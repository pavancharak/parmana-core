# The Parmana Founder Book

How to connect any external system to Parmana: the commands, the sequence of events, how credentials are generated and stored, every scenario we have met, and what each result means.

Version 1.3, 23 October 2026. This is a living document. When a new scenario, command or failure is found, add it to the right part and add a line to the changelog in Part 49.

---

## Contents

- Part 42. Integration mechanisms
- Part 43. SDK reference
- Part 44. API reference: every route
- Part 45. Scripts reference
- Part 46. Environment variables
- Part 47. Error and status codes
- Part 48. Integration recipes
- Part 49. Changelog
- Part 50. Credential ceremony with kill-switch controls

- Part 0. How to use this book
- Part 1. What Parmana is, in plain terms
- Part 2. Concepts and roles
- Part 3. How the system is built (architecture and trust boundaries)
- Part 4. Workstation setup
- Part 5. Credentials
- Part 6. Governed changes
- Part 7. The live key list
- Part 8. Building the external endpoint
- Part 9. Putting an agent behind an MCP tool
- Part 10. The connection sequence
- Part 11. Scenarios
- Part 12. Troubleshooting
- Part 13. Command reference
- Part 14. Evidence from 23 October 2026
- Part 15. Gaps and decisions
- Part 16. Mapping to the Razorpay spec
- Part 17. Glossary and FAQ
- Part 19. What Parmana is
- Part 20. Who it is for, and the problem
- Part 21. Architecture of the whole system
- Part 22. Policies
- Part 23. Approvals and approvers
- Part 24. Records and evidence
- Part 25. Cryptography
- Part 26. Storage and data
- Part 27. Deployment and configuration
- Part 28. Security model and how it is tested
- Part 29. Operations
- Part 30. Incident response
- Part 31. Open risks and decisions for the founder
- Part 32. Compliance and regulation
- Part 33. Roadmap: designed, not built
- Part 34. SDKs, connectors and developers
- Part 35. Licensing, IP and what can be shared
- Part 36. Go-to-market material
- Part 37. Team, roles and succession
- Part 38. Decision records
- Part 39. Founder checklists
- Part 40. Glossary additions


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
- ✅ **Reject exists in the SDK and the API** for every change kind (for example `rejectPolicyChange`). ❌ **The operator script has no reject command**, so an unwanted change stays pending unless rejected through the SDK or the script is extended (Part 15, gap 1).
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
4. Record the incident in Part 49.

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
| 1 | The operator script (`governance.ts`) has no `reject` command; the SDK and API do | An unwanted change can stay pending if no one rejects it through the SDK | Add `reject` to the script, with step-up and a test | Engineering |
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

---

## Part 19. What Parmana is

Parmana is execution trust infrastructure. In the repository's own words (README): "Let AI agents act on real systems: every action needs policy approval and a person's signed approval before it runs, and leaves a signed record anyone can verify afterwards."

The product answers two questions that stop agents reaching production:

- **What is this agent allowed to do?** A rule written in a prompt is not a control. The agent, or whoever injects text into it, can ignore it. Parmana enforces the rule outside the agent.
- **Can we prove what it did?** Logs written by the system that acted are a claim, not evidence. Parmana writes a signed record that anyone can verify offline, with the public key only.

What Parmana does, in three moments:

1. **Before an action.** The request is checked against a versioned policy. It needs a signed approval from a trusted person. No approval, no action, reads included.
2. **When it runs.** The agent never holds the real credential. The gateway releases one approved action, once, through a connector.
3. **After it runs.** A signed record of what was authorized and what happened.

**What Parmana is not.** It does not decide what the agent should do. It decides, and proves, whether the agent was allowed to do it. It is not an AI model, not a guardrail on model output, and not a compliance certificate.

---

## Part 20. Who it is for, and the problem

Who it is for (README):
- Teams putting agents near money: refunds, payouts, vendor payments.
- Teams letting agents change systems of record: CRM, code repositories, internal tools.
- Security, risk and compliance teams who sign off on what an agent may do, and auditors who need evidence rather than assurances.

Where it fits: between the agent (or the platform running it) and the system it acts on. Parmana is not a replacement for identity providers, API gateways or model guardrails. The repository's "How Parmana compares" page sets out where it is weaker than those (docs/site/how-parmana-compares.mdx). Read it before a customer conversation.

What a founder should be able to say in one breath: an agent can propose; a named person approves that exact action; Parmana releases it once through a connector that holds the credential; both the approval and the outcome are signed and checkable by the customer without trusting Parmana's servers.

---

## Part 21. Architecture of the whole system

### 21.1 Packages (repository `packages/`)

| Package | Role (from its name and the current-state notes) |
| --- | --- |
| `api` | HTTP service: routes for execute, policies, grants, connectors, approval issuers, records; bootstrap of connectors and auth |
| `runtime` | The core pipeline: policy load, binding checks, rule evaluation, authorization signing |
| `policy` | Policy model, validator, the reference policies, the policy decision (pure function, no I/O) |
| `approval` | Approval verification and the approval signal checks |
| `capability-registry` | Which capability is bound to which policy; the canonical bindings |
| `execution-control` | Caller identity, external connector identity, authenticators |
| `execution-gateway` | Re-verifies the signed authorization before any connector runs; holds connector adapters; the single-use credential session |
| `execution-system` | Execution orchestration |
| `connector-sdk` | The SDK connector authors implement |
| `connector-hubspot`, `connector-github`, `connector-paytm`, `connector-slack` | Built-in connectors |
| `crypto` | Ed25519 and ML-DSA-65 signing, key providers, canonical serialization |
| `envelope-verifier` | Verifies records and authorizations, including offline |
| `replay` | Replay of a recorded decision to check it again |
| `storage` | Memory and Postgres storage; the Supabase audit sink |
| `shared` | Domain types, errors, repositories, the business validation |
| `governance-ui` | The governance interface |

Only the names above are taken from the repository. Read each package's source before describing it to a customer in detail.

### 21.2 The core pipeline (CURRENT-STATE, verified on 2026-09-08)

`RuntimeEngine.execute()`:

1. Load the policy.
2. Check it against the capability-to-policy binding map.
3. Check its `boundSignals` against the actual execution intent. A mismatch is rejected as a tamper attempt.
4. Evaluate the deterministic rules (`PolicyEngine.evaluate()`, a pure function with no I/O).
5. On approval, sign an authorization: Ed25519 by default, ML-DSA-65 under `CRYPTO_MODE=hybrid`.
6. The gateway independently re-verifies that authorization before any connector runs.
7. The connector runs with a single-use, credential-isolated session, destroyed after use.
8. A signed Execution Trust Record is produced.

### 21.3 External connectors (ADR-0013)

A customer's own endpoint can be registered without a code deploy. Parmana sends it signed releases; the endpoint verifies them (`verifyParmanaRelease`) and acts. The Razorpay refund endpoint is the worked example. Registration is governed (maker and checker, step-up signature) and cannot take a built-in namespace.

### 21.4 Built-in connectors

Registered only when their configuration is present (createConnectorRegistry.ts, read on 2026-09-27):

| Connector | Configuration needed | Capabilities |
| --- | --- | --- |
| HubSpot | `HUBSPOT_PRIVATE_APP_TOKEN` | `hubspot:deal-fetch`, `hubspot:deal-update` |
| GitHub | `GITHUB_APP_ID`, `GITHUB_INSTALLATION_ID`, `GITHUB_APP_PRIVATE_KEY` | `github:pr-fetch`, `github:pr-merge` |
| Paytm (refunds) | `PAYTM_CONNECTOR_URL`, `PAYTM_CONNECTOR_SHARED_SECRET` (a separate connector service) | `paytm:refund` |
| Slack | `SLACK_BOT_TOKEN`; a post also needs its channel in `SLACK_ALLOWED_CHANNEL_IDS` (since 2026-09-28, G-76) | `slack:post-message` |
| Test fixture | Only with `NODE_ENV=test` | Tests only |

Six capabilities are reachable on the built-in path. A new built-in connector is a code change, and it must be wired into credential isolation deliberately. The architecture does not do this for you (the limitations page, `docs/site/security/limitations.mdx`).

### 21.5 Where the trust boundaries sit

See Part 3.3 for the request path. At the system level: Parmana holds its own signing keys and its callers' key hashes; each external system holds its own credential; humans hold maker, checker and approver keys; the customer holds the verification side.

---

## Part 22. Policies

### 22.1 Anatomy of a policy

A policy is a JSON file with:
- `policyId`, `policyVersion`, `schemaVersion`, `description`;
- `signalsSchema`: the facts the rules may read, with their types;
- `boundSignals`: facts taken from the request and checked against the intent (for example `refundAmount` bound to `parameters.amount`);
- `approvalSignals`: which approval must be present for which resource and value;
- `rules`: ordered; each has an `id`, a `condition` and an `outcome` of `approve` or `reject` with a reason;
- `requireAuthorityGrant` (boolean): whether the caller must hold a grant in force;
- optional `signalSources` (facts asked from an external source) and `unboundSignalReasons` (why a signal is not bound to the request).

The last rule must match everything and reject. Rules are evaluated in order; the first match decides.

### 22.2 Versions and changes

- A policy version is immutable once in force. A change is a new version.
- A change is proposed by a maker and approved by a checker (Part 6).
- Only one pending change per policy version (Part 6.3).
- Records carry the policy name and version they were decided under, so a past decision can be checked against the rules that applied then.

### 22.3 The reference policies (repository `policies/`)

access-control, agent-vendor-payment, api-key-issuance, connector-capability, customer-refund, database-change, expense-reimbursement, github-pr-approval, github-pr-read, hubspot-deal-read, hubspot-deal-update, llm-tool-call, production-deployment, rag-document-access, slack-post-message, vendor-payment.

The Razorpay refund policy lives in `examples/razorpay-refund/policy.json`, not in `policies/` (Part 22.3 explains why).

### 22.4 Policy tooling

- Validation is performed when a policy is proposed. The validator's tests pass (16 tests, 23 October).
- `POST /policies/validate` exists in the API specification. It was not exercised in this book.
- `GET /policies/in-effect?capability=<cap>` shows what applies now.

---

## Part 23. Approvals and approvers

### 23.1 What an approval is

A signed statement by a registered approver, for one target and one resource, covering a specific amount where the policy names one. It is single-use. It expires within its lifetime. A request without one, where the policy requires one, is refused.

### 23.2 What it covers, and what it does not (limitations, verbatim summary)

- It names the action and the resource, not every parameter. A Slack approval does not fix the message text; a HubSpot approval does not fix the new stage or amount. Payment, expense and refund approvals do cover the amount.
- It trusts the approver. Parmana checks that a trusted, unrevoked key signed it. It cannot check that the person read the request.
- No request waits for an approval. A refused request stays refused; a new request needs a new approval.

### 23.3 Approver registration

- Registered as approval issuers (`GET /approval-issuers` lists them with `revoked` status).
- Adding or revoking an issuer is a governed change. The SDK has `proposeApproverChange`, `approveApproverChange` and `rejectApproverChange`; the operator script has no command for it (Part 15, gap 2).
- Approver scope is not per policy yet, and there is no quorum (G-50, Part 35).

### 23.4 Approval delivery by email

The repository has an approval-email path (Resend). On 20 October the sending domain was verified and a test email arrived. The approval email itself was not yet sent end to end, because policy governance needed a second person to approve a change. It will be verified the first time a real approval request runs. Until then, treat the email path as unverified.

---

## Part 24. Records and evidence

### 24.1 The three kinds of record

| Record | Written when | Content | Route |
| --- | --- | --- | --- |
| Execution Trust Record | An approved action runs | The decision, the policy and version, the approval, the authorization, the connector's result | `GET /trust-records/<businessTransactionId>` |
| Refusal Record | A request is refused | The rule, the reason, the authority status | `GET /refusal/<businessTransactionId>` |
| Caller audit event | Every caller request, in a hash chain | Caller, route, outcome | Audit chain; `POST /audit/verify` (route exists in the API) |

### 24.2 Verifying offline

A customer can check a record with only Parmana's public key (`GET /keys/default` or the key published with the release). The runner does this automatically for approved cases: `Verifies offline : true`. The verifier is in `envelope-verifier` and in the SDKs (`verifyExecutionTrustRecordOffline`).

Record verification in the API: `/verify`, `/verification/<id>`, `/refusal/verify`, `/execution-intents/verify`, `/audit/verify`, `/receipt`. Route names come from the OpenAPI specification; each was not exercised in this book.

### 24.3 What a record proves and does not prove

- It proves what Parmana decided, under which policy version, with which approval, and what the connector returned.
- It does not prove the connector's answer is true. The endpoint's answer is recorded as its claim. The external system's own records (for example the Razorpay dashboard) are the evidence of the external action.

### 24.4 Retention

Records live in the deployer's own database. Parmana's repositories have no delete method, and a deleted row breaks the hash chain. Retention periods and backups are the deployer's responsibility (regulation mapping, Art. 26(6)).

---

## Part 25. Cryptography

### 25.1 Algorithms

| Use | Algorithm | Notes |
| --- | --- | --- |
| Default signing | Ed25519 | `CRYPTO_MODE` default; the release, authorization and record signatures |
| Hybrid signing | Ed25519 plus ML-DSA-65 (Node's `ml-dsa-65`, named "Dilithium3" in code) | Under `CRYPTO_MODE=hybrid`. Not live in production (G-119) |
| Record hashing | SHA-256 | Record hashes and key hashes |

ML-DSA-65 signatures are randomized by design; only verification is deterministic.

### 25.2 Key custody

| Provider | Status |
| --- | --- |
| `KEY_PROVIDER=local` (`FileKeyProvider`) | Implemented. Reads PEM files from disk |
| `KEY_PROVIDER=aws-kms` (`KmsSigner`) | Implemented. The signing key is never released from KMS |
| `azure-key-vault`, `gcp-kms`, `hsm` | Declared configuration values with no implementation. Startup fails loudly rather than silently falling back |

The roadmap's first move is a real KMS/HSM provider (Part 33). The local-file path is the exposure class behind the committed-key incident (Part 31).

### 25.3 The large-message rule

AWS KMS refuses a raw Ed25519 message over 4096 bytes. A record or authorization larger than that is signed as a fixed commitment. The Parmana TypeScript and Python verifiers accept the commitment form. A verifier you write yourself must accept it, or it will reject large KMS-signed records (limitations).

### 25.4 Key rotation

`scripts/rotate-verification-key.ts` exists. Rotation is a manual operator procedure, not automated (limitations).

---

## Part 26. Storage and data

- `PARMANA_STORAGE` selects `memory` or Postgres. `postgres` and `supabase` both select the Postgres storage, which uses a raw `pg` connection pool (G-57). `sqlite` is not a valid value; the factory throws "not implemented".
- Tests always force memory storage.
- Migrations: 40 files in `supabase/migrations/` (count on 23 October). Row-level security was enabled on the rate-limit counters on 15 October, and the migration was applied to production (status 38 applied, 0 pending at that time).
- Caller audit events are hash-chained; a deleted row breaks the chain.
- Customer data: Parmana stores the decisions, the approvals and the records. It does not store the external system's credentials in the database; they live in environment secrets (Part 27).

---

## Part 27. Deployment and configuration

### 27.1 Targets

| Target | Documentation | Status |
| --- | --- | --- |
| Production (Vercel) | `docs/site/deployment/production.mdx` | In use: `parmana-api-real` |
| Self-hosted | `docs/site/self-hosted/` | Built and merged 25 September 2026 (G-56 to G-63) |
| Local | `docs/site/deployment/local.mdx` | Available |
| AWS KMS signing | `docs/site/deployment/aws-kms-signing.mdx` | Implemented |

### 27.2 Environment variables seen in production (names only)

Names from the production variable list on 23 October, and their use:

| Name | Use |
| --- | --- |
| `PARMANA_API_KEYS` | Caller key entries (hashes); replaced as a whole (Part 7) |
| `POLICY_CHANGE_CHECKERS` | Checkers allowed to approve policy changes (Part 11, scenario I) |
| `DATABASE_URL` | Postgres connection (rotated 19 October) |
| `KILL_SWITCH_ENABLED`, `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | Kill switch and its reset rule (Part 29) |
| `RATE_LIMIT_EXECUTE_PER_MINUTE`, `RATE_LIMIT_HEALTH_PER_MINUTE` | Rate limits |
| `POLICY_EXECUTION_VERIFICATION_ENFORCED`, `EXECUTION_AUTHORIZATION_TTL_SECONDS`, `TRUST_PROFILE` | Execution checks and lifetimes |
| `PRIMARY_SIGNATURE_PROVIDER`, `KEY_PROVIDER`, `CRYPTO_MODE`, `HASH_PROVIDER` | Cryptography and key custody (Part 25) |
| `PARMANA_STORAGE`, `PARMANA_KEY_DIR`, `PARMANA_POLICY_DIR`, `PARMANA_GATEWAY_KEY_ID` | Storage and file locations |
| `PAYTM_CONNECTOR_URL`, `PAYTM_CONNECTOR_TIMEOUT_MS`, `PAYTM_CONNECTOR_SHARED_SECRET` | Paytm connector |
| `APPROVAL_EMAIL_TO`, `RESEND_EMAIL_DOMAIN`, `RESEND_API_KEY` | Approval email (Part 23.4) |
| `SLACK_ALLOWED_CHANNEL_IDS` | Slack channel allowlist |
| `AWS_REGION`, `AWS_ROLE_ARN` | AWS access for KMS |
| `NODE_ENV`, `LOG_LEVEL` | Runtime |

Values are secrets or configuration; do not print them. The CLI shows them as Hidden; a Config value is readable from the dashboard (Part 31, item 4).

### 27.3 The environment file

`.env.example` in the repository lists the variables with their meaning. Read it before configuring a new environment. Use `.env` only locally.

---

## Part 28. Security model and how it is tested

### 28.1 The threat model

`THREAT-MODEL.md` gives each threat its control, the attack that tests it and the residual risk. Read it before any security claim to a customer.

### 28.2 Runnable evidence

- `npm run evaluate` runs 16 attacks (replay, forgery, acting without a signed approval, policy substitution, gateway bypass, record tampering and more) and reports each as blocked or not, tied to the commit.
- Mutation testing deliberately breaks the security code and checks the tests notice (`docs/MUTATION-TESTING.md`).
- Fuzz tests send damaged and arbitrary requests, policies and records, and require a clear refusal, never a crash.
- A standing public challenge (`SECURITY-CHALLENGE.md`) lists what counts as breaking Parmana on a copy you run yourself, and credits every confirmed break.

### 28.3 Vulnerability reports

`SECURITY.md`: report privately to founder@parmanasystems.com. Acknowledgement within 3 business days; a fix timeline or a clarifying question within 10. Ask for a reasonable window before any public disclosure.

### 28.4 Test counts (as recorded)

2,069 passing, 42 skipped, 0 failing across 246 test files (run on 25 September 2026, `CURRENT-STATE.md`). Skips are suites gated on live credentials. Counts change with every change; re-run before quoting.

---

## Part 29. Operations

### 29.1 Health

- `GET /health`: liveness. Expected `{"status":"UP"}`.
- `GET /ready`: readiness. Expected `READY` with `authDisabled` false. On 19 October, after rotation, `/ready` returned `READY` and an unauthenticated `POST /execute` returned 401.

### 29.2 Kill switch

Environment variables `KILL_SWITCH_ENABLED` and `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` control it. The reset is set to require a second operator. Use it before any incident response that stops all actions, then follow the runbook in `docs/runbooks/`.

### 29.3 Runbooks

`docs/runbooks/` holds the operator procedures. Read the index before an incident. Keep the runbook list in your own calendar; it changes with the code.

### 29.4 Rate limits

Set per minute for execute and health. Tune them per deployment (Part 27.2).

### 29.5 Logs

Structured logs are written by the service. Monitor the production logs after each deployment. Do not log keys: the connector secret redaction helpers exist for this reason.

---

## Part 30. Incident response

### 30.1 Steps

1. **Contain.** Stop the affected caller: remove its key from the live list (Part 7), or revoke its grant or connector through a governed change. Use the kill switch for a system-wide stop (Part 29.2).
2. **Preserve.** Keep the records (trust and refusal records, audit events). Do not delete anything.
3. **Find the decision.** Read the record for each suspect `businessTransactionId`.
4. **Rotate.** Every credential that was seen by anyone who should not have seen it (Part 5.7). Assume exposure from the moment a secret appeared in chat, email, a commit or a screenshot.
5. **Check the external system.** The refund, the message, the merge, the deal. Reverse only through the external system's own process.
6. **Report.** Record the incident in the book's changelog, with the date, the cause and the fix. Report vulnerabilities to affected customers as your contracts require.

### 30.2 Incidents already on record

From the repository's own notes:
- A committed key (the "committed-key incident"), which is the exposure class behind the local-key roadmap item (Part 33).
- The production Supabase database password was pasted into a chat and was rotated on 19 October. Vercel `DATABASE_URL` and the operator's local backup were updated; `/health`, `/ready` and an unauthenticated execute check were run afterwards.
- Two test credentials were pasted into a chat and a local file during an approval-email test on 20 October. The bearer keys must be rotated; the local test files were deleted.
- A policy approval was refused in production until the checker scope was fixed (G-123, 21 October).

### 30.3 Lessons, which are now rules

- No secret in chat, email, a commit or a document (Book Part 0).
- Rotate on any doubt. Rotation is cheap compared with an unexplained refund.
- A checker scope or a list update can silently block every approval. Test a governed approval after each change to those lists.

---

## Part 31. Open risks and decisions for the founder

Each item below is recorded in the repository's own notes. Owner and status are as recorded on the dates given.

| # | Risk or decision | Status (as recorded) | Owner |
| --- | --- | --- | --- |
| 1 | `RESEND_API_KEY` is stored as a Config value, which anyone with dashboard access can reveal | Open (21 October). Done when `vercel env ls production` lists it as Secret | Operator |
| 2 | Separation of duties: one operator holds both maker and checker roles | Open (19 October). Items that need two people stay open until a second person holds the checker credential | Founder |
| 3 | Approval issuers are not scoped per policy; no quorum | Open (G-50) | Engineering |
| 4 | Hybrid signing is not live in production | Open (G-119). Steps are in the repository notes; none has run in production | Engineering |
| 5 | Downgrade of schema version 2 records | Open (G-120). A cutover setting closes it for new records once every record is hybrid-signed | Engineering |
| 6 | Third-party verifiers do not read schema version 3 | Open (G-121). Schema version 3 stays off | Engineering |
| 7 | Approval email not verified end to end | Deferred by decision (20 October); needs a second checker | Founder |
| 8 | Release tags for SDK versions 1.2.0 to 1.6.0 do not exist in this repository | Open (22 October). Their tags need the earlier repository | Engineering |
| 9 | CAGE integration design (ADR-0018) was never merged and its branches were deleted | Not built | Founder decides whether to revive |
| 10 | Two test credentials pasted in chat (20 October) | Rotation required; check it is done | Operator |
| 11 | No KMS/HSM for Azure, GCP or on-premise HSM | Designed, not built (Part 33) | Engineering |
| 12 | The customer's approver is not limited to particular actions | Limitation (regulation mapping, Art. 26) | Product |

---

## Part 32. Compliance and regulation

Parmana is not legal advice, and it does not make a system compliant. It is a technical measure for oversight and record keeping for the actions that go through it. The full mapping is `docs/site/security/regulation-mapping.mdx`. The founder should read it before any regulated customer conversation.

### 32.1 EU AI Act

| Provision | Rating | What Parmana provides |
| --- | --- | --- |
| Art. 14(1) human oversight | Supports | A person is placed before every action: a signed approval for the action and resource, and the amount where the policy names one |
| Art. 14(4)(a) monitoring | Partly | Signed records of every action and refusal; approvers can be told when a request waits |
| Art. 14(4)(d) disregard or override | Supports | An action not signed is refused, and the refusal is recorded |
| Art. 14(4)(e) intervene or stop | Partly | Remove an agent's key, revoke an approver or connector, approve a refusing policy. An action already released is not recalled |
| Art. 12 record keeping | Supports | Signed execution and refusal records, and chained audit events, verifiable offline |
| Art. 26(1), (2) competence and authority | Partly | Approvers are registered and recorded; choosing and training them is yours |
| Art. 26(6) six-month logs | Partly | Records are kept in your database; retention is yours |

The high-risk obligations apply from 2 December 2027 for Annex III systems and 2 August 2028 for Annex I systems, as stated in the mapping. Check the current text with counsel.

### 32.2 NIST AI RMF, ISO/IEC 42001 and RBI

The mapping covers NIST AI RMF subcategories (GOVERN 3.2, MAP 3.5, MANAGE 2.4, MEASURE 2.7), ISO/IEC 42001, and RBI IT and AI guidance for Indian banks and NBFCs. Read the mapping for the exact ratings and evidence references.

### 32.3 What Parmana does not claim

Guaranteed compliance (SOC 2, GDPR, ISO 27001, a regulator's approval); absolute prevention of unauthorized execution; tamper-proof operation in every environment; "non-bypassable" as a system-wide claim. The gateway enforces nothing at the network level.

### 32.4 OWASP

The OWASP Top 10 for LLM Applications and the OWASP Top 10 for Agentic Applications (2026) are mapped to Parmana's controls: `docs/site/security/owasp-mapping` on the public documentation.

---

## Part 33. Roadmap: designed, not built

The roadmap (`docs/site/roadmap.mdx`) is explicit that every item is not shipped by default.

- **Move 1: KMS/HSM key custody (roughly one to two weeks once started).** Implement a real `KeyProvider` for at least one of AWS KMS, Azure Key Vault, GCP KMS or HSM. Needs a real cloud account to prove it works. Requires resolving the algorithm question first (what the provider signs).
- **Move 2: making authorization unavoidable, not just verifiable.** Partly designed. The gateway is wired unconditionally in the default server and registered connectors use credential isolation; the calling AI does not hold the execution credential for a registered connector. The broader claim is not yet made.
- Hybrid signing live in production (G-119); schema version cutover (G-120); third-party verifier support for version 3 (G-121).
- Per-policy approver scope and quorum (G-50).

The founder should treat the roadmap as a list of decisions, not promises. Each item names its evidence bar.

---

## Part 34. SDKs, connectors and developers

### 34.1 Packages published

| Package | Language | Version (as recorded) |
| --- | --- | --- |
| `@parmana/sdk` | TypeScript | 1.6.1 |
| `parmana` | Python | 1.6.1 |
| `@parmana/connector-sdk` | TypeScript | 0.3.1 |
| `parmana-connector-sdk` | Python | 0.2.1 |

The release `sdk-v1.6.1` is on GitHub with the packages, SBOMs and provenance attached (22 October). Private repository links were removed from the package metadata of all four packages.

### 34.2 Using the SDK

The TypeScript SDK exposes `ParmanaClient` (`execute`, `policyInEffect`, `caller`, `refusalRecord`, `publicKey`), `createBusinessTransaction`, `signApproval`, `verifyExecutionTrustRecordOffline`, `verifyParmanaRelease`. See `docs/site/sdks/typescript.mdx` and `docs/site/sdks/python.mdx`. The API coverage page (`docs/site/sdks/api-coverage.mdx`) lists which endpoints the SDKs cover. Read it before promising a customer an endpoint in an SDK.

### 34.3 Writing a connector

Two paths:
- **External (no deploy):** build an endpoint, register it through governance (Part 6). Preferred for customers' own systems.
- **Built-in (code):** implement the connector SDK, wire it into credential isolation, and add tests. `docs/connectors/BUILDING_A_CONNECTOR.md` is the guide.

### 34.4 Release process

`RELEASING.md` in the Python SDK and the repository release notes describe the procedure. Releases carry SBOMs and provenance. Do not tag a release from a repository that does not contain its commits (open item 8).

---

## Part 35. Licensing, IP and what can be shared

- The repository is **proprietary**, copyright Parmana Systems Private Limited. It is source-available for evaluation only; no licence is granted to use, copy, modify or distribute it without a separate written agreement.
- The **client SDKs and connector SDKs are Apache 2.0** (the exception stated in the README).
- The `NOTICE` file lists third-party attributions.

What this means for the founder: the SDKs can be given to customers and partners under Apache 2.0; the platform cannot be shared without an agreement; the security evidence (the evaluation suite, the threat model) is public and may be shared.

---

## Part 36. Go-to-market material

Documents in the repository and public docs that support sales and diligence:
- The technical paper (`docs/paper/parmana-paper.pdf`): design, threat model, evaluation and limitations.
- The talk slides (`docs/paper/parmana-talk-slides.pdf`) and the demo video scripts.
- "How Parmana compares" (honest comparison with IAM, API gateways and guardrails, including where Parmana is weaker).
- The regulation mapping and the OWASP mapping.
- The handbook (`docs/handbook`, `parmana-handbook.pdf`) and the build-with-Parmana book (`build-with-parmana.pdf`).

Commercial terms are not in this repository. The Razorpay spec says "commercials follow in a separate note". Keep pricing out of technical documents.

---

## Part 37. Team, roles and succession

- **Operator:** runs deployments and governance commands. Today one person holds this role.
- **Maker and checker:** must be two different people with different credentials (Part 2.2). Today one operator holds both, which is open risk 2.
- **Approver:** a manager who signs approvals for specific payments and amounts.
- **Security reports:** founder@parmanasystems.com (`SECURITY.md`).

Succession: before anyone leaves, rotate the credentials they held (Part 5.7), revoke their grants and approvals, and update the key list (Part 7). Record the handover in this book's changelog.

---

## Part 38. Decision records

- `docs/adr/`: architecture decision records (for example ADR-0013, external connectors; ADR-0018, the CAGE design that was not merged).
- `docs/rfcs/`: proposals.
- `docs/CLAIMS.md`: each claim, its scope and evidence.
- `docs/VERIFICATION-GAPS.md`: each known gap (G-numbers used throughout this book).
- `docs/REMAINING-WORK.md`: the dated list of what is left.

Read these before committing to a customer on any capability.

---

## Part 39. Founder checklists

### 39.1 Before a customer demo

- [ ] Run the four demo cases against your own test environment; keep the records.
- [ ] Check `GET /health` and `/ready`.
- [ ] Check the policy in force for the capability you will show.
- [ ] Read the limitations (`docs/site/security/limitations.mdx`) so you do not overclaim.
- [ ] Remove any approval files and test records from the demo folder.

### 39.2 Before going live with a customer

- [ ] Agree the trigger, the approval model, the limit and the refusal status code in writing.
- [ ] Two people hold the maker and checker roles (open risk 2).
- [ ] Approval email verified end to end (open risk 7).
- [ ] Every secret is a Secret, not a Config value (open risk 1).
- [ ] Records are kept in the customer's agreed retention.
- [ ] Incident contacts and the kill switch procedure are written down.

### 39.3 Monthly

- [ ] Re-run the test suite and the evaluation (`npm run evaluate`); update the test counts you quote.
- [ ] Review `parmana-entries` for callers that should no longer exist.
- [ ] Review grants: `validUntil`, limits, and any grant that is still `active` past its end.
- [ ] Review the pending changes list; approve, or leave with a note.
- [ ] Review `docs/REMAINING-WORK.md` for changes.

### 39.4 After any credential exposure

- [ ] Section 30.1, steps 1 to 6.
- [ ] Record the incident in the changelog.

---

## Part 40. Glossary additions

| Term | Meaning |
| --- | --- |
| Checker scope | The list of checkers allowed to approve policy changes (`POLICY_CHANGE_CHECKERS`) |
| Commitment (KMS) | The fixed form KMS signs for messages over 4096 bytes (Part 25.3) |
| Credential isolation | The gateway holds the connector credential only inside its own boundary; the caller never holds it |
| Kill switch | A system-wide stop of actions, with a reset rule that can require a second operator |
| Refusal record | The signed record of a refused request |
| Trust profile | A configured set of execution rules (`TRUST_PROFILE`) |

---

---

## Part 42. Integration mechanisms

Parmana can be connected to a system in six ways. Choose one per flow. Each has its own status.

### 42.1 Overview

| # | Mechanism | Who initiates | What crosses the boundary | Status |
| --- | --- | --- | --- | --- |
| A | Agent calls Parmana through an SDK | The agent's code | A business transaction; a trust record back | ✅ Used by the refund runner (TypeScript SDK) |
| B | MCP tool bridge | An agent platform calling a tool | The tool call; a bridge call to Parmana | ✅ Deployed; ❌ platform registration pending |
| C | External connector (ADR-0013) | Parmana, after approval | A signed release to your endpoint | ✅ Live for `razorpay:refund` |
| D | Built-in connector (code) | Parmana, after approval | A call from Parmana's own connector to the external system | ✅ Four connectors, registered by configuration |
| E | Business signal source | Parmana asks the source for a fact | A signed answer from the source | ⚠️ Built and live-checked earlier; not re-run in this book |
| F | Governance API | The maker, the checker, the operator | Proposals and approvals | ✅ Used on 23 October for all change kinds that were run |
| G | Offline verification by the customer | The customer | A record, checked with the public key | ✅ Verified in every approved run |
| H | Signed event receiver | An external system posts events | A signed `refund.requested`-style event | ❌ Not built (scenario G) |

### 42.2 Mechanism A: an agent calls Parmana through an SDK

Flow:
1. Create a client with the endpoint, the caller's API key and a timeout.
2. Read the caller's identity (`caller()`) and the policy in force for the capability (`policyInEffect(capability)`).
3. Build the business transaction: principal, purpose, action (the capability), target, parameters, the policy reference, and the signals the policy declares.
4. Call `execute(transaction)`.
5. On success, receive the Execution Trust Record. On refusal, the SDK raises `ExecutionRejectedError`; read the refusal record with `refusalRecord(businessTransactionId)`.
6. Verify the record offline with the public key (Part 42.8).

TypeScript example, taken from the refund runner (`examples/razorpay-refund-agent/agent.ts`, abbreviated):

```ts
const client = new ParmanaClient({ endpoint, apiKey, timeout: 120_000 });
const me = await client.caller();
const inEffect = await client.policyInEffect("razorpay:refund");
const tx = createBusinessTransaction({
  principalId: me.callerId,
  purpose: "Razorpay refund",
  action: "razorpay:refund",
  target: paymentId,
  parameters: { amount: amountPaise },
  policy: inEffect.policy,
  signals: { refundAmount: amountPaise, managerApproved: approval !== undefined },
});
try {
  const record = await client.execute(tx);
} catch (error) {
  if (error instanceof ExecutionRejectedError) {
    const refusal = await client.refusalRecord(tx.businessTransactionId);
  }
}
```

Points to remember:
- The `signals` object must include every fact the policy declares, and every bound signal must match the intent. A mismatch is rejected as a tamper attempt.
- `businessTransactionId` is an idempotency key. Reuse it only for the same attempt.
- A timeout is not a failure report. Read the trust record before retrying (scenario J).

### 42.3 Mechanism B: MCP tool bridge

Use when an agent platform calls tools over MCP. The bridge is `examples/razorpay-agent-studio/mcp.ts`, deployed as its own Vercel project.

- The platform sends `tools/call` with `propose_refund`. The bridge checks the bearer token, validates the input, then calls the refund agent.
- The bridge holds Parmana's agent key and no external credential.
- Register the URL and token with the platform (❌ pending for Razorpay Agent Studio; Part 9.4).

### 42.4 Mechanism C: external connector (ADR-0013)

Use for a system you own, or one whose team will build an endpoint. No code change in Parmana.

Contract the endpoint must meet:
- Accept `POST` with a JSON body `{ release, signature }`.
- Verify with `verifyParmanaRelease(body, { publicKeys, audience })`. The audience must equal the endpoint's own registered URL.
- Check the release is not expired (verification does this).
- Check `release.capability` is the one this endpoint serves. Refuse others with 401.
- Act once. Use `release.businessTransactionId` as the external system's idempotency key (for Razorpay, the refund receipt).
- Answer with the outcome in the body. A failure is reported as a failure, not a success status.

Registration: a maker proposes the connector (endpoint URL, policy name, allowed parameters); a checker approves (Part 6).

Live status: the Razorpay refund endpoint (`parmana-razorpay-demo`) answers the contract on 23 October, and its approved run returned a processed refund.

### 42.5 Mechanism D: built-in connectors

The server registers a built-in connector only when its configuration is present (`packages/api/src/bootstrap/createConnectorRegistry.ts`). The four built-ins and their configuration are in Part 21.4.

- HubSpot, GitHub, Paytm and Slack hold their credentials inside credential isolation: the caller never sees them, and the gateway opens a single-use session.
- Paytm's refunds go through a separate connector service (`PAYTM_CONNECTOR_URL`), which holds the merchant credential.
- The test fixture connector runs only under `NODE_ENV=test`.

Adding a new built-in connector is a code change: implement the connector SDK, wire it into the registry and credential isolation, and add tests. The connector SDK package contains folders for Oracle, Salesforce, SAP and Workday, and `packages/api/src/bootstrap/ConnectorCatalog.ts` names connectors in its catalogue. A search of the registry on 23 October found no registration for those four. Treat them as SDK material, not deployed connectors, until registration is proven.

### 42.6 Mechanism E: business signal sources

A policy can ask an external source for a fact instead of trusting the caller. Example in the repository: `livecheck-signal`, whose `signalSources` entry names a claim (`invoice.paid`), a subject (`parameters.invoiceId`) and a maximum age (`maxAgeSeconds`).

- The source is proposed with `propose-source` (name, endpoint URL, public key file, key id) and approved as a governed change.
- The source answers signed. Parmana verifies the signature with the registered key.
- The caller's own value for that fact is never used.

Status: built and live-checked during earlier work; the source and the policy were later revoked and are not in force. Re-run before relying on it.

### 42.7 Mechanism F: governance API

Every governed change is available through three routes: the operator script (`examples/live-checks/governance.ts`), the TypeScript SDK (`propose*`, `approve*`, `reject*`), and the Python SDK (`propose_policy_change`, `approve_policy_change`, `reject_policy_change`, and the matching functions for each change kind).

| Change kind | SDK propose | SDK approve | SDK reject | Operator script |
| --- | --- | --- | --- | --- |
| Policy | `proposePolicyChange` | `approvePolicyChange` | `rejectPolicyChange` | propose-policy, approve |
| Approver | `proposeApproverChange` | `approveApproverChange` | `rejectApproverChange` | ❌ not in script |
| External connector | `proposeExternalConnectorChange` | `approveExternalConnectorChange` | `rejectExternalConnectorChange` | propose-connector, propose-revoke, approve |
| Signal source | `proposeBusinessSignalSourceChange` | `approveBusinessSignalSourceChange` | `rejectBusinessSignalSourceChange` | propose-source, propose-revoke, approve |
| Authority grant | `proposeAuthorityGrantChange` | `approveAuthorityGrantChange` | `rejectAuthorityGrantChange` | propose-grant, propose-revoke, approve |

Correction to earlier chapters: the operator script has no reject command, but the SDK and the API do. Reject through the SDK, or add the command to the script (gap 1).

Every approve and reject needs a checker with a step-up signature. A caller that is not a verified human is refused (scenario L).

### 42.8 Mechanism G: offline verification by the customer

A customer can check any record without trusting Parmana's servers.

- Obtain Parmana's public key (`GET /keys/default`, or the published key for the release).
- Verify with `verifyExecutionTrustRecordOffline(record, { default: pem })` in the TypeScript SDK, or with the verifier in `envelope-verifier`, or with the Python SDK's verification functions.
- Check the result's `valid` flag and its `errors` list. The refund runner prints `Verifies offline : true` for approved cases.
- Records over 4096 bytes may be signed as a commitment (Part 25.3). A verifier you write must handle it.

Status: ✅ verified in every approved run on 23 October.

### 42.9 Mechanism H: signed event receiver (not built)

The Razorpay spec describes a support channel that posts signed `refund.requested` events. Nothing in the repository receives them. Scenario G lists what must be built.

### 42.10 Choosing a mechanism

| If the system is | Use | Why |
| --- | --- | --- |
| An agent you write | A (SDK) | Direct, typed, and you control the signals |
| An agent platform that calls tools | B (MCP bridge) | The platform owns the agent; you own the bridge |
| A system you run that acts on requests | C (external connector) | No code change in Parmana; you verify releases |
| A standard integration Parmana already supports | D (built-in) | Already tested for its configuration |
| A source of facts for a policy | E (signal source) | The policy trusts the source's signed answer, not the caller |
| Your own team making changes | F (governance) | Maker and checker, with step-up |
| A customer who needs proof | G (offline verification) | Independent of Parmana's servers |
| A system that pushes events at you | H (event receiver) | Not built |

---

## Part 43. SDK reference

### 43.1 Packages

| Package | Language | Version | Purpose |
| --- | --- | --- | --- |
| `@parmana/sdk` | TypeScript | 1.6.1 | Client, builders, signing for approvals, offline verification, release verification |
| `parmana` | Python | 1.6.1 | Client, models, approval signing, offline verification |
| `@parmana/connector-sdk` | TypeScript | 0.3.1 | Building built-in connectors; capability types; mock connector; credential provider |
| `parmana-connector-sdk` | Python | 0.2.1 | Connector types and helpers in Python |

The release `sdk-v1.6.1` is on GitHub with packages, SBOMs and provenance (22 October).

### 43.2 TypeScript client

Construction (from `ParmanaClient`): `endpoint`, `apiKey`, `timeout` (milliseconds). The client throws `ConfigurationError` if the endpoint is missing.

Methods (public, as in `typescript/src/client/ParmanaClient.ts`):

- `endpoint`
- `health`
- `version`
- `execute`
- `verify`
- `getLatestVerification`
- `replay`
- `receipt`
- `createTransaction`
- `transaction`
- `transactions`
- `latestReceipt`
- `trustRecord`
- `trustRecords`
- `caller`
- `publicKey`
- `policyInEffect`
- `validatePolicy`
- `refusalRecord`
- `verifyRefusalRecord`
- `executionIntent`
- `verifyExecutionIntent`
- `unfinalizedExecutionIntents`
- `finalizeExecutionIntent`
- `resolveExecutionIntent`
- `verifyAuditEvent`
- `proposePolicyChange`
- `policyChanges`
- `approvePolicyChange`
- `rejectPolicyChange`
- `approvers`
- `proposeApproverChange`
- `approverChanges`
- `approveApproverChange`
- `rejectApproverChange`
- `externalConnectors`
- `proposeExternalConnectorChange`
- `externalConnectorChanges`
- `approveExternalConnectorChange`
- `rejectExternalConnectorChange`
- `businessSignalSources`
- `proposeBusinessSignalSourceChange`
- `businessSignalSourceChanges`
- `approveBusinessSignalSourceChange`
- `rejectBusinessSignalSourceChange`
- `authorityGrants`
- `proposeAuthorityGrantChange`
- `authorityGrantChanges`
- `approveAuthorityGrantChange`
- `rejectAuthorityGrantChange`

Errors: every SDK error extends `ParmanaError` and carries a code.

| Code | Meaning in practice |
| --- | --- |
| `CONFIGURATION_ERROR` | The client or server is misconfigured (for example a missing endpoint). Fix configuration; retrying does not help. |
| `VALIDATION_ERROR` | The request is malformed or fails validation. Fix the request before retrying. |
| `AUTHENTICATION_ERROR` | The credential is missing or not accepted (HTTP 401). Check the key (scenario K). |
| `AUTHORIZATION_ERROR` | The caller is authenticated but not allowed this action (HTTP 403). |
| `NOT_FOUND_ERROR` | The record or route does not exist, or is not visible to this caller (cross-caller reads return 404). |
| `CONFLICT_ERROR` | The change conflicts with existing state, for example a pending change or an active connector. |
| `EXECUTION_REJECTED` | Parmana refused the action. The SDK raises ExecutionRejectedError; the refusal record explains the rule. |
| `VERIFICATION_ERROR` | A record or signature did not verify. |
| `REPLAY_ERROR` | A replay was detected or a replayed record is not acceptable. |
| `NETWORK_ERROR` | The request did not reach the server. Retry with backoff. |
| `TIMEOUT_ERROR` | The request timed out. Do not assume failure or success: read the trust record first (scenario J). |
| `RATE_LIMIT_ERROR` | Too many requests in the window. Back off and retry later. |
| `INTERNAL_SERVER_ERROR` | The server failed. Check logs and /ready; retry only idempotent requests. |

Refusals are raised as `ExecutionRejectedError` (code `EXECUTION_REJECTED`).

### 43.3 Python client

Construction (from `python/parmana/client.py`): `endpoint` (required), `api_key` (optional), `timeout`, `max_retries`, `backoff_factor`, `debug`. Missing endpoint raises `ConfigurationError`.

Methods:

- `endpoint`
- `version`
- `health`
- `execute`
- `verify`
- `get_latest_verification`
- `create_transaction`
- `transaction`
- `trust_record`
- `policy_in_effect`
- `validate_policy`
- `refusal_record`
- `verify_refusal_record`
- `execution_intent`
- `verify_execution_intent`
- `unfinalized_execution_intents`
- `finalize_execution_intent`
- `resolve_execution_intent`
- `verify_audit_event`
- `latest_receipt`
- `caller`
- `public_key`
- `propose_policy_change`
- `policy_changes`
- `approve_policy_change`
- `reject_policy_change`
- `list_approvers`
- `approver_changes`
- `approve_approver_change`
- `reject_approver_change`
- `list_external_connectors`
- `external_connector_changes`
- `approve_external_connector_change`
- `reject_external_connector_change`
- `list_business_signal_sources`
- `business_signal_source_changes`
- `approve_business_signal_source_change`
- `reject_business_signal_source_change`
- `list_authority_grants`
- `authority_grant_changes`
- `approve_authority_grant_change`
- `reject_authority_grant_change`

### 43.4 Which SDK to use

- A TypeScript or Node service: the TypeScript SDK. The refund runner is a worked example.
- A Python service: the Python SDK. It covers the same areas; check the API coverage page (`docs/site/sdks/api-coverage.mdx`) for the exact set before promising an endpoint.
- Building a built-in connector: the connector SDK (TypeScript or Python). Read `docs/connectors/BUILDING_A_CONNECTOR.md` first.

### 43.5 Upgrading an SDK

1. Read the changelog for the new version (`docs/site/changelog.mdx`).
2. Update the dependency and run the tests of the service that uses it.
3. Check the API coverage page for any endpoint your service relies on.
4. Verify one approved and one refused case end to end before deploying.

⚠️ Procedure drawn from the repository's release and SDK documents; not run as a sequence in this book.

---

## Part 44. API reference: every route

The API has the operations below, read from the OpenAPI specification (`openapi/openapi.yaml`). Each route's request and response schema is in the specification and in the public reference (`docs/site/api-reference`).

| Method | Path | Operation ID | Summary |
| --- | --- | --- | --- |
| GET | `/` | `getRoot` | Root |
| GET | `/health` | `getHealth` | Health check |
| GET | `/ready` | `getReady` | Readiness check |
| GET | `/openapi.yaml` | `getOpenApiSpec` | Get the OpenAPI spec |
| GET | `/openapi.json` | `getOpenApiSpecJson` | Get the OpenAPI spec, as JSON |
| GET | `/api-manifest.json` | `getApiManifest` | Machine-readable SDK and discovery manifest |
| GET | `/version` | `getVersion` | Service version |
| GET | `/keys/{keyId}` | `getKey` | Fetch a public signing key for independent, offline verification |
| GET | `/.well-known/jwks.json` | `getJwks` | List every public signing key this deployment can currently produce |
| GET | `/callers/me` | `getCallerMe` | Get the authenticated caller's identity and resolved scope |
| POST | `/execute` | `executeTransaction` | Execute a Business Transaction |
| GET | `/transactions` | `listTransactions` | List Business Transactions |
| POST | `/transactions` | `createTransaction` | Create (execute) a Business Transaction |
| GET | `/transactions/{businessTransactionId}` | `getTransaction` | Get Business Transaction |
| POST | `/verify` | `verifyTransaction` | Verify an Execution Trust Record |
| GET | `/verification/{businessTransactionId}` | `getLatestVerification` | Get latest Verification |
| POST | `/refusal/verify` | `verifyRefusalRecord` | Verify a Refusal Record's signature |
| GET | `/parmana-handbook.pdf` | `getHandbookPdf` | Download the Parmana Handbook (PDF) |
| GET | `/handbook/download-leads` | `getHandbookDownloadLead` | Capture an email address, then redirect straight to the handbook PDF |
| POST | `/handbook/download-leads` | `createHandbookDownloadLead` | Capture an email address before unlocking the handbook PDF download |
| GET | `/refusal/{businessTransactionId}` | `getRefusalRecord` | Get a Refusal Record by transaction ID |
| POST | `/execution-intents/verify` | `verifyExecutionIntent` | Verify an Execution Intent's signature |
| GET | `/execution-intents/unfinalized` | `listUnfinalizedExecutionIntents` | List Execution Intents that never reached a signed Trust Record |
| GET | `/execution-intents/{businessTransactionId}` | `getExecutionIntent` | Get an Execution Intent and its status |
| POST | `/execution-intents/{businessTransactionId}/finalize` | `finalizeExecutionIntent` | Rebuild the signed Trust Record for a released action |
| POST | `/execution-intents/{businessTransactionId}/resolve` | `resolveExecutionIntent` | Close an intent you reconciled by hand |
| POST | `/audit/verify` | `verifyAuditEvent` | Verify a signed caller-authentication audit event |
| POST | `/receipt` | `generateReceipt` | Generate a Receipt |
| GET | `/receipt/latest/{businessTransactionId}` | `getLatestReceipt` | Get latest Receipt |
| GET | `/trust-records` | `listTrustRecords` | Bulk-export Execution Trust Records (compliance/audit) |
| GET | `/trust-records/{businessTransactionId}` | `getTrustRecord` | Get Execution Trust Record |
| POST | `/replay` | `replayTransaction` | Replay an Execution Trust Record |
| GET | `/policies/in-effect` | `getPolicyInEffect` | Get the policy a capability's requests must declare right now |
| POST | `/policies/validate` | `validatePolicy` | Validate that a Policy exists and is readable |
| POST | `/policies/{name}/{version}/pending-changes` | `proposePolicyChange` | Propose a policy change (maker) |
| GET | `/policies/pending-changes` | `listPendingPolicyChanges` | List pending policy changes (maker-checker) |
| POST | `/kill-switch/trip` | `tripKillSwitch` | Trip the operator kill switch |
| POST | `/kill-switch/reset` | `resetKillSwitch` | Reset the operator kill switch |
| GET | `/kill-switch/status` | `getKillSwitchStatus` | Read the kill switch state |
| POST | `/kill-switch/probes` | `recordKillSwitchProbe` | Record a kill switch probe result |
| POST | `/policies/pending-changes/{id}/approve` | `approvePolicyChange` | Approve a pending policy change (checker) |
| POST | `/policies/pending-changes/{id}/reject` | `rejectPolicyChange` | Reject a pending policy change (checker) |
| GET | `/approval-issuers` | `listApprovalIssuers` | List approver keys |
| GET | `/approval-issuers/changes` | `listApprovalIssuerChanges` | List approver changes |
| POST | `/approval-issuers/changes` | `proposeApprovalIssuerChange` | Propose adding or revoking an approver key |
| POST | `/approval-issuers/changes/{id}/approve` | `approveApprovalIssuerChange` | Approve an approver change |
| POST | `/approval-issuers/changes/{id}/reject` | `rejectApprovalIssuerChange` | Reject an approver change |
| GET | `/external-connectors` | `listExternalConnectors` | List external connectors |
| GET | `/external-connectors/changes` | `listExternalConnectorChanges` | List external connector changes |
| POST | `/external-connectors/changes` | `proposeExternalConnectorChange` | Propose registering or revoking an external connector |
| POST | `/external-connectors/changes/{id}/approve` | `approveExternalConnectorChange` | Approve an external connector change |
| POST | `/external-connectors/changes/{id}/reject` | `rejectExternalConnectorChange` | Reject an external connector change |
| GET | `/business-signal-sources` | `listBusinessSignalSources` | List business signal sources |
| GET | `/business-signal-sources/changes` | `listBusinessSignalSourceChanges` | List business signal source changes |
| POST | `/business-signal-sources/changes` | `proposeBusinessSignalSourceChange` | Propose registering or revoking a business signal source |
| POST | `/business-signal-sources/changes/{id}/approve` | `approveBusinessSignalSourceChange` | Approve a business signal source change |
| POST | `/business-signal-sources/changes/{id}/reject` | `rejectBusinessSignalSourceChange` | Reject a business signal source change |
| GET | `/authority-grants` | `listAuthorityGrants` | List authority grants |
| GET | `/authority-grants/changes` | `listAuthorityGrantChanges` | List authority grant changes |
| POST | `/authority-grants/changes` | `proposeAuthorityGrantChange` | Propose granting or revoking an agent's authority |
| POST | `/authority-grants/changes/{id}/approve` | `approveAuthorityGrantChange` | Approve an authority grant change |
| POST | `/authority-grants/changes/{id}/reject` | `rejectAuthorityGrantChange` | Reject an authority grant change |
| POST | `/sandbox/approvals` | `createSandboxApproval` | Get a demo approval (sandbox only) |

Notes:
- Governance reads and writes need the caller's key to be provisioned for that kind of work. Governance routes refuse keys not provisioned as a human (limitations).
- Cross-caller reads of transactions and records return 404, not 403.
- Public routes (`/`, `/health`, `/ready`, `/version`, `/keys/...`, `/.well-known/jwks.json`, `/openapi.yaml`) need no key.

---

## Part 45. Scripts reference

Every npm script in `package.json`:

| Script | Command |
| --- | --- |
| `prepare` | `git config core.hooksPath scripts/git-hooks \|\| true` |
| `build` | `npm run openapi && node node_modules/typescript7/bin/tsc -b && npm run build --workspace=typescript` |
| `build:verbose` | `node node_modules/typescript7/bin/tsc -b --verbose` |
| `build:force` | `node node_modules/typescript7/bin/tsc -b --force --verbose` |
| `clean` | `node node_modules/typescript7/bin/tsc -b --clean` |
| `openapi` | `npm run lint:openapi && npx redocly bundle openapi/openapi.yaml -o openapi/openapi.bundled.yaml --ext yaml && npx tsx scripts/strip-openapi-schema-ids.ts && npx` |
| `bundle:openapi` | `redocly bundle openapi/openapi.yaml -o openapi/openapi.bundled.yaml --ext yaml && tsx scripts/strip-openapi-schema-ids.ts && tsx scripts/add-openapi-code-sample` |
| `lint:openapi` | `redocly lint openapi/openapi.yaml` |
| `rebuild` | `npm run clean && npm run build:force` |
| `dev` | `tsx packages/api/src/server.ts` |
| `generate:gateway-keys` | `tsx scripts/generate-keypair.ts --algorithm ed25519 --key-id gateway` |
| `generate:hybrid-secondary-key` | `tsx scripts/generate-keypair.ts --algorithm dilithium3 --key-id default-secondary` |
| `generate:api-key` | `tsx scripts/generate-api-key.ts` |
| `generate:migration-bundle` | `tsx scripts/generate-migration-bundle.ts` |
| `db:migrate` | `tsx scripts/migrate-database.ts` |
| `verify:kms` | `tsx scripts/verify-kms-signing.ts` |
| `generate:llms-txt` | `tsx scripts/generate-llms-txt.ts` |
| `generate:postman` | `tsx scripts/generate-postman-collection.ts` |
| `check:sdk-docs` | `tsx scripts/check-sdk-docs.ts` |
| `generate:endpoint-pages` | `tsx scripts/generate-endpoint-pages.ts` |
| `generate:build-book-reference` | `tsx scripts/generate-build-book-reference.ts` |
| `generate:build-book-pdf` | `tsx scripts/generate-build-book-pdf.ts` |
| `generate:typescript-sdk-reference` | `tsx scripts/generate-typescript-sdk-reference.ts` |
| `generate:python-sdk-reference` | `tsx scripts/generate-python-sdk-reference.ts` |
| `rotate:verification-key` | `tsx scripts/rotate-verification-key.ts` |
| `typecheck` | `node node_modules/typescript7/bin/tsc --noEmit -p tsconfig.json` |
| `lint` | `eslint . --ext .ts` |
| `lint:fix` | `eslint . --ext .ts --fix` |
| `format` | `prettier --write .` |
| `format:check` | `prettier --check .` |
| `pretest` | `tsx scripts/check-dist-fresh.ts` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `coverage` | `vitest run --coverage` |
| `examples` | `tsx scripts/run-examples.ts` |
| `preevaluate` | `tsx scripts/check-dist-fresh.ts` |
| `evaluate` | `tsx scripts/evaluate.ts` |
| `evaluate:agentrust-refund` | `tsx scripts/evaluate-agentrust-refund.ts` |
| `mutation` | `tsx scripts/mutation.ts` |
| `policy-log:verify` | `tsx scripts/policy-approval-log.ts verify` |
| `policy-log:export` | `tsx scripts/policy-approval-log.ts export` |
| `policy-log:check-db` | `tsx scripts/policy-approval-log.ts check-db` |
| `loadtest` | `tsx scripts/load-test.ts` |
| `generate:python-models` | `tsx python/scripts/generate_models.ts` |
| `check:python-models` | `tsx python/scripts/generate_models.ts --check` |
| `check` | `npm run typecheck && npm run lint && npm run format:check && npm run check:python-models && npm run test && npm run build` |
| `preflight` | `npm run check && npm run examples` |

Commands used in this book that are not npm scripts are in Part 13.

---

## Part 46. Environment variables

Every variable named in `.env.example`. Variables marked "(see .env.example)" have no inline comment there; read the file before setting them.

| Variable | Meaning (from `.env.example`; commented-out entries marked) |
| --- | --- |
| `NODE_ENV` | Runtime environment. Not validated against a fixed list in code (no parse function) — the only branch that actually changes behavior anywhere in this codebase is `NODE_ENV === "test"` vs everything else; conventionally development \| test \| production. Optional, defaults to "development". |
| `PARMANA_POLICY_DIR` | Directory containing policy files (policies/<name>/<version>/policy.json). Required — the process refuses to start without it. |
| `PARMANA_KEY_DIR` | Directory containing signing key material (default.private.pem, default.public.pem, gateway.private.pem, gateway.public.pem, ...). Required whenever NODE_ENV != test — the process refuses to start without it. |
| `POLICY_EXECUTION_VERIFICATION_ENFORCED` | Execution time policy governance verification (approval record required for every policy that authorizes or releases an execution). ENFORCED BY DEFAULT. Governance is skipped only when BOTH NODE_ENV is exactly "test" or "development" AND PARMANA_ALLOW_UNGOVERNED_POLICY=true is set explicitly (see be |
| `PARMANA_ALLOW_UNGOVERNED_POLICY` | Explicit opt-in to skip governance approval records. Honoured only when NODE_ENV is "test" or "development" and POLICY_EXECUTION_VERIFICATION_ENFORCED is not "true". Never set it in a deployment: it lets unapproved policies run. |
| `PARMANA_SKIP_DOTENV` | Set to 1 to stop the loaders reading a .env file. The test suite sets it itself, so a local .env cannot change test results. |
| `PARMANA_VERIFIER_KEY_ID` | Key id the Signal/State verifier signs its read-only HubSpot fetches with. The key must exist (public and private PEM in PARMANA_KEY_DIR, or in KMS). The gateway accepts this key only for the read capability it is for, so a leaked verifier key cannot release a write. Default: signal-verifier. |
| `SIGNING_READINESS_CHECK` | Signing readiness (docs/adr/ADR-0011). ENFORCED BY DEFAULT. Before an action is released to a connector, the runtime signs and verifies a probe artifact through the evidence signing key and refuses with 503 SIGNING_UNAVAILABLE if that fails. Relaxed only when NODE_ENV is exactly "test" or "developme |
| `EXECUTION_INTENTS_CHECK` | Execution Intents (docs/adr/ADR-0012). ENFORCED BY DEFAULT. Before an action is released to a connector, the runtime signs and stores an Execution Intent, and refuses with 503 EXECUTION_INTENT_UNAVAILABLE, releasing nothing, if it cannot. Relaxed only when NODE_ENV is exactly "test" or "development" |
| `PARMANA_KEY_MATERIAL_JSON` | JSON object of { "<keyId>": { "privateKeyPem": string, "publicKeyPem": string } }, materialized into PARMANA_KEY_DIR at boot for any file that doesn't already exist there. Optional — the "load key material from env" path for platforms with no persistent-volume/secret-file primitive; leave unset if y |
| `PARMANA_GATEWAY_KEY_ID` | Key id prefix for the Gateway's attestation-signing keypair (expects <PARMANA_KEY_DIR>/<id>.{private,public}.pem). Optional, defaults to "gateway". |
| `PARMANA_GATEWAY_ID` | Identity this process presents to Execution Control as the Gateway (GatewayIdentity.gatewayId/publicIdentity — appears in every audit event and attestation this process signs). Distinct from PARMANA_GATEWAY_KEY_ID above (that's a key file prefix; this is the logical identity name). Set a distinct va |
| `PORT` | HTTP port the API server binds to. Optional, defaults to 3000 — PaaS platforms (Railway, Render, Fly, etc.) commonly inject this at deploy time. |
| `HOST` | Host/interface the API server binds to. Optional, defaults to "0.0.0.0". |
| `SHUTDOWN_TIMEOUT_MS` | Milliseconds the graceful-shutdown handler waits for in-flight requests to drain on SIGTERM/SIGINT before forcing exit. Optional, defaults to 10000. |
| `LOG_LEVEL` | Log verbosity. Not validated against a fixed list in code (no parse function, no logger library enforcing it) — any string is accepted as-is; conventionally debug \| info \| warn \| error. Optional, defaults to "info". |
| `PARMANA_STORAGE` | Storage backend for business-transaction/trust-record repositories. Valid values (enforced, packages/shared/src/config/StorageProviders.ts, via ConfigValidation.ts's parseStorageProvider): memory \| postgres \| supabase. Optional, defaults to "memory". `postgres` and `supabase` select the same Postgre |
| `DATABASE_URL` | trust-record repositories. Format placeholder only. |
| `SUPABASE_URL` | The three SUPABASE_* variables below are NOT read by the Parmana server. The server reaches Postgres only through DATABASE_URL above. They are used by some tests, CI and tutorials. Leave them unset for a server deployment. See docs/site/deployment/environment-variables.mdx. |
| `SUPABASE_SERVICE_ROLE_KEY` | (see .env.example) |
| `SUPABASE_ANON_KEY` | (see .env.example) |
| `ALLOW_LIVE_SUPABASE` | Opt-in required by tests/helpers/supabase-availability.ts before any Supabase-gated test suite runs against a live project. Optional; unset by default. WARNING: enables real writes to a live Supabase project during `npm test` — do not set for routine local runs. |
| `CRYPTO_MODE` | Signing mode. Valid values (enforced, CryptoAlgorithms.ts's CryptoModes, via parseCryptoMode): single \| hybrid \| pq. single: only PRIMARY_SIGNATURE_PROVIDER signs/verifies. hybrid: Trust Records and Receipts are additionally signed by SECONDARY_SIGNATURE_PROVIDER. pq is reserved, not read by any cal |
| `PRIMARY_SIGNATURE_PROVIDER` | Primary signature algorithm. Valid values (enforced, CryptoAlgorithms.ts's SignatureAlgorithms, via parseSignatureAlgorithm): ed25519 \| ecdsa-p256 \| dilithium3 \| dilithium5 \| sphincs-plus. Optional, defaults to "ed25519". |
| `SECONDARY_SIGNATURE_PROVIDER` | Secondary signature algorithm — required only when CRYPTO_MODE=hybrid; must differ from PRIMARY_SIGNATURE_PROVIDER. Same valid-values list as PRIMARY_SIGNATURE_PROVIDER above. Its key material must exist at <PARMANA_KEY_DIR>/default-secondary.{private,public}.pem. Optional, unset by default. |
| `HYBRID_SIGNATURE_REQUIRED` | When "true", VerificationCrypto.verifySignature() requires a valid `signatures` array (both configured algorithms) on every ExecutionTrustRecord it checks -- a record with `signatures` absent, empty, or partial is rejected outright, never silently verified via the legacy single signature alone (clos |
| `HYBRID_SCHEMA_VERSION` | Schema version that hybrid signatures are made under (ADR-0016). 2 signs the canonical fields plus schemaVersion. 3 signs the whole record except the signature envelope, verifications and receipts. Only 2 and 3 are accepted. Switch to 3 only after every verifier you rely on supports version 3. |
| `HYBRID_SCHEMA_V3_ACKNOWLEDGED` | Required, and set to the exact string true, only with HYBRID_SCHEMA_VERSION=3. |
| `POLICY_CHANGE_CHECKERS` | Cutover (ADR-0016): records created at or after this UTC instant must carry a valid hybrid envelope. Leave unset until every new record is hybrid-signed. Which callers may approve policy changes, per policy (G-50). Unset lists no one. |
| `KILL_SWITCH_ENABLED` | Operator kill switch (ADR-0017). Off unless set to true. When true, needs DATABASE_URL and KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR. Production uses true for the second operator, so a reset takes two different people. |
| `KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR` | (see .env.example) |
| `HYBRID_REQUIRED_FROM` | (see .env.example) |
| `HASH_PROVIDER` | Hash algorithm. Valid values (enforced, CryptoAlgorithms.ts's HashAlgorithms, via parseHashAlgorithm): sha256 \| sha3-512 \| blake3. Optional, defaults to "sha256". |
| `KEY_PROVIDER` | Signing-key backend. Valid values (enforced, KeyProviders.ts, via parseKeyProvider): local \| aws-kms \| azure-key-vault \| gcp-kms \| hsm. Only "local" (FileKeyProvider) has an implementing class today — setting this to any of the other four values does nothing. Optional, defaults to "local". |
| `EXECUTION_AUTHORIZATION_TTL_SECONDS` | TTL, in seconds, applied to a signed Execution Authorization when the caller does not specify one. Free-form number. Optional, defaults to 120. |
| `TRUST_PROFILE` | Trust record schema profile. Valid values (enforced, TrustProfiles.ts, via parseTrustProfile): v1 — the only value defined today. Optional, defaults to "v1". |
| `RECEIPT_VERSION` | Receipt schema version. Not validated against a fixed list in code (no parse function) — free-form string, only "1" is meaningful today. Optional, defaults to "1". |
| `PARMANA_AUTH_DISABLED` | JSON array of { "callerId": string, "keyHash": string (sha256 hex, 64 lowercase hex chars) } entries. Generate with `npm run generate:api-key -- --caller-id <id>`. Required unless |
| `PARMANA_API_KEYS` | and auth not explicitly disabled. Optional, defaults to "[]". |
| `RATE_LIMIT_EXECUTE_PER_MINUTE` | POST /execute only, keyed by authenticated caller identity (not IP) — only enforced when caller-auth is enabled. Optional, defaults to 30. |
| `RATE_LIMIT_HEALTH_PER_MINUTE` | GET /health and GET /ready, keyed by IP. Optional, defaults to 300 — deliberately generous so PaaS health-check polling is never throttled. |
| `RATE_LIMIT_PUBLIC_PER_MINUTE` | The unauthenticated routes that do work (POST /refusal/verify, POST /execution-intents/verify, POST /audit/verify, /handbook), keyed by IP. Also covers key discovery (GET /keys/:keyId, GET /.well-known/jwks.json). Optional, defaults to 60 (G-78). |
| `RATE_LIMIT_AUTH_FAILURE_PER_MINUTE` | Failed caller authentications (401) per IP, on every authenticated route. Each one writes a signed audit event. Requests with a valid key do not count. Optional, defaults to 30. |
| `PARMANA_CORS_ORIGINS` | Origins allowed to call the API from a browser, separated by commas, each exactly scheme://host[:port]. Unset: no CORS header is sent. |
| `PARMANA_SANDBOX` | Sandbox mode: mounts POST /sandbox/approvals, the demo approver. Refused at startup with caller authentication disabled or any Paytm, HubSpot, Slack or GitHub variable set. Never in production. |
| `PARMANA_SANDBOX_APPROVER_ID` | (see .env.example) |
| `PARMANA_SANDBOX_APPROVER_KEY_ID` | (see .env.example) |
| `PARMANA_SANDBOX_APPROVER_PRIVATE_KEY` | (see .env.example) |
| `HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot Private App token, production (NODE_ENV != test). Optional — if unset, the HubSpot connector is simply not registered. Format placeholder only. Long-lived, static credential with no built-in expiry (unlike the GitHub connector's ephemeral per-execution token) — rotate it periodically (recomm |
| `HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT` | Date HUBSPOT_PRIVATE_APP_TOKEN was last rotated (ISO 8601, e.g. 2026-09-10). Optional, but without it startup logs a reminder that this token's age can't be tracked; past the 90-day recommended cadence, startup logs a staleness warning naming the actual age. |
| `TEST_HUBSPOT_PRIVATE_APP_TOKEN` | HubSpot test-mode Private App token, used under NODE_ENV=test and by the gated live-integration suite. Must start with "pat-" (enforced; aborts before any network call if it doesn't). Scope to crm.objects.deals.read/write only. Optional, unset by default. |
| `ALLOW_LIVE_HUBSPOT` | Opt-in required alongside TEST_HUBSPOT_PRIVATE_APP_TOKEN before the live HubSpot suite runs. Optional; unset by default. WARNING: makes real network calls to HubSpot's API and can mutate a real deal (reverted before the suite finishes) — do not set for routine local `npm test` runs. |
| `TEST_HUBSPOT_DEAL_ID` | A real test deal id in the same HubSpot developer/test account, required only by the mutating deal-update case in the live suite. Optional — absent, only that one case skips. |
| `HUBSPOT_BASE_URL` | Test seam only: points the HubSpot connector at a hermetic mock server instead of HubSpot's real API (https://api.hubapi.com). Never set in production. Optional, unset by default. |
| `GITHUB_APP_ID` | GitHub App id, installation id, and private key, production (NODE_ENV != test). All three are required together — if any is unset, the GitHub connector is simply not registered. The credential is ephemeral (docs/CLAIMS.md Claim 1): every execution mints a fresh, short-lived installation access token |
| `GITHUB_INSTALLATION_ID` | (see .env.example) |
| `GITHUB_APP_PRIVATE_KEY` | (see .env.example) |
| `TEST_GITHUB_APP_ID` | GitHub App id / installation id / private key used under NODE_ENV=test by the gated live-integration suite. All three are required together for the live suite to mint a real installation token. Optional, unset by default — the hermetic suite does not need these; it generates its own throwaway RSA ke |
| `TEST_GITHUB_INSTALLATION_ID` | (see .env.example) |
| `TEST_GITHUB_APP_PRIVATE_KEY` | (see .env.example) |
| `ALLOW_LIVE_GITHUB` | Opt-in required alongside the TEST_GITHUB_* triple before the live GitHub suite runs. Optional; unset by default. WARNING: makes real network calls to GitHub's API and can merge a real pull request (reverted before the suite finishes) — do not set for routine local `npm test` runs. |
| `TEST_GITHUB_REPOSITORY` | A real test repository and pull request number in the same GitHub App installation, required only by the mutating merge case in the live suite. Optional — absent, only that one case skips. |
| `TEST_GITHUB_PULL_NUMBER` | (see .env.example) |
| `GITHUB_BASE_URL` | Test seam only: points the GitHub connector and credential provider at a hermetic mock server instead of GitHub's real API (https://api.github.com). Never set in production. Optional, unset by default. |
| `PAYTM_CONNECTOR_URL` | Unlike HubSpot/GitHub, this connector never calls Paytm's own API directly. It forwards an already Parmana-authorized paytm:refund request to a separate, trusted service (parmana-paytm-agent) that is the only thing that ever holds a real Paytm merchant key. See docs/connectors/PAYTM_CONNECTOR.md for |
| `PAYTM_CONNECTOR_SHARED_SECRET` | Shared secret Parmana's gateway authenticates itself to the Paytm connector service with, sent as a Bearer token. This is transport authentication between Parmana and its own connector service — it is NOT Paytm's merchant key/checksum and does NOT substitute for Parmana's own policy authorization. F |
| `PAYTM_CONNECTOR_TIMEOUT_MS` | Per-request timeout for calls to the Paytm connector service. Optional, defaults to 10000 (10s) when unset. |
| `TEST_PAYTM_CONNECTOR_SHARED_SECRET` | Paytm connector shared secret used under NODE_ENV=test and by a future gated live-integration suite (not yet implemented — no live suite exists this milestone; see docs/connectors/PAYTM_CONNECTOR.md "Staging -> production setup"). Optional, unset by default. |
| `PARMANA_SECRETS_PROVIDER` | AWS region and role, needed when KEY_PROVIDER=aws-kms or |
| `AWS_REGION` | with the Vercel OIDC token and never uses a static access key. |
| `AWS_ROLE_ARN` | (see .env.example) |
| `PARMANA_VERIFICATION_KEY_ID` | Key ids used to sign Execution Trust Records. Defaults: default and default-secondary. Change only if you rotate to a new key id. |
| `PARMANA_VERIFICATION_SECONDARY_KEY_ID` | (see .env.example) |
| `POLICY_GOVERNANCE_INTEGRITY_CHECK_INTERVAL_MS` | How often the server re checks that live policy files still match their approval records, in milliseconds. Default 300000 (5 minutes). Zero or less leaves only the startup check. |
| `SLACK_BOT_TOKEN` | Slack connector. It registers only when SLACK_BOT_TOKEN is set. The base URL is optional and only overrides the Slack API address for testing. |
| `SLACK_BASE_URL` | (see .env.example) |
| `SLACK_ALLOWED_CHANNEL_IDS` | Comma separated Slack channel ids the server may post to (G-76). A post to any other channel is refused, whatever the caller declares. Unset or empty refuses every post. |
| `APPROVAL_WEBHOOK_URL` | Approval notifications. When a refused request would have been authorized with a signed approval, the server POSTs a signed approval.needed event here. Set both or neither. The URL must be https outside test and development. The secret may be a secret reference (PARMANA_SECRETS_PROVIDER). |
| `APPROVAL_WEBHOOK_SECRET` | (see .env.example) |
| `APPROVAL_EMAIL_TO` | Approval notifications by email, through Resend. RESEND_API_KEY and RESEND_EMAIL_DOMAIN are set by the Resend integration on Vercel. The sender defaults to approvals@ that domain. |
| `APPROVAL_EMAIL_FROM` | (see .env.example) |
| `RESEND_API_KEY` | (see .env.example) |
| `RESEND_EMAIL_DOMAIN` | (see .env.example) |
| `PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE` | Local test approver. No agent action is authorized without a signed human approval, so a local test server can trust the approver local-test-approver with this Ed25519 public key (see docs/site/quickstart.mdx). Honored only when NODE_ENV is test; with any other NODE_ENV the server refuses to start. |
| `PARMANA_GITHUB_VERCEL_CONNECT_CONNECTOR_ID` | Alternative GitHub credential source using Vercel Connect. When set it takes precedence over GITHUB_APP_ID, GITHUB_INSTALLATION_ID and GITHUB_APP_PRIVATE_KEY. |
| `TEST_SLACK_BOT_TOKEN` | Slack bot token used only under NODE_ENV=test. Optional, unset by default. |

Set values in Vercel (sensitive) or the process environment, never in the repository. Changes apply on the next deployment (scenario M).

---

## Part 47. Error codes and status codes

### 47.1 SDK error codes

| Code | Meaning in practice |
| --- | --- |
| `CONFIGURATION_ERROR` | The client or server is misconfigured (for example a missing endpoint). Fix configuration; retrying does not help. |
| `VALIDATION_ERROR` | The request is malformed or fails validation. Fix the request before retrying. |
| `AUTHENTICATION_ERROR` | The credential is missing or not accepted (HTTP 401). Check the key (scenario K). |
| `AUTHORIZATION_ERROR` | The caller is authenticated but not allowed this action (HTTP 403). |
| `NOT_FOUND_ERROR` | The record or route does not exist, or is not visible to this caller (cross-caller reads return 404). |
| `CONFLICT_ERROR` | The change conflicts with existing state, for example a pending change or an active connector. |
| `EXECUTION_REJECTED` | Parmana refused the action. The SDK raises ExecutionRejectedError; the refusal record explains the rule. |
| `VERIFICATION_ERROR` | A record or signature did not verify. |
| `REPLAY_ERROR` | A replay was detected or a replayed record is not acceptable. |
| `NETWORK_ERROR` | The request did not reach the server. Retry with backoff. |
| `TIMEOUT_ERROR` | The request timed out. Do not assume failure or success: read the trust record first (scenario J). |
| `RATE_LIMIT_ERROR` | Too many requests in the window. Back off and retry later. |
| `INTERNAL_SERVER_ERROR` | The server failed. Check logs and /ready; retry only idempotent requests. |

### 47.2 HTTP statuses the API returns

| Status | Meaning | Action |
| --- | --- | --- |
| 200 | Success; or duplicate with `status: duplicate` (signed-event receiver, Part 42.9) | Read the body |
| 202 | Accepted for asynchronous work | Store the id; wait for the outcome |
| 400 | The request is malformed; the envelope names the step | Fix the request; do not retry unchanged |
| 401 | Authentication failed (`authentication required`, or a signature/timestamp problem for signed events) | Check the key or the signature (scenario K) |
| 403 | Authorized failure, such as a refusal that returns 403 (confirm, Part 15 gap 9) | Read the reason; do not retry with another amount |
| 404 | Not found, or not visible to this caller | Check ids and the caller |
| 409 | Conflict with existing state (pending change, active connector, active grant) | Revoke or approve first (Part 6.3) |
| 429 | Rate limited | Back off; respect the window |
| 5xx | Server or upstream failure | Retry with backoff and the same idempotency key; read the record first |

---

## Part 48. Integration recipes

Short recipes for the most common questions. Each refers to the part that gives the detail.

**Recipe 1. Our agent needs to refund a payment.** Mechanism A (SDK). Propose the capability and a grant (Part 6), create the agent key (Part 5), and obtain the approval flow your managers will use (Part 5.4).

**Recipe 2. Our platform calls tools.** Mechanism B (bridge). Build and deploy (Part 9), then register with the platform (Part 9.4).

**Recipe 3. We want Parmana to release to our own system.** Mechanism C (external connector). Build the endpoint (Part 8), deploy it, propose the connector, approve, then grant the caller (Part 10).

**Recipe 4. A policy needs a fact from our system.** Mechanism E (signal source). Propose the source with its public key, approve it, and reference it from the policy's `signalSources`. ⚠️ Re-run before relying on it.

**Recipe 5. A customer wants proof.** Mechanism G (offline verification). Give them the record and Parmana's public key, and the verification steps in Part 42.8.

**Recipe 6. We want to rotate a key.** Part 5.7 and scenario H.

**Recipe 7. We are changing an environment variable.** Part 27 and scenario M. Redeploy after the change.

**Recipe 8. We are upgrading an SDK.** Part 43.5.

**Recipe 9. Something went wrong with a request.** Part 12 for the message, then Part 11 for the scenario, then the trust or refusal record for the business transaction.

---

---

## Part 50. Credential ceremony with kill-switch controls

This part is the procedure for creating the maker, the checker and the operator keys, and for using the kill switch around that work. It follows `docs/runbooks/KILL-SWITCH-OPERATIONS.md`, which is the authority for the switch. Where this part and the runbook differ, the runbook wins; tell the founder so the book can be corrected.

### 50.1 Preconditions

1. **Two people.** The checker must be a different person from the maker, and operator B must be a different person from operator A. One person holding two roles is open risk 2 (Part 31); do not run this ceremony with one person pretending to be two.
2. **Each person works on their own machine.** Keys are generated and stored on the holder's machine, not sent to another person.
3. **The checker's step-up key is generated by the checker**, and only the public part is shared (runbook, section "How to verify it", step 1).
4. **No key is pasted into chat, email or a commit.** Two keys were pasted in chat on 20 October; the runbook says treat them as exposed and rotate them.
5. **A maintenance window is agreed.** Changes to `PARMANA_API_KEYS` and the kill-switch settings are followed by a redeploy.

### 50.2 What each credential is for

| Credential | `callerId` (example) | Holder | Capability on the key | Purpose |
| --- | --- | --- | --- | --- |
| Maker | `maker-<name>` | Maker (a human) | none | Proposes governed changes |
| Checker | `checker-<name>` | Checker (a different human) | none | Approves changes, with a step-up key |
| Operator A | `operator-a` | Operator A | `kill-switch:trip`, `kill-switch:reset` | Trips the switch; first reset request |
| Operator B | `operator-b` | Operator B (a different person) | `kill-switch:reset` | Second reset request, completes the reset |
| Probe | `kill-switch-probe` | Automation (GitHub Actions) | `kill-switch:probe` | Records probes; already in production (runbook) |

A key without the capability gets `403 CAPABILITY_NOT_ALLOWED` (runbook). A key with a capability it does not need is a risk; give each operator only the capabilities listed above.

### 50.3 The sequence

Run the phases in order. Phase 3 is the only one that touches the switch, and it is only for a drill or a real stop. Routine ceremony work does not trip the switch.

**Phase 0. Check the production state (any valid key; the status route is open to any authenticated caller).**

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
curl.exe -s "$env:PARMANA_URL/ready"
curl.exe -s -H "Authorization: Bearer $env:PARMANA_API_KEY" "$env:PARMANA_URL/kill-switch/status?nonce=ceremony-start"
```

Expected: `/ready` returns `READY`; status shows `"active":false`, your nonce echoed, `"signed":false`. If `active` is `true`, stop: the switch is tripped and approvals are refused. Do not continue until the reason is known (Phase 4).

**Phase 1. Generate the maker and checker (each person on their own machine).**

Maker (the maker's machine):

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id maker-<name> --credential-holder-type USER
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\maker-<name>.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"; Set-Clipboard -Value $k
```

The maker saves the key to their password manager, then clears the clipboard (`Set-Clipboard -Value " "`). The entry file (`maker-<name>.json`) contains only the hash, and is sent to the operator.

Checker (the checker's machine), with the step-up key:

```powershell
cd D:\last\parmana-core
$out = npx tsx scripts/generate-api-key.ts --caller-id checker-<name> --credential-holder-type USER --generate-step-up-key
$out | Where-Object { $_.StartsWith('{"callerId"') } | Set-Content "$env:USERPROFILE\parmana-entries\checker-<name>.json" -Encoding ascii
$k = (($out | Where-Object { $_ -match '^Key\s+:' }) -replace '^Key\s+:\s*', '').Trim()
"key length: $($k.Length)"; Set-Clipboard -Value $k
$pem = ($out -join "`n") -replace '(?s).*(-----BEGIN PRIVATE KEY-----.*?-----END PRIVATE KEY-----).*', '$1'
$pem | Set-Content "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Encoding ascii
Select-String -Path "$env:USERPROFILE\parmana-checker\step-up.private.pem" -Pattern "BEGIN PRIVATE KEY"
```

Expected: `key length: 43`, and one matching line. The checker saves the key and the step-up PEM to their password manager, clears the clipboard, and sends the operator only the entry file (`checker-<name>.json`) and the public key from the entry's `stepUpPublicKey`.

Operator A and operator B (each on their own machine, after Phase 0):

```powershell
cd D:\last\parmana-core
# Operator A: trip and reset
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-a --credential-holder-type USER --allowed-capabilities "kill-switch:trip,kill-switch:reset"
# Operator B: reset only
$out = npx tsx scripts/generate-api-key.ts --caller-id operator-b --credential-holder-type USER --allowed-capabilities "kill-switch:reset"
```

Each operator then runs the save lines from the maker step with their own `callerId`, and stores the key in their password manager.

✅ Operator keys are generated by the same script as all other callers. ⚠️ The capability names `kill-switch:trip`, `kill-switch:reset` and `kill-switch:probe` are read from `packages/api/src/routes/kill-switch.ts`; confirm the script accepts them (`--allowed-capabilities`) on the first generation and record the result.

**Phase 2. Update the live key list (no trip).**

Collect every entry file (maker, checker, operator A, operator B, and the existing callers) into `parmana-entries`. Then replace the list exactly as in Part 7:

```powershell
$link = "$env:USERPROFILE\parmana-vercel-link"
$entries = @(Get-ChildItem "$env:USERPROFILE\parmana-entries\*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json })
$entries | ForEach-Object { "{0}  capabilities={1}" -f $_.callerId, ($_.allowedCapabilities -join ",") }
$value = ConvertTo-Json -InputObject $entries -Depth 5 -Compress
vercel env rm PARMANA_API_KEYS production --yes --cwd $link
$value | vercel env add PARMANA_API_KEYS production --sensitive --cwd $link
```

Check the printed list contains every caller before the `env rm` line runs.

**Phase 2b. Redeploy from the current code.** The runbook requires that production is deployed from a current checkout of `main`, not an old folder:

```powershell
cd D:\last\parmana-core
git switch main
git pull origin main
git log -1 --oneline
Select-String -Path api\index.ts -Pattern "createKillSwitch"     # expect two lines; none means an old checkout
npx vercel deploy --prod --yes
```

⚠️ The runbook writes `api\index.ts` for the checkout it describes. If the repository's layout differs, use the runbook's own check and record the difference. Do not deploy from a folder you cannot confirm is current.

**Phase 2c. Verify each key (no trip).** Use each caller's own key; do not reuse one key for several callers.

```powershell
$k = Read-Secret "<caller-id>.key"
curl.exe -s -o NUL -w "%{http_code}\n" "$env:PARMANA_URL/callers/me" -H "Authorization: Bearer $k"
curl.exe -s "$env:PARMANA_URL/kill-switch/status?nonce=verify-<caller-id>" -H "Authorization: Bearer $k"
Remove-Variable k
```

Expected: `200` for `/callers/me`; status shows `active: false`. Repeat for each caller. A `401` means the list does not contain that key (Part 7, scenario K).

**Phase 3. Kill-switch drill (optional, for a rehearsal or a real stop).**

Run only when the founder has agreed the drill, and never in the same window as a governed approval (trip blocks approvals).

*3a. Trip (operator A, reason required):*

```powershell
$k = Read-Secret "operator-a.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/trip" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"drill: <date>\"}"
Remove-Variable k
```

Expected: `200` with the state. Without a reason the request returns `400`.

*3b. Confirm the stop, without moving money.* Send the no-approval case of the runner. The switch answers before the policy, so the expected result is `503` with `KILL_SWITCH_ACTIVE`, not the policy refusal:

```powershell
$env:PARMANA_API_KEY = Read-Secret "razorpay-demo-agent.key"
npx tsx examples/razorpay-refund/send.ts --case no-approval --payment pay_TrPtgJ3RVnzzFi --amount 100 --out record-drill.json
```

⚠️ Not run. The runbook states that execution is refused with 503 `KILL_SWITCH_ACTIVE` when tripped, and the tutorial 124 (`examples/tutorials/124-kill-switch-trip-and-refuse`) checks it in tests. Record what the live call returns.

*3c. Reset, two operators.* Operator A first (`202`, pending); operator B second, with their own key (`200`, lifted):

```powershell
# Operator A
$k = Read-Secret "operator-a.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"drill complete\"}"
Remove-Variable k

# Operator B, on their own machine, with their own key
$k = Read-Secret "operator-b.key"
curl.exe -s -X POST "$env:PARMANA_URL/kill-switch/reset" -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "{\"reason\":\"drill complete, confirmed\"}"
Remove-Variable k
```

Expected: operator A gets `202` and `outcome: "pending"`; operator B gets `200` and `outcome: "reset"`. If operator A repeats the request, the answer is `409 SAME_OPERATOR_CANNOT_CONFIRM_RESET`. A new trip cancels a pending reset.

*3d. Verify.* Status shows `active: false`. Re-run the no-approval case: it must now return the policy refusal, `reject-manager-approval-required`.

⚠️ The two-person reset is enabled in production but not yet exercised with two real operator keys (runbook, "Still open"). Phase 3 is the first real exercise; record its result.

**Phase 4. Stopping for a real incident.** Trip immediately (3a) with the incident reason. Then contain (Part 30.1). Do not reset until the cause is known and recorded.

### 50.4 Enabling and disabling the switch feature

Two different things are called "the kill switch". Do not confuse them.

| Control | What it does | How it changes | Needs a redeploy |
| --- | --- | --- | --- |
| The **trip** (routes `/kill-switch/trip`, `/reset`) | Stops execution and approvals; a reset lifts it | API call, by an operator with the capability | No |
| The **feature** (`KILL_SWITCH_ENABLED`) | Turns the guard machinery on or off | Vercel variable | Yes |

**Enable the feature (Production, per the runbook):**

```powershell
cd D:\last\parmana-core
vercel env add KILL_SWITCH_ENABLED production        # choose Config, value: true
vercel env add KILL_SWITCH_RESET_NEEDS_SECOND_OPERATOR production   # value: true (must be exactly true or false)
npx vercel deploy --prod --yes
```

**Disable the feature.** Removing `KILL_SWITCH_ENABLED` turns the switch off (runbook). This removes the guard: an operator can no longer stop the system through the API. Do this only in an emergency, after the founder agrees, and record it:

```powershell
vercel env rm KILL_SWITCH_ENABLED production --yes
npx vercel deploy --prod --yes
```

**Restore it:** add the variable back as in the enable step, and redeploy. Verify with `vercel env ls production` (both names as Config), `vercel ls parmana-api-real`, and `/ready`.

**Failure to avoid:** a reset-setting value that is not exactly `true` or `false` stops the function at startup. Every request then fails with `500`, and `/ready` fails too (runbook). Check the value after every change.

### 50.5 Why the order matters

- **Approvals stop when the switch is tripped.** Do not trip during creation or approval of makers, checkers or grants.
- **The trip state survives a redeploy.** The runbook keeps it in the `kill_switch_state` table, so a deploy does not clear a trip. Reset it through the two-operator flow, not by redeploying.
- **Disabling the feature removes the stop.** Keep it enabled in production unless the founder decides otherwise.
- **Probes keep running.** The probe workflow runs every 15 minutes (runbook). A probe that does not match the switch state fails the workflow; expect that during a drill and note it.

### 50.6 Checklist for the ceremony

- [ ] Phase 0: `/ready` is `READY`; status shows `active: false`.
- [ ] Maker generated on the maker's machine; checker generated on the checker's machine with its step-up PEM; two distinct people.
- [ ] Operator A and operator B keys generated, with the capabilities in 50.2; two distinct people.
- [ ] Every key saved to a password manager; clipboards cleared; no key in chat, email or a commit.
- [ ] Entry files collected in `parmana-entries`; the printed list contains every caller.
- [ ] `PARMANA_API_KEYS` replaced; deploy from a current `main` checkout; `Select-String` check passed.
- [ ] Each caller's key returns `200` on `/callers/me`.
- [ ] Drill (3a–3d) run or consciously skipped, with the reason recorded.
- [ ] Rotation of any key pasted in chat (runbook, "Still open").
- [ ] Changelog entry in Part 49.


## Part 49. Changelog

- **1.0 (23 October 2026).** First version: workstation setup, credentials, governed changes, the key list, the connection sequence, scenarios A to U, troubleshooting, command reference, test evidence, gaps, the Razorpay spec mapping, glossary and FAQ.
- **1.1 (23 October 2026).** Chapters 19 to 41: product, architecture, policies, approvals, records, cryptography, storage, deployment, security, operations, incident response, open risks, compliance, roadmap, SDKs, licensing, go-to-market, team, decisions, checklists.
- **1.2 (23 October 2026).** Integration mechanisms (Part 42); SDK reference for TypeScript and Python (Part 43); every API route from the OpenAPI specification (Part 44); every npm script (Part 45); every environment variable in `.env.example` (Part 46); error and status codes (Part 47); integration recipes (Part 48). Corrected the claim that Parmana has no reject operation: the SDK and API have reject methods for each change kind; the operator script does not.

- **1.3 (23 October 2026).** Part 50: the credential ceremony for makers, checkers and operators, with the kill-switch procedure (trip, reset, drill, enable and disable). Records that tripping also stops approvals, so the ceremony keeps the switch untripped.

**To add an entry:** write the topic, the source (file, command or document), the date verified, and the status marker. Add a line here.

