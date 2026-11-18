# Design: source integration for policy version 2, and the first two capabilities

Status: reference draft. Written from the code as it is on `main`, with assumptions marked **[ASSUMED]**. Each assumption must be confirmed or replaced by the owner before the design is built or any capability is enabled. Do not treat an assumption as a decision.

Related: `docs/internal/runbooks/POLICY-V2-ENABLEMENT.md` (how a capability is enabled), and the policy version 2 guide on the docs site.

## 1. Purpose

A policy version 2 rule can read a **sourced value**: a fact that a registered business system establishes and signs. A rule that reads a sourced value counts it only if the signature verifies. No source integration is connected in this build, so a rule that reads a sourced value refuses every decision with `SOURCE_UNAVAILABLE`. This design says how sources are connected, and which two capabilities go first.

## 2. Assumptions

| #   | Assumption                                                                                                                                                              | Why it matters                                |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| A1  | The accounts system that holds invoices is **[ASSUMED]** a system the business runs itself, reachable from our deployment. Its name, API and hosting are not known.     | Decides who signs the invoice answers.        |
| A2  | The `erp:invoice-pay` rules need three sourced values: **invoice amount**, **vendor identifier**, and **vendor status** (for example, active or blocked). **[ASSUMED]** | Decides the claims each source must sign.     |
| A3  | `crm:read` **does not** need a sourced value. Its rules use the requester's identity and the account's ownership, which come from the request. **[ASSUMED]**            | If wrong, `crm:read` also waits for a source. |
| A4  | The people in the runbook (owner Mohinder, successor Pavan, gate owners Asha and Mamta, reviewers Shalini and Mahendra) apply to both capabilities. **[ASSUMED]**       | Decides who can approve and run the gate.     |
| A5  | No live invoice data is used until the owner approves the step in section 9. **[ASSUMED]**                                                                              | Decides where the tests run.                  |

## 3. What already exists (from the code)

- **The register's source model.** A source is registered with `POST /sources`, then approved with `POST /sources/{name}/approve`, and revoked with `POST /sources/{name}/revoke`. A source has a name, a signer kind, a registered key, and the claims it may answer. A source must register a public key. Answers that are not signed are untrusted.
- **The signed answer contract** in `packages/policy/src/v2/sourceAnswer.ts`. An answer carries: the source, the key id, the claim, the subject, the value, an optional unit, the action, the transaction id, a nonce, the observation time and the expiry. It is signed with Ed25519 over a canonical form.
- **The verifier.** It accepts an answer only when every check passes, and it names the check that failed. The checks and their refusal codes are: `UNSIGNED`, `MALFORMED`, `QUERY_MISMATCH` (the answer must match the question exactly), `UNKNOWN_KEY`, `KEY_REVOKED`, `BAD_SIGNATURE`, `NOT_YET_VALID`, `EXPIRED`, and `REPLAYED`. Clocks may differ by up to 60 seconds.
- **Nonces.** A nonce store records each nonce once, so an answer cannot be used twice. The store is shared by all processes.
- **The decision service** verifies each sourced answer with the verifier before it uses the value.

## 4. What does not exist yet

1. **A source integration in the deployment.** The decision service's `sources` option is a function that throws `No source integration is connected.` (`packages/api/src/policyV2/createPolicyV2Runtime.ts`).
2. **An endpoint that receives signed answers.** No route in `packages/api/src/routes` accepts an answer. The integration must add one, or the accounts system's adapter must call the decision path in another agreed way.
3. **A way for the accounts system to hold a source key** that Parmana trusts, with rotation.

## 5. Target design for the source integration

### 5.1 Shape

```
accounts system  --(adapter signs answer)-->  answer endpoint  -->  verifier  -->  decision service
                                                                        |
                                                  register: source key, claims, revocation
```

The adapter runs next to the accounts system. It holds the source's private key. The Parmana deployment holds only the public key, registered in the register. Parmana never holds the accounts system's private key.

### 5.2 Registration (the register, through HTTP)

1. The source owner registers the source with its name, its signer kind and its public key.
2. The second approver approves the source.
3. The source is listed with exactly the claims it may answer: `invoice.amount`, `vendor.id`, `vendor.status` **[ASSUMED]**.

### 5.3 Answer flow for one decision

1. A caller asks for `erp:invoice-pay` with a transaction identifier.
2. The decision service asks the source, through the answer path, for each claim the policy reads. Each question names the source, the claim, the subject (for example, the invoice identifier), the action and the transaction identifier.
3. The adapter answers with a signed payload that matches the question exactly.
4. The verifier checks the answer. If it fails, the decision refuses and records the check that failed.
5. The decision uses only verified values.

### 5.4 Failure behaviour (the design's rule)

- Any failed check refuses the decision. The refusal names the check. Nothing is guessed.
- If the accounts system does not answer in time, the decision refuses as `SOURCE_UNAVAILABLE`. It is not approved by default.
- A revoked key refuses every answer from that source (`KEY_REVOKED`).

### 5.5 Key lifecycle

- **Rotation:** register the new key, approve it, have the adapter sign with the new key id, then revoke the old key. Both keys may be active for a short overlap, and the overlap is recorded.
- **Compromise:** revoke the key at once. Every answer from it then refuses with `KEY_REVOKED`.
- **Retirement:** revoke the source. Its claims stop counting.

### 5.6 What is logged

Every answer, accepted or refused, is recorded with its refusal code, so the evidence log can show why a decision used or did not use a value.

## 6. The first capability that needs no source: `crm:read`

Under assumption A3, `crm:read` does not need the integration. Its rules are these **[ASSUMED, for the owner to confirm or replace]**:

- A read is allowed only when the requester is the named owner of the customer account.
- The answer includes only the fields the owner's role may see: name and contact details. Balances and history are not included.
- Every read is recorded in the evidence log.
- A read outside these rules is refused, with the rule that refused it named.

Enabling `crm:read` does not depend on section 5. It tests the enablement process, the register, the go-live gate and the evidence log, and it is the right first capability.

## 7. The second capability: `erp:invoice-pay`

Under assumptions A1 and A2, the rules read these sourced values:

| Value             | Claim            | Source          | Used for                       |
| ----------------- | ---------------- | --------------- | ------------------------------ |
| Invoice amount    | `invoice.amount` | accounts system | the amount threshold and tiers |
| Vendor identifier | `vendor.id`      | accounts system | matching the payee             |
| Vendor status     | `vendor.status`  | accounts system | refusing blocked vendors       |

The rules send a payment to review above a registered threshold, and refuse a blocked vendor. The thresholds and tiers are not decided here; they are a business decision for the owner and must be registered and approved under the register's threshold process.

`erp:invoice-pay` cannot be enabled until section 5 is built and tested, and the source is registered and approved.

## 8. Test plan

1. **Unit tests** for the answer endpoint: a valid answer is accepted; each refusal code is produced by the matching failure.
2. **A fixture source** in the test environment, with a test key that is never used in production. It answers the three claims.
3. **End-to-end in staging:** a decision for `erp:invoice-pay` uses the fixture source, and the evidence log shows each answer and its check.
4. **Failure tests:** an expired answer, a replayed nonce, a revoked key and an unavailable source each refuse the decision with the expected code.
5. **No live invoices** are used in tests, and no production key is registered in staging.

## 9. Rollout

1. Confirm assumptions A1 to A5. Record the answers in this document.
2. Enable `crm:read` through `POLICY-V2-ENABLEMENT.md` (staging, then production).
3. Build section 5 in a branch, with the tests in section 8, and review it.
4. Register the accounts system's source in staging with a test key. Test end to end.
5. Owner approval to register the production source key.
6. Enable `erp:invoice-pay` through `POLICY-V2-ENABLEMENT.md`, staging first, then production.

## 10. Open questions for the owner

1. Which accounts system holds the invoices, and can it run an adapter next to it?
2. Are the three claims in section 7 the right set?
3. Are the `crm:read` rules in section 6 right?
4. Who holds the accounts system's signing key, and who rotates it?
5. Is a fixture source in staging acceptable before any production source exists?

## 11. Decision log

| Date       | Decision                                                          | By                       |
| ---------- | ----------------------------------------------------------------- | ------------------------ |
| 2026-11-18 | Design drafted from the code on `main`, with assumptions A1 to A5 | Claude, for owner review |
