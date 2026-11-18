# Build guide: the source integration for `erp:invoice-pay`

This guide is for the engineer who builds the source integration. It is step 4 of the enablement plan: build the integration, then test it in staging, then enable `erp:invoice-pay`. It follows `POLICY-V2-SOURCE-INTEGRATION.md` (the design), and it states which parts are assumptions.

**Status: not to be built until the owner confirms the assumptions in the design (section 2), and names the accounts system.** The adapter in section 5 depends on that system's API, which is not known yet. Everything else can be built and tested first with a fixture adapter.

## 1. What the code already does

- The decision service calls `deps.sources(query)` for each sourced claim, where the query has `source`, `claim`, `subject`, `action` and `transactionId` (`packages/policy/src/v2/decision.ts`, around line 360).
- The answer it gets back is checked by `verifySourceAnswer(answer, expected, { keyFor, nonces, now })` (`packages/policy/src/v2/sourceAnswer.ts`). A failed check refuses the decision, and the refusal names the check.
- If `deps.sources` throws, the decision refuses with `SOURCE_UNAVAILABLE`.
- The deployment provides `deps.sources`. Today it is a function that throws, in `packages/api/src/policyV2/createPolicyV2Runtime.ts`, inside the `new PolicyV2DecisionService({...})` call.
- `signAnswer(payload, privateKey)` and `readEd25519PublicKey(pem)` are exported from `packages/policy/src/v2/sourceAnswer.ts`.

So the integration is a **client** that Parmana calls, and an **adapter** that answers. Parmana does not receive answers at an endpoint.

## 2. What you are building

```
decision  --query-->  source client (in Parmana)  --HTTP-->  adapter (beside the accounts system)
   ^                                                              |
   |                                                              v
   +-------- verified value <-- verifySourceAnswer <-- signed answer
```

1. **The source client**, in Parmana. Replaces the throwing `deps.sources`. It sends the query to the adapter, with a timeout, and returns the adapter's signed answer unchanged.
2. **The adapter**, next to the accounts system. It looks up the subject (the invoice), builds the answer payload, signs it with the source's private key, and returns it.
3. **The register entries** that make Parmana trust the adapter's key: the source, its public key, its claims, and its approval.
4. **Configuration** for the source client.

## 3. The source client (Parmana)

**Where:** `packages/api/src/policyV2/` (a new file, for example `policyV2SourceClient.ts`), wired in `createPolicyV2Runtime.ts` in place of the throwing function.

**Contract:**

- Input: the query `{ source, claim, subject, action, transactionId }`.
- Request: `POST <PARMANA_POLICY_V2_SOURCE_URL>/answers` with the query as JSON and an `Authorization: Bearer <token>` header. The token is read from `PARMANA_POLICY_V2_SOURCE_TOKEN`. **[PROPOSED]** These two setting names are new; they do not exist in the code yet.
- Response: a signed answer `{ payload, signature }`. The client returns it as is. It does not read or change the value. The verifier does the checking.
- Any failure throws, so the decision refuses with `SOURCE_UNAVAILABLE`. A failure is a timeout, a non-200 response, a network error, or a body that is not JSON.
- **Timeout:** 3 seconds **[PROPOSED]**, so one slow source cannot hold a decision.
- **No retries** on a decision. A retry could repeat a question the nonce store has already consumed.

**Do not:** cache answers across decisions, or accept an answer that does not match the query. The verifier checks the match (`QUERY_MISMATCH`), but the client should not hide a mismatch either.

## 4. Register entries (through HTTP)

Use the register routes in `packages/api/src/routes/policy-v2-register.ts`. The body for `POST /sources` is a `SourceInput`:

| Field          | Value for this source                                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `name`         | the source's name, for example `accounts` **[PROPOSED]**                                                              |
| `dataOwner`    | the person accountable for the accounts data **[ASSUMED: to be named by the owner]**                                  |
| `signer`       | the signer kind and operator, as the register requires                                                                |
| `keyId`        | the key id the adapter puts in each answer, for example `accounts-2026-11`                                            |
| `publicKeyPem` | the Ed25519 public key, PEM (SPKI)                                                                                    |
| `claims`       | `{ "invoice.amount": "<unit>", "vendor.id": "<unit>", "vendor.status": "<unit>" }`, with units confirmed by the owner |
| `canApprove`   | `false` for `erp:invoice-pay` **[ASSUMED: the owner confirms]**                                                       |

Then approve it with `POST /sources/accounts/approve`, by the second approver. A source owner who has not approved cannot have its answers trusted.

Units are part of the claim. An answer in a different unit does not match the registered claim and is refused.

## 5. The adapter (beside the accounts system)

**[ASSUMED]** The accounts system is named later. The adapter below is written against a generic accounts API. Replace the lookup with the real API when it is known.

**Responsibilities:**

1. Authenticate Parmana's request with the token.
2. Look up the subject (the invoice identifier) in the accounts system.
3. For the claim asked, read the value.
4. Build an `AnswerPayload` with every field: `source`, `keyId`, `claim`, `subject`, `value`, `unit`, `action`, `transactionId`, `nonce`, `observedAt`, `expiresAt`.
5. Sign it with `signAnswer(payload, privateKey)`.

**Rules the adapter must follow:**

- **`nonce`:** a new random value for every answer. Never reuse one. The nonce store refuses a second use (`REPLAYED`).
- **`observedAt` and `expiresAt`:** the time the value was read, and a short expiry. **[PROPOSED]** The expiry is 5 minutes after `observedAt`. Clocks may differ by up to 60 seconds (`MAX_CLOCK_SKEW_MS`).
- **Echo the query exactly:** `source`, `claim`, `subject`, `action` and `transactionId` must match the query. Otherwise the answer is refused (`QUERY_MISMATCH`).
- **Private key:** held only by the adapter. Never sent to Parmana, never in the repository, never in chat. Store it in the adapter's secret store.
- **Unknown subject or claim:** return an error, not a guessed value. Parmana then refuses the decision.

**Key rotation** (design section 5.5): register the new public key, approve it, switch the adapter to the new key id, then revoke the old key.

## 6. Tests

Build these before the real accounts system is connected.

1. **Source client, unit tests:** a valid response is returned unchanged; a timeout, a 500, a network error and a non-JSON body each throw.
2. **Adapter, unit tests:** a signed answer verifies with `verifySourceAnswer` against the registered public key; each refusal code is produced by the matching fault (wrong key, wrong query, reused nonce, expired answer, answer not yet valid, revoked key).
3. **Fixture adapter:** a test adapter with a test key, serving fixed invoices. Used in tests and in staging. The test key is never registered in production.
4. **End to end in staging:** a decision for `erp:invoice-pay` reaches the fixture adapter, the evidence log records each answer and its check, and a refused answer gives the expected refusal.
5. **No live invoices** are used until the owner approves it in writing.

## 7. Configuration

| Setting                          | Where                                          | Value                                         |
| -------------------------------- | ---------------------------------------------- | --------------------------------------------- |
| `PARMANA_POLICY_V2_SOURCE_URL`   | Parmana deployment **[PROPOSED]**              | the adapter's base URL                        |
| `PARMANA_POLICY_V2_SOURCE_TOKEN` | Parmana deployment secret store **[PROPOSED]** | the token the adapter checks                  |
| `PARMANA_POLICY_V2_CAPABILITIES` | Parmana deployment                             | add `erp:invoice-pay` only after step 8 below |

Set the token in the deployment's secret store. Never put it in the repository or in chat.

## 8. Steps, in order

1. Confirm the assumptions in the design, section 2, and name the accounts system.
2. Build the source client in Parmana, with the tests in section 6.1.
3. Build the fixture adapter, with the tests in section 6.2 and 6.3.
4. Review both in a pull request. Merge.
5. Register the fixture source in staging, through section 4, with a test key.
6. Run the end-to-end test in staging (section 6.4).
7. Build the real adapter against the accounts system's API, with the owner's approval.
8. Register the real source in staging, with the staging key. Run the end-to-end test again.
9. Owner approves the production source key in writing. Register it in production.
10. Enable `erp:invoice-pay` through `POLICY-V2-ENABLEMENT.md`, staging first, then production.

## 9. What is not done yet

- The accounts system is not named, so the real adapter is not built.
- The claims' units are not confirmed.
- `PARMANA_POLICY_V2_SOURCE_URL` and `PARMANA_POLICY_V2_SOURCE_TOKEN` are proposals. They are not in the code.
- The `erp:invoice-pay` thresholds and tiers are not decided. They are a business decision for the owner.
