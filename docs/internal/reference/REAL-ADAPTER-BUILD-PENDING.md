# Procedure: build the real source adapter (PENDING)

> **Status: PENDING.** This procedure cannot start until the owner names the accounts system and gives its API documentation or a sandbox. Until then, nothing here is built or decided.
>
> **REFERENCE ONLY. NOT A REAL RECORD.** This is a procedure. It is not a decision, an approval, a register entry or a test result.

## 0. What must be true before you start

| Requirement                                                                                  | Who supplies it  | Status              |
| -------------------------------------------------------------------------------------------- | ---------------- | ------------------- |
| The accounts system's name                                                                   | Owner (Mohinder) | PENDING             |
| Its API documentation, or a sandbox with test invoices                                       | Owner            | PENDING             |
| Who may hold the adapter's private key                                                       | Owner            | PENDING             |
| The three claims and their units (`invoice.amount`, `vendor.id`, `vendor.status`), confirmed | Owner            | ASSUMED, to confirm |
| The fixture adapter and the source client, merged                                            | Engineering      | DONE (#733)         |

Do not start with a live accounts system. Use its sandbox, or a read-only test account, until section 5 is approved.

## 1. What the adapter does

The adapter runs beside the accounts system. Parmana calls it for each sourced claim. It:

1. checks the bearer token Parmana sends;
2. looks up the invoice (the subject) in the accounts system;
3. reads the value for the claim asked;
4. builds an answer payload and signs it with the source's private key;
5. returns `{ payload, signature }`.

It never decides anything. Parmana verifies the answer.

## 2. The contract (already in the code)

- **Route:** `POST {base}/answers`, JSON body is the query `{ source, claim, subject, action, transactionId }`.
- **Auth:** `Authorization: Bearer <token>`. Compare the token in constant time. Reject any other token with HTTP 401.
- **Success:** HTTP 200, body `{ payload, signature }`, built with `signAnswer(payload, privateKey)` from `@parmana/policy` (`packages/policy/src/v2/sourceAnswer.ts`).
- **Unknown source, claim or subject:** HTTP 404. Never guess a value.
- **Incomplete query:** HTTP 400.
- **Any other fault:** HTTP 500, with no detail in the body.

The fixture adapter (`test-support/policy-v2-fixture-source.ts`) shows the same contract. Copy its behaviour, and replace its invoice table with a real lookup.

## 3. Payload rules (non-negotiable)

- **`source`, `keyId`, `claim`, `subject`, `action`, `transactionId`:** copied from the query and the registered key id. They must match exactly, or Parmana refuses with `QUERY_MISMATCH`.
- **`value`:** the value read from the accounts system. Never a default.
- **`unit`:** the unit registered for the claim (`USD` for `invoice.amount`). Omit it for claims with no unit.
- **`nonce`:** a new random value for every answer (`randomBytes(16)`). Never reuse one (`REPLAYED`).
- **`observedAt`:** the time the value was read.
- **`expiresAt`:** `observedAt` plus 5 minutes (PROPOSED; the owner may change it). Clocks may differ by up to 60 seconds.

## 4. Build steps

1. **Choose the place.** A new service, or a module next to the accounts system's existing integration. Record the choice in the change record (`12-change-record-template.md`).
2. **Get the key.** Generate an Ed25519 key pair as `08-source-key-management.md` says. Give only the public key (PEM, SPKI) to the source owner. Store the private key in the adapter's secret store.
3. **Implement the lookup.** Read the three claims from the accounts system. Keep the mapping in one table, so each claim is visible in review.
4. **Implement the route** in section 2, with the token check first.
5. **Test.** Unit tests: each refusal (401, 404, 400, 500) and the payload rules in section 3. Use the test key. Reuse the adapter tests in `packages/api/tests/unit/policyV2FixtureAdapter.test.ts` as the model.
6. **Review and merge** through a pull request. Two reviewers, neither the adapter's author.
7. **Deploy to the sandbox only.** Check it answers a test query, and that the answers verify with `verifySourceAnswer`.

## 5. Approval before production

The adapter does not touch production until the owner approves in writing. Record the approval in `08-source-key-management.md`, in the key log, with the key id and the date.

## 6. Done means

- [ ] The adapter answers the three claims from the sandbox, and each answer verifies.
- [ ] Each refusal in section 2 is tested.
- [ ] The key is registered and approved (`08`).
- [ ] The owner has approved the production step in writing.
