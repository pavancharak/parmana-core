# Razorpay refund agent through Parmana: progress

Status as of 2026-10-23. Test mode only. No real money has moved yet.

## Goal
A Razorpay Agent Studio agent proposes a refund to Parmana. Parmana decides, using a signed manager approval and an agent grant. On release, the endpoint refunds the payment in Razorpay test mode.

## Done
| Area | What | Where |
| --- | --- | --- |
| Refund agent | Checks the input, asks Parmana to release `razorpay:refund`, returns APPROVED or REFUSED. Tests pass. | `examples/razorpay-refund-agent/` (parmana-core, merged in PR #59) |
| Agent Studio MCP server | One tool, `propose_refund`. Bearer token required. Tests pass. | `examples/razorpay-agent-studio/` (parmana-core, merged in PR #59) |
| Setup script | Creates the agent key and token, stores them encrypted, sets Vercel secrets, deploys, and runs checks. Not yet run end to end. | Local copy only; the commit was blocked |
| MCP server live | `https://parmana-agent-studio-mcp.vercel.app/api/mcp`. Returns 401 without a token, 200 with it. | Vercel project `parmana-agent-studio-mcp` |
| Razorpay endpoint live | Rejects unsigned requests as expected. | `https://parmana-razorpay-demo.vercel.app/api/refund` |
| Agent key | `razorpay-demo-agent` created and accepted by Parmana (200). | Parmana live key list |
| Key list | All four keys present: `maker-pavan`, `checker-pavan`, `paytm-refund-agent`, `razorpay-demo-agent`. | Parmana live key list |
| Maker key | Regeneration started. The new maker key must be saved (if not done yet). | Local |
| Checker key | Regenerated. Step-up key saved to `parmana-checker\step-up.private.pem`. | Local |
| Connector | `razorpay:refund` active, pointing at the endpoint above. | Parmana |
| Policy | `razorpay-refund` 1.0.0 in force. | Parmana |
| Grant | Old grant revoked (it had expired). New grant approved: up to 500 paise (₹5) per request, until 2026-10-30. | Parmana |

## Open
1. **Test payment:** a captured ₹10 Razorpay test payment (`pay_...`). Needed for test refunds.
2. **Manager approver key:** needed to sign the approval for the "approved" test case.
3. **Test refunds:** run the four `send.ts` cases (no approval, approved, over limit, replay).
4. **Agent Studio:** register the MCP server as a custom connector. Razorpay has to do this; public docs don't show a self-serve path.
5. **Clean-ups:**
   - Pending duplicate policy change `cf85a4af-082a-424a-a646-31acc1cf8019`. It matches the policy already in force. The governance script can't reject it, so it stays pending. It doesn't block anything.
   - The setup script's step 7 can't read the production URL from `vercel ls` when output is piped. It needs a fix, which needs a commit.
   - Save the maker key and step-up key in the password manager, if not already done.

## Notes
- Secrets were printed in the chat during setup. Those values no longer work, and none is stored anywhere. The live agent key and MCP token are only in the encrypted store and the password manager.
- Deployment protection is on for the MCP project. Requests with the bearer token still work.
