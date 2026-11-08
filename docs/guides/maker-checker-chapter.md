# Maker-checker, step-up, and capabilities

This chapter explains how a change to Parmana's governed setup is proposed, reviewed, and approved. It covers four kinds of change: policies, capabilities (external connectors), signal sources, and authority grants. Each step names the code or claim that enforces it.

**Sources.** Route and service code in `packages/api/src/routes/pending-policy-changes.ts`, `packages/api/src/governance/`, and `packages/api/src/auth/PolicyChangeStepUpVerifier.ts`. Claims 2.42, 2.43, 2.54 and 2.55 in `docs/internal/CLAIMS.md`. The command-line helper is `examples/live-checks/governance.ts`.

---

## 1. The idea in one paragraph

A **maker** proposes a change. A **checker** reviews it and approves it. The two must be different callers, and the checker must also sign a short-lived **step-up** proof, separate from the bearer token. Nothing changes until that approval is recorded. A change that is rejected leaves no effect.

## 2. Terms

- **Maker.** A human caller that proposes a change. The caller is identified by its API key, and it must be a human caller (`isHumanCaller`).
- **Checker.** A human caller that approves or rejects a pending change. A checker must be listed for that policy in `POLICY_CHANGE_CHECKERS`.
- **Pending change.** The proposed change, in state `PENDING_APPROVAL`, until a checker acts on it.
- **Step-up.** A short signature from the checker's step-up key, made at the moment of approval. It is valid for 120 seconds at most, and it is single-use.
- **Approval record.** A signed record that the change was approved, written when the approval goes through.
- **Capability.** A named action an agent may request, such as `razorpay:refund`. It is bound to an external endpoint, a policy, and the parameters it may carry.
- **Signal source.** An outside system that can establish a fact a policy needs. Like capabilities, it is registered through maker-checker.
- **Grant.** Permission for one agent to use one capability, up to a stated limit, for a stated number of days.

## 3. The four kinds of change

| Kind        | What it changes                          | Propose                                         | Approve                                             |
| ----------- | ---------------------------------------- | ----------------------------------------------- | --------------------------------------------------- |
| `policy`    | A policy version used for decisions      | `POST /policies/:name/:version/pending-changes` | `POST /policies/pending-changes/:id/approve`        |
| `connector` | A capability and its endpoint            | `POST /external-connectors/changes`             | `POST /external-connectors/changes/:id/approve`     |
| `source`    | A signal source and its public key       | `POST /business-signal-sources/changes`         | `POST /business-signal-sources/changes/:id/approve` |
| `grant`     | An agent's authority to use a capability | `POST /authority-grants/changes`                | `POST /authority-grants/changes/:id/approve`        |

The router mounts for these four kinds are `/policies`, `/external-connectors`, `/business-signal-sources` and `/authority-grants` (`packages/api/src/app.ts`). The `approve` and `reject` paths in the table are the policy routes I read in `pending-policy-changes.ts`. For the other three kinds, I confirmed the mount point, not the sub-paths. Check the route files, or `openapi/openapi.yaml`, for the exact paths and bodies before using them.

## 4. Step by step: a policy change

### Step 1. The maker proposes

The maker sends the proposed policy with the policy's name and the version it replaces. The server:

1. Rejects the request with HTTP 400 if the name or version is not made of letters, digits, dots, underscores or hyphens. A name is used as a path segment, so anything else is refused.
2. Checks that the caller is a human caller.
3. Stores the change as `PENDING_APPROVAL` with `proposedBy` set to the maker's caller id.
4. Returns HTTP 201 with the change id.

Nothing is live yet. The current policy version is unchanged.

### Step 2. The checker reviews

The checker reads the pending change (`GET` on the pending-changes route). The governance script prints the change and waits for the checker to type `APPROVE`. The script does not approve anything by itself.

### Step 3. The checker approves

The approve route checks these, in order:

1. **The caller is a human caller.** Anything else is refused.
2. **The maker is not the checker.** If `proposedBy` equals the caller, the request fails with `SameActorCannotApproveOwnChangeError`. A maker cannot approve their own change.
3. **The checker is in scope for this policy.** The caller must be listed for that policy in `POLICY_CHANGE_CHECKERS`. If not, the response is HTTP 403 with `CHECKER_NOT_IN_SCOPE`. This check comes before the signature check, so an out-of-scope caller is refused without any signature work.
4. **The change is still pending.** A rejected or already approved change returns 409. This check also comes before the step-up check, so a spent envelope is not used up by a request that could not succeed.
5. **A valid step-up signature is presented.** The step-up must name this pending change and the action `approve`, be signed by the checker's step-up key, and expire no more than 120 seconds after it was made. Its nonce must not have been seen before.
6. **The approval is applied.** The service writes the live policy file and a signed approval record first. Only after both succeed is the change marked `APPROVED`. If the write fails, the change stays `PENDING_APPROVAL`, not falsely approved.

If the same approver retries after a partial failure, the service reuses the approval record the first attempt wrote, and does not sign a second one. Any other approver who tries gets a 409.

### Step 4. The rules after approval

- The policy version becomes live only through an approved change. A deploy cannot change it (claim 2.43).
- An older approved version is refused for every policy, so an approver cannot roll back to a weaker version by naming it. Approving an older version again is the way to roll back (claim 2.44, gap G-74).

## 5. Step by step: the step-up signature

1. The checker signs, with their step-up key, an envelope that names the pending change, the action (`approve` or `reject`), and an expiry.
2. The envelope's lifetime must not exceed 120 seconds. A longer envelope is refused, so a compromised signer cannot mint long-lived approvals.
3. The server checks the signature, the expiry, that the change id and the action match, and that the nonce has not been seen before.
4. Once checked, the nonce is spent. A replayed envelope is refused.

The governance script prints the change and waits for `APPROVE` before it signs. The step-up key stays on the checker's machine. It is never sent to the server.

## 6. Capabilities (external connectors)

A capability is what lets an agent cause an action in an outside system. Registering one is a maker-checker change, like a policy.

**What a capability record holds:** the capability name (for example `razorpay:refund`), the endpoint URL that receives releases, the policy that governs it, and the parameters the endpoint may receive (for example `amount`).

**Steps:**

1. **Propose.** Maker runs:

   ```bash
   npx tsx examples/live-checks/governance.ts propose-connector --capability <name> \
     --endpoint-url <https URL> --policy <policy name> --allowed-parameters amount
   ```

2. **Check.** The checker confirms the capability name, the endpoint, the policy, and the parameters.
3. **Approve.** The checker runs `approve --kind connector --id <id>` with the step-up key.
4. **Effect.** Once approved, Parmana will release actions for that capability to the endpoint. A release names the endpoint's URL as its audience, and the endpoint refuses a release made for any other URL.

**What the endpoint must do:** verify Parmana's signature, check the audience, refuse capabilities it does not serve, and act only on the parameters the capability allows. The refund endpoint in section 5 of the Razorpay book is an example.

**Revoking** a capability is also a maker-checker change: `propose-revoke --kind connector`, then an approval.

## 7. Signal sources

A signal source is an outside system that Parmana asks for a fact a policy needs. The source must be registered before a policy can rely on it.

**Steps:**

1. **Propose.** Maker names the source, its endpoint, and the public key Parmana will use to check answers:

   ```bash
   npx tsx examples/live-checks/governance.ts propose-source --name <name> \
     --endpoint-url <https URL> --public-key-file <file> --key-id <key id>
   ```

2. **Approve.** Checker approves with the step-up key.
3. **Use.** A policy names the source in its `signalSources`. Parmana sends a signed query, and the source's answer is checked against the registered key (claim 2.54).

A source that is registered but unreachable is recorded as unavailable. The policy then refuses. It does not approve on a guess.

## 8. Authority grants

A grant lets one agent use one capability, within a limit, for a set time.

**Steps:**

1. **Propose.** Maker names the agent's caller id, the capability, the maximum amount per request, and the number of days the grant is valid:

   ```bash
   npx tsx examples/live-checks/governance.ts propose-grant --caller-id <agent id> \
     --capability <name> --max-amount <amount> --valid-days <days>
   ```

2. **Approve.** Checker approves with the step-up key.
3. **Check before use.** A policy that requires a grant (`requireAuthorityGrant`) refuses a request unless the agent holds a grant in force, within its limit, made through maker-checker (claim 2.55).
4. **Revoke.** `propose-revoke --kind grant`, then an approval.

**Limits, stated plainly:** a grant's limit applies to each request. It is not a running total for the day. Cumulative limits are not built, and this is open gap G-93.

## 9. Approval issuers (who may sign approvals)

A signed human approval is only as trusted as the approver's key. Approvers are listed in `TRUSTED_APPROVAL_ISSUERS`. An approval signed by anyone else is refused (claim 2.42).

Adding an approver is also a maker-checker change: `propose-issuer` with the approver's id, key id and public key, a stated reason, then `approve-issuer` with the step-up key.

Claim 2.42 notes that approvers are not limited per action (gap G-50). Any listed approver can sign for any action.

## 10. Checks you can run

| Check                       | Command or place                                  | What a pass looks like                                  |
| --------------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| The change is pending       | Read the pending-changes route for the id         | `PENDING_APPROVAL`                                      |
| The checker is in scope     | `POLICY_CHANGE_CHECKERS` on the server            | The checker's caller id appears under the policy's name |
| Maker is not checker        | Compare `proposedBy` with the checker's caller id | They differ                                             |
| The step-up is valid        | Approval succeeds                                 | HTTP 200 and the change becomes `APPROVED`              |
| The live version is correct | Read the policy in effect                         | The approved version, and no older one                  |
| The approval record exists  | The approval-record repository, for that change   | One record for the change                               |

## 11. Troubleshooting

| Response or message                                   | Meaning                                                                        | What to do                                                                                                                          |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `SameActorCannotApproveOwnChangeError`                | The checker is the maker                                                       | A different person must approve                                                                                                     |
| HTTP 403 `CHECKER_NOT_IN_SCOPE`                       | The caller is not listed for this policy                                       | Add the caller to `POLICY_CHANGE_CHECKERS`, or use a listed checker. The variable is read at startup, so redeploy after changing it |
| HTTP 409 on approve                                   | The change is not pending, or another approver already approved it             | Read the change's state. Nothing needs to be redone if it is already approved                                                       |
| Step-up refused: expired                              | The envelope lived more than 120 seconds, or it was used after it expired      | Sign a new one and approve immediately                                                                                              |
| Step-up refused: nonce                                | The envelope was already used                                                  | Sign a new one                                                                                                                      |
| Step-up refused: action or change id mismatch         | The envelope names a different change or action                                | Sign for this change id and the action `approve`                                                                                    |
| HTTP 400 on propose                                   | The name or version contains characters outside letters, digits, `.`, `_`, `-` | Use a name that matches the pattern                                                                                                 |
| `POLICY_CHANGE_CHECKERS is not valid JSON` at startup | The variable is malformed                                                      | Fix it to an object of policy name to array of caller ids                                                                           |
| Approval fails after the write                        | The file write or the record failed                                            | The change stays `PENDING_APPROVAL`. The same approver can retry, and the service reuses the record                                 |
| Policy refused after approval: older version          | An older approved version is in use                                            | Approve the version you want, which rolls back to it (claim 2.43)                                                                   |

## 12. Not covered in this chapter

- The exact request and response bodies. Use `openapi/openapi.yaml`.
- The reject routes, and the rules for revoking a grant or a source. They follow the same shape as approval.
- The approval-issuer routes in detail. Read `packages/api/src/routes/approval-issuers.ts`.
- The external-connector route bodies. Read `packages/api/src/routes/external-connectors.ts`.
- How to generate and store step-up keys and approver keys. These are operational. Keep them in the password manager and the credential runbook, not in documents.
