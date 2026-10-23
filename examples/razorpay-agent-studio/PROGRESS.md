# Razorpay refund agent through Parmana: progress

Status as of 2026-10-23. Test mode only.

## Goal
A Razorpay Agent Studio agent proposes a refund to Parmana. Parmana decides, using a signed manager approval and an agent grant. On release, the endpoint refunds the payment in Razorpay test mode.

## Done
| Area | What | Where |
| --- | --- | --- |
| Refund agent | Checks input, asks Parmana to release `razorpay:refund`, returns APPROVED or REFUSED. Tests pass. | `examples/razorpay-refund-agent/` (merged, PR #59) |
| Agent Studio MCP server | One tool, `propose_refund`. Bearer token required. Tests pass. | `examples/razorpay-agent-studio/` (merged, PR #59) |
| MCP server live | `https://parmana-agent-studio-mcp.vercel.app/api/mcp`. 401 without token, 200 with it. | Vercel project `parmana-agent-studio-mcp` |
| Razorpay endpoint live | Rejects unsigned requests, as expected. | `https://parmana-razorpay-demo.vercel.app/api/refund` |
| Agent key | `razorpay-demo-agent` created and accepted by Parmana (200). | Parmana live key list |
| Key list | Four keys present: `maker-pavan`, `checker-pavan`, `paytm-refund-agent`, `razorpay-demo-agent`. | Parmana live key list |
| Checker key | Regenerated. Step-up key saved to `parmana-checker\step-up.private.pem`. | Local |
| Connector | `razorpay:refund` active, pointing at the endpoint above. | Parmana |
| Policy | `razorpay-refund` 1.0.0 in force. | Parmana |
| Grant | Old grant revoked (expired). New grant approved: up to 500 paise (₹5) per request, until 2026-10-30. | Parmana |
| Approver | `manager-pavan` / `manager-pavan-key-1` is the active manager approver. Its key file is on the local machine. | Parmana, local |
| Test payment | Captured ₹10 test payment `pay_TrPtgJ3RVnzzFi`. | Razorpay Test Mode |
| Test refund | ₹1 refund `rfnd_TrPyItqZ6h7Dgo`, receipt `4346a484-f85d-4c3c-bc61-2f416aabd586`. | Razorpay Test Mode |

## Demo cases (all four pass)
| Case | Result | Reason |
| --- | --- | --- |
| No approval | REFUSED | `reject-manager-approval-required` |
| Approved, ₹1 | APPROVED | Refund `rfnd_TrPyItqZ6h7Dgo`; record verifies offline |
| Over limit, ₹8 | REFUSED | `NOT_AUTHORIZED`: grant caps refunds at ₹5 |
| Replay | REFUSED | `signal-state-verification-violation`: approval already used |

## Open
1. **Agent Studio registration:** Razorpay has to register the MCP server as a custom connector, using the URL above and the token from the password manager. Public docs don't show a self-serve path.
2. **Dashboard check:** confirm in Razorpay Test Mode that `rfnd_TrPyItqZ6h7Dgo` shows ₹1 on `pay_TrPtgJ3RVnzzFi`, and that no other refunds appear.
3. **Clean-ups:**
   - Delete `approval.json` from `D:\last\parmana-core`. It's already used, but there's no need to keep it.
   - Duplicate pending policy change `cf85a4af-082a-424a-a646-31acc1cf8019`. It matches the policy in force. The governance script can't reject it, so it stays pending. It doesn't block anything.
   - The setup script's step 7 can't read the production URL from `vercel ls` when output is piped. It needs a fix, which needs a commit.
   - Confirm the maker key and step-up key are saved in the password manager.

## Notes
- Secrets printed in the chat during setup no longer work, and none is stored in the repo. The live agent key and MCP token are only in the encrypted store and the password manager.
- Deployment protection is on for the MCP project. Requests with the bearer token still work.
