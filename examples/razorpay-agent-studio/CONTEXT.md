# Context: Razorpay Agent Studio refund agent through Parmana

Read this first when resuming. It is the full state of the work as of **24 October 2026**: what we are building, why,
how the pieces fit, what is live, what is decided, what is open, and exactly how to pick it up again.

It does not contain any secret. Keys, tokens and the approver key are never written here. Where a secret is needed, this
file says where it lives and how to get it.

Companion files in this folder:

- `PROJECT.md`: the overview (why, what, status). Shorter than this file.
- `README.md`: the setup steps, in order.
- `PROGRESS.md`: the dated status table and the four demo cases.
- `mcp.ts`, `build-mcp.ts`, `tests/mcp.test.ts`: the MCP server that Agent Studio calls.

Related files outside this folder:

- `examples/razorpay-refund/`: the Razorpay endpoint, the policy, and the send script.
- `examples/razorpay-refund-agent/`: the refund agent, its CLI and its tests.
- `docs/runbooks/`: operator runbooks (key rotation, kill switch, ceremony, troubleshooting).

---

## 1. The goal in one paragraph

A merchant builds an agent in **Razorpay Agent Studio**. That agent may **propose** a refund of a Razorpay payment, but it
may never **release** one by itself. The proposal goes to **Parmana**, the authorization layer in this repository. Parmana
decides, using a policy, an agent grant (a limit on what the agent may do), and a **signed manager approval** for that
payment and amount. Only when Parmana releases the refund does a Razorpay endpoint refund the payment. Every decision,
approved or refused, leaves a signed record that anyone can verify offline.

Everything runs in **Razorpay test mode**. No real money moves. Moving to live needs a separate review that this work does
not do.

## 2. Why we are doing it

- Refunds move money. An agent that can refund on its own is a risk: a wrong target, a wrong amount, or an instruction
  injected into the agent could refund money nobody meant to refund.
- Parmana is the control point. It separates "the agent asks" from "the system decides", and it leaves evidence.
- Razorpay Agent Studio is where merchants build agents in plain language. We want those agents to be able to ask for
  refunds safely, without Razorpay or the merchant handing the agent a refund key.

## 3. Success criteria (what "done" means)

1. With **no approval**, the agent's request is **REFUSED** with rule `reject-manager-approval-required`, and Razorpay sees
   **no** refund.
2. With a **manager's signed approval** for the same payment and amount, within the grant, the request is **APPROVED**, and
   Razorpay (Test Mode, Refunds) shows **one** refund whose `receipt` is Parmana's business transaction id.
3. Over-limit and replayed requests are refused, and the refusal is recorded.
4. Each record verifies offline.
5. Agent Studio can call the tool. **This is not yet true**: Razorpay has to register the connector (see section 9).

## 4. Architecture

```
Razorpay Agent Studio agent
      |  MCP tool call: propose_refund, bearer token (AGENT_STUDIO_TOKEN)
      v
MCP server  (examples/razorpay-agent-studio/mcp.ts, deployed on Vercel)
      |  calls the refund agent's requestRefund (examples/razorpay-refund-agent/agent.ts)
      |  Parmana API call, agent key (PARMANA_API_KEY)
      v
Parmana API  (parmana-api-real on Vercel)  -- decides: policy, grant, signed approval --
      |  signed release, only if APPROVED
      v
Razorpay endpoint  (examples/razorpay-refund, deployed on Vercel, holds the TEST keys)
      |  POST /v1/payments/{id}/refund, receipt = businessTransactionId
      v
Razorpay (Test Mode)
```

Design rules that must not change without a decision:

- **Parmana holds no Razorpay key. The endpoint does.** Parmana releases a signed statement; the endpoint acts only on what
  it verifies (signature, audience, expiry, capability).
- **The MCP server holds no Razorpay key.** It holds two secrets: the bearer token only Agent Studio presents, and
  Parmana's agent key.
- **The agent cannot approve its own refunds.** The approval is made by a person with an approver key the agent never sees.
- **Acting once.** Each refund carries the business transaction id as its Razorpay `receipt`. The endpoint looks for an
  existing refund with that receipt before refunding, so a resend does not refund twice.
- **Test mode only.** The endpoint refuses `rzp_live_` keys before any call.
- **Input is checked before any call.** A bad payment id (must start `pay_`) or a bad amount (whole paise, positive) is
  rejected without contacting Parmana.
- **Errors are reported, not hidden.** A Parmana refusal is returned as `REFUSED` with its rule. Any other failure is an
  error.

## 5. The pieces, and where each lives

| Piece | Location | What it does |
| --- | --- | --- |
| Refund agent | `examples/razorpay-refund-agent/agent.ts` | `requestRefund`, `validateRefundInput`, `CAPABILITY = "razorpay:refund"`. Returns APPROVED or REFUSED. 16 tests. |
| Refund agent CLI | `examples/razorpay-refund-agent/send.ts` | Runs one request. Does **not** sign approvals. Options include `--approval-file` and `--out`. |
| Razorpay endpoint | `examples/razorpay-refund/endpoint.ts`, `razorpay.ts`, `build-endpoint.ts` | Verifies Parmana's signed release, then refunds in Razorpay test mode. |
| Demo send script | `examples/razorpay-refund/send.ts` | Runs the four demo cases. Signs approvals (`--save-approval`). Writes records (`--out`). |
| Policy | `examples/razorpay-refund/policy.json` | Ordered rules for `razorpay:refund`. See section 7. |
| MCP server | `examples/razorpay-agent-studio/mcp.ts` | One tool, `propose_refund(paymentId, amountPaise, purpose?, approval?)`. JSON-RPC over HTTP. Bearer compare with `timingSafeEqual`. |
| MCP build | `examples/razorpay-agent-studio/build-mcp.ts` | Bundles the server to `api/mcp.mjs` plus `package.json` and `vercel.json` (60 s max duration). No secret in the build. |
| MCP tests | `examples/razorpay-agent-studio/tests/mcp.test.ts` | 6 tests: authentication, protocol, tool. Fake Parmana, no network. |
| Setup script | `examples/razorpay-agent-studio/setup-windows.ps1` | PowerShell helper. **Exists only as an untracked local copy on the Windows machine. Step 7 is broken (see section 10).** |

Test counts recorded: refund agent 16, MCP 6, all Razorpay examples together 22. Typecheck, eslint and prettier were clean.

## 6. What is live (test mode)

These are recorded in `PROGRESS.md` and were true on 23 October 2026. Re-check before relying on them.

| Thing | Value or location |
| --- | --- |
| MCP server URL | `https://parmana-agent-studio-mcp.vercel.app/api/mcp` (Vercel project `parmana-agent-studio-mcp`). Returns 401 without the token, 200 with it. Deployment protection is on; bearer-token requests still work. |
| Razorpay endpoint URL | `https://parmana-razorpay-demo.vercel.app/api/refund`. Rejects unsigned requests, as expected. |
| Parmana API | `https://parmana-api-real.vercel.app` |
| Parmana connector | `razorpay:refund`, active, pointing at the endpoint above |
| Parmana policy | `razorpay-refund` version 1.0.0, in force |
| Parmana grant | New grant approved: up to **500 paise (₹5) per request, valid until 2026-10-30**. The earlier grant was revoked because it had expired (revoke id starts `68e3d72a`; new grant id starts `7fda621d`). |
| Parmana live key list (`PARMANA_API_KEYS`) | Four callers: `maker-pavan`, `checker-pavan`, `paytm-refund-agent`, `razorpay-demo-agent`. Names only; values are in the encrypted store and the password manager. |
| Agent key | `razorpay-demo-agent` (created and accepted by Parmana, 200) |
| Checker key | Regenerated. Step-up private key saved on the checker's machine at `parmana-checker\step-up.private.pem`. |
| Approver | `manager-pavan` with key id `manager-pavan-key-1`, the active manager approver. The key file is on the local machine only. |
| Test payment | `pay_TrPtgJ3RVnzzFi`, a captured ₹10 test payment |
| Test refund | `rfnd_TrPyItqZ6h7Dgo`, ₹1 on that payment, receipt `4346a484-f85d-4c3c-bc61-2f416aabd586`, business transaction record `4346a484-…` |

Test ids are recorded here on purpose: they are test-mode references, not secrets.

## 7. The policy, in plain terms

`examples/razorpay-refund/policy.json`, capability `razorpay:refund`. Rules run in order; the last rule is the default reject.

1. Reject any amount of zero or less.
2. Approve when a signed manager approval is present and the amount is positive.
3. Reject otherwise.

Limits are not in the policy. They are in the **grant** (500 paise per request, expiry 2026-10-30). That is why an over-limit
request is refused with `NOT_AUTHORIZED` even when approved by a manager. A replayed approval is refused with
`signal-state-verification-violation`, because the approval was already used.

Refusal reasons that appear in practice:

| Shown as | Meaning | Correct fix |
| --- | --- | --- |
| `Refused by : reject-manager-approval-required` | No signed approval supplied | Make a signed approval for this payment and amount (section 8) |
| `Authority : NOT_AUTHORIZED` | Amount above the grant limit, or the grant is not in force or has expired | Do not raise the request. Check the grant; change it only through a governed change |
| `signal-state-verification-violation` | Approval already used, or does not match | Create a new approval |

## 8. The demo cases, and how to run them

Four cases in `examples/razorpay-refund/send.ts`. All four passed on 23 October 2026.

| Case | Expected | Actual | Why |
| --- | --- | --- | --- |
| `no-approval` | REFUSED | REFUSED | `reject-manager-approval-required`. Razorpay sees nothing. |
| `approved` (₹1) | APPROVED | APPROVED | Refund `rfnd_TrPyItqZ6h7Dgo`. Record verifies offline. |
| `over-limit` (₹8) | REFUSED | REFUSED | `NOT_AUTHORIZED`: the grant caps refunds at ₹5. |
| `replay` | REFUSED | REFUSED | `signal-state-verification-violation`: approval already used. |

Running a single case needs the manager's approval key and the agent key, both kept outside the repository. The approval
is created with `--save-approval approval.json`, and the record is written with `--out`. Use the script's own `--help` for
the exact flags; do not paste a key into a command line that is saved in shell history.

## 9. Open items, with owners

| # | Item | Why it matters | Owner | Next action |
| --- | --- | --- | --- | --- |
| 1 | Agent Studio registration | Agent Studio cannot call Parmana until Razorpay registers the MCP server as a custom connector. No public self-serve path was found. Razorpay's own results describe a new connector taking about a week. | Razorpay | Send Razorpay the MCP URL and the bearer token (from the password manager, never in an email body) and ask for registration |
| 2 | Dashboard check | Confirm `rfnd_TrPyItqZ6h7Dgo` shows ₹1 on `pay_TrPtgJ3RVnzzFi`, and no other refunds exist | Operator | Open Razorpay Test Mode, Refunds |
| 3 | Grant expires **2026-10-30** | After that date the agent is refused | Founder | Renew through a governed change (revoke and re-propose), before the date |
| 4 | Duplicate pending policy change `cf85a4af-082a-424a-a646-31acc1cf8019` | It matches the policy in force and cannot be rejected through the CLI. It blocks nothing. | Engineering | Add `reject` to the operator script (Part 15 of the founder book, gap 1) |
| 5 | `CHECKER_NOT_IN_SCOPE` for policy approvals | This checker cannot approve policy changes | Founder | Confirm the checker-scope list (`POLICY_CHANGE_CHECKERS`); decide whether to add the checker |
| 6 | Setup script step 7 | It cannot read the production URL from piped `vercel ls` output | Engineering | Take the URL as a parameter; commit the fix |
| 7 | Delete the used approval file | `approval.json` on the Windows machine is already used | Operator | Delete it |
| 8 | Save the maker and step-up keys | Confirm they are in the password manager | Operator | Check, then tick |
| 9 | Approval email | Not verified end to end | Founder | Needs a second checker; deferred by decision |
| 10 | Per-refund approval vs a limit without one | A spec-style request is always refused today | Founder, with Razorpay | Decide; change the policy through a governed change |
| 11 | ₹1 crore backstop | Not built. The grant is ₹5 for testing. | Founder, with Razorpay | Decide the limit; set grant and policy to match |
| 12 | Event receiver | Razorpay's spec describes signed `refund.requested` events; not built | Engineering | Build with tests (Part 15, gap 5) |
| 13 | Status tool | The MCP server has only `propose_refund`. The agent cannot check a refund afterwards. | Engineering | Add a status tool |
| 14 | Refusal HTTP status | The spec says 403; unconfirmed | Engineering | Confirm against Parmana's API |
| 15 | Node 22 fails three `distrustCompromisedRoots` tests | CI must run on Node 24, as `package.json` requires | Engineering | Use Node 24 |
| 16 | Rotate secrets pasted into chat | Earlier chat showed keys. Those values no longer work, but rotation must be confirmed. | Operator | Confirm rotation is done (kill-switch runbook) |

## 10. Pitfalls we hit, and the fix (do not repeat)

**Vercel**
- `vercel link` in the repository root connected the **wrong** GitHub project. Fix: unlink, then link from the bundle folder (`parmana-agent-studio-mcp`).
- A build used the repository's build command. Fix: a `vercel.json` override in the bundle folder.
- A deploy failed for a missing `public/` folder. Fix: `public/index.html`.
- Deploys upload the **working folder**. An old checkout deploys old code. Check `git log -1` first.
- `vercel env add` with piped input can add a trailing newline. The CLI warns about it. Check the value length.

**PowerShell and curl**
- Inline JSON to `curl.exe` came back as `400 Parse error`. Fix: write the body to a file and use `--data-binary "@file"`.
- `$env:` variables do not persist across sessions. Re-run the session setup in each new window.
- Keys must be 43 characters. A different length means a bad copy.

**Parmana roles**
- `Caller is not permitted` when the checker's key was loaded for a maker action. Fix: reload the correct key.
- `Requires a caller credential ... verified human` when the agent key was used for approval. Fix: `Use-Key "Checker"`, then approve.
- `CHECKER_NOT_IN_SCOPE` for a policy approval. This is a scope decision, not a bug (item 5 above).
- `Unable to communicate with the Parmana Runtime`. A retry worked. Retry once before escalating.

**Repository and tooling**
- The repository was renamed `parmana` to `xyz`, then the work moved to **`parmana-core`** (PR #59).
- **There are two checkouts on the working machine.** `/home/user/parmana` is on `claude/nifty-darwin-7ks42s`, and its copy of this folder has no `PROGRESS.md`. `/home/user/parmana-core` is the one with the current progress notes. Check which one you are in before editing.
- The stop hook (`~/.claude/stop-hook-git-check.sh`) reports "unpushed commits / no remote branch" when the checkout is missing the remote-tracking ref. Fix: `git fetch origin <branch>:refs/remotes/origin/<branch>`. Do not push again if the remote already has the commit.
- The shell that runs the hook may be a different clone from the one you are using. Compare `git rev-parse HEAD` with `git ls-remote --heads origin <branch>`.

**Process**
- Duplicate pending policy changes can exist and cannot be rejected through the CLI. Leave them pending and note them.
- `send.ts` in the agent folder does **not** sign approvals. The approved case uses `examples/razorpay-refund/send.ts`.

## 11. Branch and PR state (as of 24 October 2026)

| Branch | Content | State |
| --- | --- | --- |
| `main` | Refund agent, MCP server, progress notes (PR #59 and #61 merged) | Merged |
| `claude/troubleshooting-guide` (`parmana-core`) | Troubleshooting guide, 13 sections, plus 13 scenario walkthroughs | **PR #63 open**, not merged |
| `claude/founder-book` | Founder book, version 1.3, about 2,500 lines, Parts 0 to 50 | Not merged. Stop hook asked for a merge. |
| `claude/credential-ceremony-doc` | Credential ceremony runbook | Not merged |
| `claude/kill-switch-operator-guide` | Kill switch operator guide | Not merged |
| `claude/razorpay-context` (this file) | This context file | New, pushed for review |
| `claude/nifty-darwin-7ks42s` (`/home/user/parmana`) | Designated branch in the earlier instructions; different history | Not the source of the current progress notes |

## 12. The founder book, and the runbooks

- **Founder book** (`FOUNDER-BOOK.md`, on `claude/founder-book`): the complete explanation for the founder, about 2,500 lines.
  Part 0 how to use it; Parts 1 to 2 what Parmana is and the roles; Part 3 the build; Part 4 workstation setup; Part 5
  credentials; Part 6 governed changes; Part 7 the key list; Part 8 the external endpoint; Part 9 MCP; Part 10 the
  connection sequence; Part 11 scenarios; Part 12 exact messages; Part 13 command reference; Part 14 evidence; Part 15 gaps;
  Part 16 the Razorpay spec mapping; Parts 19 to 41 product, architecture, policies, approvals, records, cryptography, storage,
  deployment, security, operations, incident response, open risks, compliance, roadmap, SDKs, licensing, team, decisions,
  checklists; Part 42 integration mechanisms; Part 43 SDK reference; Part 44 every route; Part 45 every script; Part 46
  every environment variable; Part 47 error codes; Part 48 integration recipes; Part 50 credential ceremony and kill switch.
  Version 1.3 is dated 23 October 2026. Add changes to Part 49.
- **Open risks in the founder book, Part 31**: `RESEND_API_KEY` stored as a Config value (anyone with dashboard access can
  reveal it); separation of duties (one operator holds both roles); approval issuers not scoped per policy; hybrid signing
  not live in production; schema-version-2 downgrade; third-party verifiers do not read schema version 3; approval email not
  verified; SDK release tags 1.2.0 to 1.6.0 missing from this repository; CAGE design (ADR-0018) never merged; a customer's
  approver not limited to particular actions.
- **Runbooks in `docs/runbooks/`**: `KILL-SWITCH-OPERATIONS.md` is authoritative for the kill switch.
  `KILL-SWITCH-OPERATOR-GUIDE.md` (branch) is the step-by-step for Operator 1 and Operator 2. `CREDENTIAL-CEREMONY.md`
  (branch) covers makers, checkers and operators. `TROUBLESHOOTING-GUIDE.md` (PR #63) covers symptoms and 13 scenarios.

## 13. Kill switch (what to know before touching it)

- Routes: `POST /kill-switch/trip` (needs `kill-switch:trip`, `reason` required), `POST /kill-switch/reset` (first request
  returns **202**; a second, by a **different** operator, completes it), `GET /kill-switch/status`, `POST /kill-switch/probes`.
- Responses: 200 success, 202 reset pending, 409 `SAME_OPERATOR_CANNOT_CONFIRM_RESET`, 403 `CAPABILITY_NOT_ALLOWED`,
  503 `KILL_SWITCH_ACTIVE` while tripped.
- **Tripping also stops approvals.** The ceremony keeps the switch untripped.
- The two-operator reset has **not** been exercised with two real operator keys. Do not claim it works until a drill does it.

## 14. How to resume (step by step)

1. Pick the checkout. Use `/home/user/parmana-core`.
   ```bash
   cd /home/user/parmana-core
   git fetch origin
   git switch claude/razorpay-context    # or main, for the latest merged code
   git status -sb
   ```
2. Read `examples/razorpay-agent-studio/PROGRESS.md` for the dated table, and this file for the reasons.
3. Install and build (Node 24, as `package.json` requires):
   ```bash
   npm ci --ignore-scripts
   npm run build
   ```
4. Run the Razorpay tests (should pass; expect 22 across the three folders):
   ```bash
   npx vitest run examples/razorpay-agent-studio examples/razorpay-refund-agent examples/razorpay-refund
   ```
5. Check the MCP server answers. Without the token it must return 401:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST https://parmana-agent-studio-mcp.vercel.app/api/mcp \
     -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
   ```
   Expect `401`. With the token from the password manager (not typed into chat), expect `200`.
6. Check the grant is still in force (it expires 2026-10-30). Use the agent's key from the encrypted store; never paste it.
7. Check the open items in section 9 and pick the next one. Items 1 and 3 are the time-sensitive ones.

## 15. Rules that apply to this work

- Test mode only. Refuse live keys (`rzp_live_`) anywhere in this work.
- Never paste a key, token, approver key, or database URL into chat, a commit, a PR, or this file. If one was pasted, rotate it.
- Approvals are made by a person with the approver key. The agent never signs or sees one.
- A correct refusal is a success of the system. Do not work around one.
- A governed change (policy, grant, connector, key list) goes through maker and checker. Never edit a live list by hand.
- When something is unclear, say so and record it in section 9. Do not guess a rule id, a route or a status.
- Keep the Parmana side and the endpoint side in the same repository, reviewed together.

## 16. Glossary

- **Agent Studio**: Razorpay's tool for building agents in plain language. Test toggle must be on.
- **Authority grant**: a limit on what a caller may do for a capability, with an expiry.
- **Business transaction id**: Parmana's id for one release. It becomes the Razorpay `receipt`, so a resend cannot refund twice.
- **Capability**: a named permission, here `razorpay:refund`.
- **Checker**: the person who approves a governed change, with a step-up key.
- **Maker**: the person who proposes a governed change.
- **Manager approval**: a signed statement by a manager for one payment and amount.
- **Parmana Runtime**: the decision engine inside the API. An "unable to communicate" message means retry once.
- **PARMANA_API_KEYS**: the live key list, a Vercel secret. Replacing it replaces the whole list.
- **Record**: the signed evidence of one decision. It verifies offline.
- **Step-up key**: an Ed25519 key a checker uses to sign approvals of governed changes.
- **Test mode**: Razorpay's sandbox. Test keys start `rzp_test_`.

## 17. Changelog for this file

- 24 October 2026: first full version, written from the progress notes, the founder book, the runbook branches and the open PRs.
