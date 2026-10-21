# Approval issuers runbook

Who may sign an approval artifact that Parmana trusts, how an issuer is added or revoked, and what is still open. Written from `packages/api/src/bootstrap/codeApprovalIssuers.ts`, `packages/api/src/routes/approval-issuers.ts`, and the gap register `docs/VERIFICATION-GAPS.md` (G-50, G-68).

**Read first:** [README.md](README.md) for the rules that apply to every runbook.

**Not the same as policy-change checkers.** A policy-change checker is listed in `POLICY_CHANGE_CHECKERS` and signs a step-up envelope ([POLICY-CHANGE-APPROVAL.md](POLICY-CHANGE-APPROVAL.md)). An approval issuer signs an *approval artifact*, which Parmana checks before it releases an action. Different keys, different checks.

---

## 1. Where a trusted issuer comes from

Two sources, in this order:

1. **Reviewed code.** `TRUSTED_APPROVAL_ISSUERS` in `codeApprovalIssuers.ts`. Each entry names the `approverId`, the `keyId`, the public key as PEM (`publicKeyPem`), and whether it is `revoked`. Public keys are not secret, and this list is reviewed like any other code change.
2. **A key file** (fallback). `$PARMANA_KEY_DIR/approval-issuers/<approverId>__<keyId>.public.pem`. On Vercel the key directory is filled only from `PARMANA_KEY_MATERIAL_JSON`, which cannot create that subfolder, so use source (1) on Vercel.

**Startup refuses** a trusted issuer whose file is missing, whose key does not parse, whose key is not Ed25519, or that appears twice. The message names the issuer.

**Current state** (check the file, do not trust this page): one entry, `manager-charak1987` / `manager-charak1987-key-1`, with `revoked: true`. No active issuer is in the code list.

---

## 2. Test mode

`PARMANA_TEST_APPROVER_PUBLIC_KEY_FILE` trusts one local test approver, `local-test-approver`. It works only when `NODE_ENV=test`. Set anywhere else, the server refuses to start, so a key cannot be trusted from the environment in production.

---

## 3. Add or revoke an issuer through the API

Both actions are proposed, then approved by a different human checker with a step-up envelope. The routes are under `/approval-issuers`.

| Step | Request |
|---|---|
| Propose | `POST /approval-issuers/changes` with `{"action":"add","approverId","keyId","publicKeyPem","reason"}` or `{"action":"revoke","approverId","keyId","reason"}` |
| List changes | `GET /approval-issuers/changes` |
| Approve | `POST /approval-issuers/changes/<id>/approve` with `{"stepUpAuthorization": ...}`, signed with action `approve` |
| Reject | `POST /approval-issuers/changes/<id>/reject`, signed with action `reject` |
| List issuers | `GET /approval-issuers/` |

Rules the server enforces:

- `approverId` and `keyId` match `^[A-Za-z0-9._-]{1,128}$`. Anything else is refused with `400`.
- `publicKeyPem` is for `add` only. Sending it with `revoke` is refused.
- Every route needs a human caller (`USER`). The proposer may not approve their own change.
- Approval needs a valid step-up envelope for that change ID and action.

**Check after approval:** `GET /approval-issuers/` must list the issuer with the expected state. Approval writes through the approval-issuer repository, so if the issuer is missing or in the wrong state, read the approval route and that repository before assuming the change applied.

---

## 4. Revoke an issuer in an emergency

Revocation is the fastest way to stop an approver's signatures from being trusted.

1. If the issuer is in code, the reviewed change is to set `revoked: true` on its entry in `TRUSTED_APPROVAL_ISSUERS`, then build and redeploy ([LOCAL-DEVELOPMENT.md](LOCAL-DEVELOPMENT.md), section 3; [PRODUCTION-DEPLOY-AND-ROLLBACK.md](PRODUCTION-DEPLOY-AND-ROLLBACK.md), section 2).
2. If you need it done immediately, propose a `revoke` through the API (section 3), and get a second checker to approve it. The approval needs a step-up key, so have the checker's key and envelope ready before you start.
3. Tell the approver's key holder to stop using the key, and rotate it if it may be exposed ([KEY-ROTATION.md](KEY-ROTATION.md) covers the key handling; approval keys follow the same rules).

---

## 5. What is still open

From `docs/VERIFICATION-GAPS.md`:

- **G-50 (open for approval issuers).** An approval issuer is not limited to particular policies or actions. Any provisioned issuer can sign approvals for any policy. The policy-change checker list (`POLICY_CHANGE_CHECKERS`) does not apply to issuers.
- **No quorum.** One approver is enough.
- **No role check.** `credentialHolderType` is operator-provisioned configuration. It is not proof that a business authority approved.

Until these are closed, the claim the system can make is that an execution matches what a human checker approved. It cannot yet claim that the execution is within business authority bounds. Use the first wording in any external statement.

---

## 6. Checklist before adding an issuer

- The key pair was generated on a machine you control, and the private key stays with the approver.
- The public key is Ed25519 and parses (startup will refuse otherwise).
- The `approverId` and `keyId` follow the naming rule.
- A second person has reviewed the reason for the addition.
- The change is recorded in the PR or the approval record, with the reason.
