# 2.46 An Approver Is Notified When a Request Waits Only for Their Approval

Source: CLAIMS.md (commit d1d63c6), lines 553-584.

## Exact claim text

## 2.46 An Approver Is Notified When a Request Waits Only for Their Approval

**Claim.** When a request is refused only because a signed approval is missing, Parmana can notify an approver. It sends one `approval.needed` event that names what to sign. A failed notification never changes the refusal.

**Behaviour.**

- The engine notifies only after a refusal by the policy's own rules, or by an approval that did not verify. It does not notify for a binding, governance or business-validation failure, because an approval cannot cure those.
- The event is sent only when the same policy, evaluated with the declared approval signals set to true, would approve. The check is `findNeededApprovals`.
- The event carries the business transaction, the decision, the action, the target, the policy and version, the reason, the submitting caller when known, and the approvals needed.
- Delivery is best effort: one attempt, no retry. Any error is logged and never rethrown.

**Webhook.** Set `APPROVAL_WEBHOOK_URL` and `APPROVAL_WEBHOOK_SECRET`. The URL must be `https` outside `test` and `development`. Requests do not follow redirects and time out after 3 seconds. Each request is signed with HMAC SHA256 over `<timestamp>.<body>`, keyed with the secret, and sent in the `parmana-webhook-signature` header.

**Email.** Set `APPROVAL_EMAIL_TO` to send the same event by email through Resend, alone or alongside the webhook. Each refusal uses one idempotency key, `approval-needed/<decisionId>`. The sender address must be on a domain verified in Resend.

**Scope and limits.**

- Notification is advisory. It does not approve anything, and a receiver that ignores it changes nothing.
- No test in this repository runs the engine path end to end. The unit tests cover the finder and the bootstrap wiring. The claim about when the engine notifies is stated from the code.

**Evidence.**

- `packages/runtime/src/ApprovalNeededNotifier.ts` (`findNeededApprovals`, the event shape)
- `packages/runtime/src/RuntimeEngine.ts` (`notifyApprovalNeeded` and its conditions; errors logged, not rethrown)
- `packages/runtime/tests/unit/findNeededApprovals.test.ts` (names the approval when it is the only thing missing; undefined when another rule refuses; undefined for a policy without approval signals; leaves out what the Intent does not declare)
- `packages/api/src/bootstrap/createApprovalNeededNotifier.ts` (the webhook: https, no redirects, 3-second timeout, the signature)
- `packages/api/tests/unit/bootstrap/create-approval-needed-notifier.test.ts`
- `packages/api/src/bootstrap/createEmailApprovalNeededNotifier.ts` (Resend delivery and the idempotency key)
- `packages/api/tests/unit/bootstrap/create-email-approval-needed-notifier.test.ts`

Dated updates are in [CLAIMS-CHANGELOG.md](CLAIMS-CHANGELOG.md).

## Cited evidence paths

- `packages/api/src/bootstrap/createApprovalNeededNotifier.ts`: EXISTS
- `packages/api/src/bootstrap/createEmailApprovalNeededNotifier.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-approval-needed-notifier.test.ts`: EXISTS
- `packages/api/tests/unit/bootstrap/create-email-approval-needed-notifier.test.ts`: EXISTS
- `packages/runtime/src/ApprovalNeededNotifier.ts`: EXISTS
- `packages/runtime/src/RuntimeEngine.ts`: EXISTS
- `packages/runtime/tests/unit/findNeededApprovals.test.ts`: EXISTS

## Test results from the full run (vitest, 403 files, 0 failed; run with PostgreSQL 16 test database and migrations applied)

| Test file                                                                         | Status | Tests | Passed | Skipped |
| --------------------------------------------------------------------------------- | ------ | ----- | ------ | ------- |
| `packages/api/tests/unit/bootstrap/create-approval-needed-notifier.test.ts`       | passed | 7     | 7      | 0       |
| `packages/api/tests/unit/bootstrap/create-email-approval-needed-notifier.test.ts` | passed | 10    | 10     | 0       |
| `packages/runtime/tests/unit/findNeededApprovals.test.ts`                         | passed | 4     | 4      | 0       |
