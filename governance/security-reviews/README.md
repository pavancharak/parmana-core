# Security review: summary and open items

Source: the `pavancharak/findings` repository, on its default branch and its `findings/progress-2026-11-08` branch, as of 8 November 2026. The files next to this one are copied unchanged:

- `FINAL-REPORT.md` (7 November 2026): the first final report.
- `FINAL-REPORT-2.md` (8 November 2026): the second final report, covering what the first does not.
- `FINDINGS.md`: the chronological record, updates 1 to 42.
- `FINDINGS-2.md`: updates 43 to 48.
- `PROGRESS-2026-11-08.md`: the resume point and the state of each branch and pull request.

The RFC draft that came out of the review is `docs/internal/rfcs/RFC-0024-revision-DRAFT.md`.

These are raw review logs. They are kept as written, so this folder is excluded from Prettier (`.prettierignore`), and the documentation sync does not copy it.

## Most important open item

**Customer-refund policy 1.2.0 takes its payment checks from the caller.** `refundEligible` and `fraudCheckPassed` are declared by the caller and are not checked against the payment. Manager approval is the only control on the amount. This is a high-severity gap in production, and the policy is in this repository (`policies/customer-refund/1.2.0/policy.json`).

The agreed design, approved on 8 November, is a Razorpay signal service in `parmana-connectors`, which answers Core's signed queries, and a policy version 1.3.0 that declares the `payment.refundable` signal as required. Policy 1.3.0 needs maker-checker approval, and the read-only Razorpay key needs a decision. Neither is in place yet. See section 4 of `FINAL-REPORT-2.md`.

## Fixed and merged

- **F1, F2, F3, F4, F6** (first report): the runbook query, the release ledger tests, replay identity, the replay test, and the distrusted-root list, as recorded in the first report.
- **F7** (`parmana-connect` consumed a nonce before checking the transaction hash): fixed in `parmana-connect` #49.
- **F28-1 to F28-3** (`parmana-connectors` release path): merged in `parmana-connectors` #49 and #50.
- **F28-5** (connector identity disagreed between Core and Connectors): fixed in PR #51, and closed in production.
- **F28-7** (business conditions): merged end to end. The evaluator for `payment.refundable` is registered in the connectors service. Core binds the condition evidence into the signed record, refuses credential-shaped evidence keys, and has an end-to-end test that a failed condition stops the refund. The last test in the runtime package is still open.

## Open items

From `FINAL-REPORT-2.md`, section 11, in its order:

1. Sign off and open pull requests for the two unsigned branches listed in its section 9.
2. Maker-checker registration, policy 1.3.0 approval, and the decision on the read-only Razorpay key.
3. Merge `parmana-connectors` PR #59 only after step 7 in section 4 of that report.
4. The Trust Record end-to-end test in the runtime package.
5. Update `external-adapter.test.ts` for condition evidence.
6. **F28-4:** fix target binding in the generic connector and Paytm refunds.
7. **F28-6:** the `parmana-connect` release path omits `target`, `businessTransactionId`, and `connectorId`. Re-verify first.
8. **F26-5 and F26-8:** Paytm duplicate-refId behaviour and endpoint paths, from Paytm's documentation. Live Paytm refunds stay off until then.
9. **F26-6 and F26-7:** design notes for Zoho create and Zerodha paper orders.
10. **F9:** trace the gateway attestation and direct `ExecutionControlService.execute()` calls.
11. **F8 and F10:** decide retry or reconcile for a `begin()` failure, and confirm session consumption by the issuing instance.
12. **F11:** separate repository errors from "policy not found" in gateway diagnostics.

Also open, from the first report: the eMudhra roots that Chrome and Mozilla were still evaluating, and whether the connector adapters, `parmana-verifier` and `parmana-connect` need a further security review. `F12`, the verifier accepting schema version 2 records by default, is recorded in `FINAL-REPORT.md`.

## Open pull requests at 8 November

- `parmana-core` #504 (`feat/signal-query-parameters`): needed before the Razorpay signal service can receive the refund amount. Signed off, open.
- `parmana-connectors` #60 (the Razorpay signal service): depends on #504. Open.
