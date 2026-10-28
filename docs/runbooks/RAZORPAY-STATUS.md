# Razorpay refund agent: status and how to resume

Status as of 28 October 2026. Last live check: 28 October, after 02:24 UTC. The kill switch was off, the API and the tool answered, and the checker key read the status. Read this first when picking the work up again. It says what is live, what is not, what to do next, and where the detail is.

This page holds identifiers, not secrets. Keys, tokens and step-up keys are named by where they live, and their values are only in the password manager and encrypted files on the operator's machine.

## 1. In one paragraph

Parmana decides whether a Razorpay refund may go out. The refund agent asks Parmana through an MCP tool. Parmana refuses any request without a grant and a manager's signed approval. The agent, the tool and Parmana's refusals work end to end on the deployed services. The agent is not verified yet: the approved refund has not run through the tool, and Razorpay has not registered the tool as a connector. Nothing is live for real money.

## 2. What is live

| Part                                                | State                                                                                 | Evidence                                                                                                    |
| --------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Parmana API, `parmana-api-real`                     | Serving production with the four current callers                                      | `/policies` returns `401` without a key (observed, 27 Oct)                                                  |
| Kill switch                                         | Off, version 3                                                                        | Status check (observed, 27 Oct) Checked 28 Oct 2026, after 02:24 UTC: `active false`, version 3 (observed). |
| Probe, `kill-switch-probe`                          | Running on schedule with the new key                                                  | Manual run green (observed, 27 Oct)                                                                         |
| Grant for `razorpay-refund-agent`                   | `razorpay:refund`, up to 500 paise (₹5) per request, valid until 2026-11-03T18:43:24Z | Change `dbdd05f1-dac6-4477-86f3-4fa4ca528e82`, approved (observed, 27 Oct)                                  |
| Approver `manager-pavan`, key `manager-pavan-key-2` | Registered as an approval issuer                                                      | Change `f85a497a-139e-447a-94fb-e6ea01874f50`, `APPROVED` (observed, 27 Oct). Helper support: PR #168       |
| MCP tool, `parmana-agent-studio-mcp`                | Deployed, but the build is from before the failure fix                                | Refusal test returned `REFUSED` (observed, 27 Oct)                                                          |
| Failure fix in the tool                             | Merged to `main` (PR #174, merge `681e548`)                                           | Not live until the MCP project is redeployed                                                                |
| Agent in Agent Studio                               | Built. Instructions set, including the failure rule. Switched off                     | Reported by the operator, 28 Oct                                                                            |
| Razorpay connector registration                     | Not done                                                                              | Razorpay must do it                                                                                         |
| Razorpay test mode                                  | One refund on record: ₹1, `rfnd_TrPyItqZ6h7Dgo`, from 23 Oct, via the demo            | Reported (23 Oct). Refund list checked 27 Oct                                                               |

## 3. What is not done, in order

1. **Redeploy the MCP tool from `main`.** Blocked by the Vercel Hobby limit (100 deployments in 24 hours). It resets at about **2026-10-29 02:16 UTC**. Command sequence is in section 6.
2. **Meeting with Razorpay, 29 October, 17:00 to 17:30 IST.** Five decisions: the trigger, the approval rule, the limit, the refusal status, and who registers the connector. Notes are in `learningds`, `docs/razorpay-journey/08-meeting-discussion-points.md`.
3. **Razorpay registers the MCP server** as a custom connector, and builds or confirms the agent in Agent Studio.
4. **A captured test payment** (`pay_...`, status `captured`, Test Mode). Send it to the operator.
5. **A manager's signed approval** for that payment and ₹1 (100 paise), signed with `manager-pavan-key-2`.
6. **The approved run through the tool.** Expect `APPROVED` with a refund id in `razorpay`. Check Razorpay for one refund, whose receipt equals the `businessTransactionId`.
7. **Repeat the same approval.** Expect `REFUSED`, and still one refund.
8. **The four cases** that need real answers: approved with a refund id, approved with no refund id, refused, and did not complete.
9. **Clean up.** Delete the 11 October approver pair (see section 5), and move the new approver private key into the password manager only.

Only after steps 6 to 8 pass may the agent be switched on. Real money requires the trigger decided and a written limit.

## 4. Decisions still open

| #   | Decision                                         | Current state                                                                | Options                                                                  |
| --- | ------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Trigger: how requests reach the agent            | Direct call from Agent Studio. No event receiver                             | Keep the direct call, or build a signed-event receiver                   |
| 2   | Manager approval: required, or not, per amount   | Required for every refund                                                    | Keep it, or allow up to an amount without it. Needs a new policy version |
| 3   | Per-request limit and backstop                   | Grant ₹5. Draft policy ₹5,000, not approved. Backstop ₹1,00,00,000 not built | Agree the live limit, the policy, and the backstop                       |
| 4   | Refusal status for the over-limit case           | `403` for policy refusals, tested. Over-grant status untested                | Confirm `403`, or another status. Test before promising                  |
| 5   | Who builds the agent and registers the connector | MCP deployed. Agent built. Connector not registered                          | Razorpay confirms the owner and the date                                 |

## 5. Known issues and gaps

- **Approver review.** The same person proposed and approved the approver, under two keys, for this test. The runbook requires a second person. Recorded as an accepted deviation for the test only. A real manager needs a second reviewer.
- **Old approver keys.** A key pair from 11 October 2026 exists in `C:\Users\Pavan Charak\parmana-approver` and `D:\parmana-approver`. It is not registered and must not be used. Delete it once the new key is confirmed working.
- **Plain-text PEMs on disk.** The approver private key and the checker's step-up PEM are plain files. Keep them in the password manager, and restrict the folders.
- **Held requests.** The agent holds requests above ₹500 for a person. Where held requests are kept, and who sees them, is not defined.
- **Failed calls.** Until the redeploy, a failed call reaches the agent as a bare `500` with no transaction id. After it, the tool returns `NOT_COMPLETED` with the id.
- **Builder instruction.** The failure rule is set by hand in Agent Studio. A code change does not change it.
- **Refusal status.** The `NOT_AUTHORIZED` status for an over-limit request is not tested.
- **Vercel limit.** Each deploy and each redeploy counts toward the 100 per day. Batch changes before deploying.

## 6. How to resume

Run in PowerShell, in `D:\last\parmana-core`, on `main`, after `git pull origin main`:

```powershell
$env:PARMANA_URL = "https://parmana-api-real.vercel.app"
try { Invoke-RestMethod "$env:PARMANA_URL/policies" } catch { "$($_.Exception.Response.StatusCode.value__) $($_.ErrorDetails.Message)" }
```

Expect `401 {"error":"authentication required"}`. Anything else means stop and read `PRODUCTION-TROUBLESHOOTING.md`.

Check the kill switch with a key the operator loads from the encrypted file. Expect `"active":false`. If it is `true`, stop and read `KILL-SWITCH-OPERATIONS.md`.

Redeploy the MCP tool, after **2026-10-29 02:16 UTC**, from the repository folder. The build script writes into the existing Vercel folder, which keeps its link:

```powershell
npx tsx examples/razorpay-agent-studio/build-mcp.ts --out ..\parmana-agent-studio-mcp
cd ..\parmana-agent-studio-mcp
npx vercel deploy --prod --yes
```

Check the new deployment is Ready, then run the refusal request with the MCP token. Expect `REFUSED` with `authority-not-authorized`.

## 7. Where the detail is

- **The full journey, the commands and their outcomes, the incidents, and the keys by name:** `learningds`, `docs/razorpay-journey/`, starting at its `README.md`.
- **How the agent is built and how it behaves in each scenario, including stuck states:** `learningds`, `docs/agent/`, starting at its `README.md`.
- **The end-to-end case study:** `learningds`, `docs/razorpay-agent-end-to-end.md`.
- **The demo, and the live-money gate:** `docs/runbooks/RAZORPAY-REFUND.md`.
- **Approval issuers:** `docs/runbooks/APPROVAL-ISSUERS.md`.
- **Kill switch:** `docs/runbooks/KILL-SWITCH-OPERATIONS.md`.
- **Key rotation:** `docs/runbooks/KEY-ROTATION.md`.
