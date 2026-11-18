# Integrator guide: calling `crm:read` and `erp:invoice-pay`

**Status:** reference draft for the people who call the API. `crm:read` is not enabled yet, and `erp:invoice-pay` needs the source integration first. Do not use this guide against a production deployment until the capability is enabled there.

## What a call does

You send a decision request. Parmana records the outcome and returns it. **Nothing is released by the call.** The response always says `released: false`. Your system releases the action, and only after it has checked the outcome.

## The request

Both capabilities use the same request shape (the SDKs send it for you):

| Field           | Meaning                                                                    |
| --------------- | -------------------------------------------------------------------------- |
| `capability`    | `crm:read` or `erp:invoice-pay`                                            |
| `transactionId` | Your identifier for this request. Use a new one for each request.          |
| `target`        | The system the action is for                                               |
| `parameters`    | The action's parameters (for `crm:read`, the account identifier)           |
| `signals`       | Caller values. These are untrusted unless a registered source signed them. |
| `approvals`     | Approval artifacts, when the policy requires them                          |

## How to call it

- **TypeScript:** `client.decidePolicyV2(request)`
- **Python:** `client.decide_policy_v2(...)`

You must be authenticated as a caller the deployment recognises.

## Reading the response

| Field      | Meaning                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------ |
| `outcome`  | `APPROVE`, `REJECT` or `REVIEW`                                                                                    |
| `reason`   | A short reason for the outcome                                                                                     |
| `recordId` | The evidence record for this decision. Keep it.                                                                    |
| `released` | Always `false`                                                                                                     |
| `reviewId` | Present on `REVIEW`. Read the review with `policyV2Review`, then the reviewer decides with `decidePolicyV2Review`. |
| `refusal`  | Present when a rule or check refused the request                                                                   |

## What the error responses mean

| Response                                               | Meaning                                          | What to do                                                                    |
| ------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------- |
| HTTP 404, `not_enabled`                                | The capability is not enabled on this deployment | Do not retry. Ask the operator.                                               |
| `NO_APPROVED_POLICY`                                   | No approved policy for the capability            | Ask the action owner.                                                         |
| `SOURCE_UNAVAILABLE` (`erp:invoice-pay`)               | The accounts system did not answer               | Retry later. Do not treat it as a rejection.                                  |
| `EXPIRED`, `REPLAYED`, `BAD_SIGNATURE` (source checks) | An answer from the source failed a check         | Report it to the operator. Do not retry with the same transaction identifier. |
| HTTP 409                                               | The decision state changed while it was recorded | Retry the request.                                                            |
| HTTP 401                                               | Not authenticated                                | Check your caller credentials.                                                |

## Reviews

A `REVIEW` outcome means a person must decide. Reviewers decide with `decidePolicyV2Review(itemId, "approve" | "reject")`. The requester can read the status of their own review, and nobody else can. A review expires after three business days, and an expired review is refused.

## Things not to do

- Do not treat `released: false` as a refusal. It means the decision did not release anything.
- Do not reuse a `transactionId` for a different request.
- Do not put tokens, keys or account data that you are not allowed to send into `signals`.
- Do not retry an `EXPIRED`, `REPLAYED` or `BAD_SIGNATURE` answer with the same request.

## Status of each capability

- `crm:read`: pending the owner's rules (see `01`) and enablement (see `CRM-READ-ENABLEMENT.md`).
- `erp:invoice-pay`: pending the source integration (see `ERP-INVOICE-PAY-SOURCE-BUILD.md`) and the business rules (see `05`).
