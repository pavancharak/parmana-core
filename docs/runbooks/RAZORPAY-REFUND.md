# Razorpay refund runbook

Status, branches and the steps to run the Razorpay refund demo, and what is still pending before any live money moves. The demo is in `examples/razorpay-refund/`; its own step list is `examples/razorpay-refund/README.md`. This page is the status and the order of work.

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

---

## 1. Status

| Item                                                                                               | State                                                                                                                                                                                     | Where                                                            |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Demo: agent asks for a refund, Parmana decides, a signed release goes to a small Razorpay endpoint | Built. Test mode only                                                                                                                                                                     | `examples/razorpay-refund/`                                      |
| Endpoint refuses any live key                                                                      | Built. It refuses unless `RAZORPAY_KEY_ID` starts with `rzp_test_`                                                                                                                        | `examples/razorpay-refund/razorpay.ts`                           |
| Demo tests against a fake Razorpay                                                                 | Built                                                                                                                                                                                     | `examples/razorpay-refund/tests/`                                |
| Draft production policy: manager approval, refunds up to Rs 5,000                                  | Drafted, **not approved**                                                                                                                                                                 | Branch `feat/razorpay-refund-manager-approved`, commit `e4c265e` |
| Second branch, `within-limits`                                                                     | Exists. Its latest commit is `4e79d57`. This page has not checked what it adds beyond `main`, so treat it as unverified                                                                   | Branch `feat/razorpay-refund-within-limits`                      |
| Runbook for the demo and the policy                                                                | This page                                                                                                                                                                                 | `docs/runbooks/RAZORPAY-REFUND.md`                               |
| Demo run end to end in Razorpay test mode (reported 2026-10-23)                                    | Reported by the operator in the status letter to Razorpay: a ₹1 refund approved and processed (`rfnd_TrPyItqZ6h7Dgo`); the no-approval, ₹8 over-grant and replayed-approval cases refused | Status letter dated 2026-10-23. Not in the repository            |
| Agent Studio MCP tool (`parmana-agent-studio-mcp`) deployed                                        | Deployed 2026-10-23 per `examples/razorpay-agent-studio/FOUNDER-BOOK.md`. **Not registered**: no agent has been built in Razorpay Agent Studio, so nothing there calls the tool           | `examples/razorpay-agent-studio/`                                |
| The agent live with real payments                                                                  | **Not live**                                                                                                                                                                              | Nothing deployed to take real refunds                            |
| A live Rs 1 test on the operator's own payment                                                     | **Not done**                                                                                                                                                                              | Pending, after the policy is approved                            |

The test-mode run and the Vercel deployment are operator reports, not checks in this repository. The test-mode run went through Parmana's API and the demo scripts, not through an Agent Studio agent. The refusal status is the one in the API code: a policy refusal is `403 POLICY_DENIED`, covered by the API integration tests. The status for an authority refusal (`NOT_AUTHORIZED`) is not confirmed by a test, so Razorpay's question on 403 stays open until it is.

Open decisions for Razorpay, from the status letter: how requests reach the agent (direct tool call or signed events), whether refunds up to a set amount may skip the manager approval, the per-request limit (the grant is ₹5 for testing; the draft policy allows ₹5,000), and who registers the connector.

---

## 2. What the demo proves

The four requests in the demo's README, and what each must show:

1. **No manager approval:** refused by the policy. Razorpay is never called.
2. **Approval for this payment and Rs 1, within the agent's grant:** approved, refunded once, and the signed record verifies offline.
3. **Approval for Rs 8 when the grant allows Rs 5:** refused as not authorized. A manager's signature cannot lift the limit.
4. **The approval from request 2, sent again:** refused. An approval is used once.

Each refund carries Parmana's transaction ID as its Razorpay `receipt`. The endpoint checks for that receipt before it refunds, so a repeated call does not refund twice.

---

## 3. Before you start (test mode)

- A Razorpay account in **Test Mode**, with a test key pair. The key ID starts with `rzp_test_`. Keep the secret in the password manager, and never paste it into chat.
- A captured test payment, its ID starting with `pay_`. Check its status is `captured` in the dashboard.
- The maker and checker keys, the checker's step-up key, and the approver key. The key handling is in [KEY-ROTATION.md](KEY-ROTATION.md).

Run the demo's PowerShell steps from one window, from the repository root, after `npm run build` ([LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md)).

---

## 4. Order of work

Do these in order. Each step depends on the one before it.

1. **Demo in test mode.** Follow `examples/razorpay-refund/README.md` steps 1 to 6. Record the four results.
2. **Approve the draft policy.** The policy is on `feat/razorpay-refund-manager-approved`. It must go through the normal policy change: the maker proposes, a checker approves with a step-up signature ([POLICY-CHANGE-APPROVAL.md](POLICY-CHANGE-APPROVAL.md)). Do not copy the file into production by hand.
3. **Check the approval scope.** The policy needs an approval issuer that is scoped to `razorpay:refund`. Until the approval-issuer scope work in `REMAINING-WORK.md` section N is merged and applied, do not connect a live approver to this policy.
4. **Live test, Rs 1, on your own payment.** Only after 1 to 3 are complete. Use the smallest amount, on a payment you own.
5. **Only then** consider any refund above the test amount.

---

## 5. Do not do

- Do not switch the endpoint to a live key to "try" it. It refuses a live key by design, and changing that is a code change that needs review.
- Do not approve the draft policy in production before the demo has passed in test mode.
- Do not run the Rs 1 live test before the approval-issuer scope is in place. Without it, the approval is only checked against the action, not against the policy.

---

## 6. Open questions

- Which of the two policy branches is the one to approve: the Rs 5,000 limit on `feat/razorpay-refund-manager-approved`, or the within-limits branch?
- Who is the approver for a refund, and is it the same person as the checker? Separation of duties is the open G-50 role question.
- Is there a daily limit? The demo's README says daily limits are designed but not built.

---

## 7. Keep this page current

Update section 1 each time one of the items changes state. A status here that is ahead of the code is worse than a missing one.
