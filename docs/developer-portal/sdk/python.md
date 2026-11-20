# Python SDK: `parmana`

[SDKs](README.md) · [Full method index](python-method-index.md) · [TypeScript SDK](typescript.md) · [Offline verifier](verifier.md)

> **About the code on this page.** Blocks marked as methods, builders and signing show the call shape. Fragments such as an undefined `approval` or `record` are **illustrative**, not runnable on their own. The runnable versions are the examples linked under [Examples](#examples) (governed_flow.py), which were run for this portal.

## Package

|                    |                                                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Package            | `parmana` (PyPI)                                                                                                                                                                |
| Version documented | 4.1.1                                                                                                                                                                           |
| Purpose            | Client for the Parmana API: declare and execute Business Transactions, read and verify Execution Trust Records, manage policy and approval changes, and verify records offline. |
| Python             | 3.10 or later (classifiers list 3.10 to 3.13; the verification run used 3.13)                                                                                                   |
| Client style       | **Synchronous only.** There is no async client.                                                                                                                                 |
| Dependencies       | `requests` (runtime). `cryptography` is needed only for `parmana.crypto` (signing and offline verification): install the `verify` extra.                                        |

## Install

```bash
pip install "parmana==4.1.1"

# Also needed to sign approvals or step-up envelopes, or to verify records offline in Python:
pip install "parmana[verify]==4.1.1"
```

Check the install:

```bash
python3 -c "import parmana; print(parmana.__version__)"
# 4.1.1
```

## Initialize the client

```python
import os
from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="https://parmana.example.com",   # or "http://localhost:3000" for local development
    api_key=os.environ["PARMANA_API_KEY"],    # the caller's raw API key
    timeout=30,                               # seconds, default 30
    max_retries=3,                            # retries for GET requests only, default 3
    backoff_factor=0.5,                       # default 0.5
    debug=False,
)
```

`ParmanaClient` takes keyword arguments only, after `endpoint`. It raises `ConfigurationError` if `endpoint` is empty. It refuses an endpoint that is not `https://`, except `localhost`, `127.0.0.1` and `::1`.

### Retries

The transport retries only idempotent `GET` requests, with exponential backoff, and honors a numeric `Retry-After` on `429`. It never retries a `POST`. Do not add your own retry loop around `execute`: a retry with the same `business_transaction_id` returns `409`, and a retry with a new id runs the action again.

## Top-level names

Everything below is importable from `parmana`:

| Group                   | Names                                                                                                                                                                                                                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client and version      | `ParmanaClient`, `__version__`                                                                                                                                                                                                                                                                                             |
| Builder                 | `create_business_transaction`, `PolicyReference`                                                                                                                                                                                                                                                                           |
| Enumerations and models | `AuthorityType`, `DecisionOutcome`, `PendingPolicyChangeStatus`, `VerificationStatus`, and the models in `parmana.models` (for example `ExecutionTrustRecord`, `Receipt`, `Verification`, `CallerIdentity`, `PublicKeyInfo`, `PolicyInEffect`, `ApprovalIssuer`, `AuthorityGrant`, `ProposedPolicyChange`)                 |
| Errors                  | `ParmanaError`, `ConfigurationError`, `ParmanaHttpError`, `ValidationError`, `AuthenticationError`, `AuthorizationError`, `ExecutionRejectedError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `InternalServerError`, `NetworkError`, `TimeoutError`, `ReplayError`, `VerificationError`, `ExecutionPendingError` |

Import the signing and offline functions from `parmana.crypto`. `OfflineVerificationResult` is also in `parmana.crypto`; it is not a top-level name.

## Client surface

`ParmanaClient` has two ways to call the API. Both send the same request.

**Flat methods** match the TypeScript names in snake_case, for example `client.execute(...)`, `client.trust_record(...)`, `client.propose_policy_change(...)`.

**Namespaces** group the calls by resource, for example `client.execution.execute(...)`, `client.transactions.create(...)`, `client.policy.propose_change(...)`. The namespaces are:

| Namespace                        | Resource                                     |
| -------------------------------- | -------------------------------------------- |
| `client.execution`               | Execute and the execution endpoints          |
| `client.verification`            | Verify and latest verification               |
| `client.replay`                  | Replay                                       |
| `client.receipt`                 | Receipts                                     |
| `client.transactions`            | Declare, status, execute, reconcile, list    |
| `client.trust_records`           | Trust record reads and listing               |
| `client.policy`                  | Policy in effect, validation, policy changes |
| `client.refusal`                 | Refusal records                              |
| `client.execution_intents`       | Execution intents (experimental)             |
| `client.audit`                   | Audit event verification                     |
| `client.callers`                 | The caller's identity                        |
| `client.approvers`               | Approval issuers and their changes           |
| `client.external_connectors`     | External connectors and their changes        |
| `client.business_signal_sources` | Business signal sources and their changes    |
| `client.authority_grants`        | Authority grants and their changes           |

`client.endpoint` and `client.version` are **properties** (no parentheses). `client.version` is the SDK's own version string. To ask the server, call `client.server_version()`, which returns what `GET /version` reports as a `dict`. It matches the TypeScript SDK's `version()`, which also calls the server (FINDINGS F4).

The complete list of the 50 public methods, with exact signatures and the request each sends, is in the [generated method index](python-method-index.md).

## Methods used most often

| Method                                                                                    | Returns                       | Request                                           |
| ----------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| `health()`                                                                                | `dict`                        | `GET /health`                                     |
| `caller()`                                                                                | `CallerIdentity`              | `GET /callers/me`                                 |
| `public_key(key_id="default")`                                                            | `PublicKeyInfo`               | `GET /keys/{keyId}`                               |
| `execute(transaction)`                                                                    | `ExecutionTrustRecord`        | `POST /execute`                                   |
| `declare_transaction(transaction)`                                                        | `DeclaredTransaction`         | `POST /transactions`                              |
| `execute_transaction(business_transaction_id)`                                            | `ExecutionTrustRecord`        | `POST /transactions/{id}/execute`                 |
| `create_transaction(transaction)`                                                         | `ExecutionTrustRecord`        | Declare, then execute (two requests)              |
| `transaction_status(business_transaction_id, *, history=False)`                           | `TransactionStatusResult`     | `GET /transactions/{id}/status`                   |
| `reconcile_transaction(business_transaction_id)`                                          | `ReconcileResult`             | `POST /transactions/{id}/reconcile`               |
| `verify(business_transaction_id)`                                                         | `Verification`                | `POST /verify`                                    |
| `get_latest_verification(business_transaction_id)`                                        | `Verification`                | `GET /verification/{id}`                          |
| `replay(business_transaction_id)`                                                         | `ReplayResult`                | `POST /replay`                                    |
| `receipt(business_transaction_id)`                                                        | `Receipt`                     | `POST /receipt`                                   |
| `latest_receipt(business_transaction_id)`                                                 | `Receipt`                     | `GET /receipt/latest/{id}`                        |
| `trust_record(business_transaction_id)`                                                   | `ExecutionTrustRecord`        | `GET /trust-records/{id}`                         |
| `policy_in_effect(capability)`                                                            | `PolicyInEffect`              | `GET /policies/in-effect?capability=`             |
| `server_version()`                                                                        | `dict`                        | `GET /version`                                    |
| `validate_policy(policy_id, policy_version)`                                              | `dict`                        | `POST /policies/validate`                         |
| `propose_policy_change(name, version, *, proposed_content, reason)`                       | `ProposedPolicyChange`        | `POST /policies/{name}/{version}/pending-changes` |
| `policy_changes(status=None)`                                                             | `list[PolicyChangeForReview]` | `GET /policies/pending-changes`                   |
| `approve_policy_change(pending_policy_change_id, step_up_authorization)`                  | `PendingPolicyChange`         | `POST /policies/pending-changes/{id}/approve`     |
| `reject_policy_change(pending_policy_change_id, rejection_reason, step_up_authorization)` | `PendingPolicyChange`         | `POST /policies/pending-changes/{id}/reject`      |

Note the keyword-only parameters: `propose_policy_change` takes `proposed_content` and `reason` as keywords.

## Methods not covered above

The methods below are public on `ParmanaClient` and were not described in the sections above. Each sends the request in its row. The full list, with signatures, is in the [generated Python method index](python-method-index.md). The names are as the SDK defines them.

| Method                                  | HTTP | Path                                               |
| --------------------------------------- | ---- | -------------------------------------------------- |
| `refusal_record`                        | GET  | `/refusal/{param}`                                 |
| `verify_refusal_record`                 | POST | `/refusal/verify`                                  |
| `finalize_execution_intent`             | POST | `/execution-intents/{param}/finalize`              |
| `verify_audit_event`                    | POST | `/audit/verify`                                    |
| `policy_v2_review`                      | GET  | `/v2/reviews/{param}`                              |
| `decide_policy_v2_review`               | POST | `/v2/reviews/{param}/decision`                     |
| `policy_v2_replay`                      | GET  | `/v2/evidence/{param}/replay`                      |
| `list_approvers`                        | GET  | `/approval-issuers`                                |
| `approve_approver_change`               | POST | `/approval-issuers/changes/{param}/approve`        |
| `reject_approver_change`                | POST | `/approval-issuers/changes/{param}/reject`         |
| `list_external_connectors`              | GET  | `/external-connectors`                             |
| `approve_external_connector_change`     | POST | `/external-connectors/changes/{param}/approve`     |
| `reject_external_connector_change`      | POST | `/external-connectors/changes/{param}/reject`      |
| `list_business_signal_sources`          | GET  | `/business-signal-sources`                         |
| `approve_business_signal_source_change` | POST | `/business-signal-sources/changes/{param}/approve` |
| `reject_business_signal_source_change`  | POST | `/business-signal-sources/changes/{param}/reject`  |
| `list_authority_grants`                 | GET  | `/authority-grants`                                |
| `approve_authority_grant_change`        | POST | `/authority-grants/changes/{param}/approve`        |
| `reject_authority_grant_change`         | POST | `/authority-grants/changes/{param}/reject`         |
| `execution_intent`                      | GET  | `/execution-intents/{param}`                       |
| `verify_execution_intent`               | POST | `/execution-intents/verify`                        |
| `unfinalized_execution_intents`         | GET  | `/execution-intents/unfinalized`                   |
| `resolve_execution_intent`              | POST | `/execution-intents/{param}/resolve`               |
| `decide_policy_v2`                      | POST | `/v2/decisions`                                    |
| `approver_changes`                      | GET  | `/approval-issuers/changes`                        |
| `external_connector_changes`            | GET  | `/external-connectors/changes`                     |
| `business_signal_source_changes`        | GET  | `/business-signal-sources/changes`                 |
| `authority_grant_changes`               | GET  | `/authority-grants/changes`                        |

## Builder: `create_business_transaction`

```python
from parmana import PolicyReference, create_business_transaction

transaction = create_business_transaction(
    principal_id="ap-automation-svc",
    purpose="Authorize vendor payment disbursement",
    action="payments:execute",
    target="vendor/V-100",
    parameters={"amount": 4500, "currency": "USD"},
    policy=PolicyReference(name="vendor-payment", version="2.1.0", schema_version="1.0.0"),
    signals={"humanApproved": True, "approvalArtifact": approval, "paymentAmount": 4500},  # see Policy management
    # optional keyword arguments:
    business_transaction_id=None,         # a UUID; generated when None
    authority_type=AuthorityType.SERVICE, # AuthorityType.USER | ROLE | SERVICE | ORGANIZATION
    display_name=None,
    correlation_id=None,
    tenant_id=None,
    source_system=None,
    submitted_by=None,
)
```

The builder keeps the ids consistent: the same id goes into `businessTransactionId` and `metadata.businessTransactionId`, and the authority, authorization and intent ids are linked. The server checks the same relations and returns `400` if one is wrong.

## Human approvals: `sign_approval`

```python
from pathlib import Path
from parmana.crypto import sign_approval

approval = sign_approval(
    private_key_pem=Path("approver.private.pem").read_text(),  # stays with the approver
    approver_id="finance-approver-1",    # as registered on the server
    key_id="finance-approver-key-1",     # as registered on the server
    capability="payments:execute",       # must match intent.action
    resource_id="vendor/V-100",          # must match the target the policy names
    max_amount=5000,                     # optional: the largest amount approved
    ttl_seconds=900,                     # default 900, at most 86400
)
```

`sign_approval` is keyword-only. It returns a `dict`: put it in `signals["approvalArtifact"]` and set `signals["humanApproved"] = True`. The same rules as in the TypeScript SDK apply: single use, scoped by `max_amount` when given, expires after `ttl_seconds`.

## Policy change step-up: `sign_policy_change_step_up`

```python
from parmana.crypto import sign_policy_change_step_up

envelope = sign_policy_change_step_up(
    pending_policy_change_id="f3bce0b6-1095-492c-a06e-9cb27253bbce",
    action="approve",                    # or "reject"
    private_key_pem=Path("checker-stepup.private.pem").read_text(),
    key_id="checker-step-up-key",
    ttl_seconds=120,                     # default 120
)
client.approve_policy_change(pending_policy_change_id, envelope)
```

The Python `approve_policy_change` takes the envelope as a `dict`. Sign it immediately before you submit it, because it expires.

## Offline verification: `verify_execution_trust_record_offline`

Pass `require_full_coverage=True` to fail closed on legacy records: the result is `valid=False`, and `errors` says why. The default is `False`, which keeps the result of earlier releases (FINDINGS F2).

```python
import json
from parmana.crypto import verify_execution_trust_record_offline

with open("record.json") as f:
    record = json.load(f)

result = verify_execution_trust_record_offline(record, {"default": public_key_pem})
print(result.valid, result.coverage, result.hash_valid, result.legacy_signature_valid)
print(result.errors)
```

- Pass either a `dict` (from `json.load`) or the `ExecutionTrustRecord` returned by `client.trust_record()` or `client.execute()`.
- `public_keys` maps each `keyId` to a PEM. Pin these yourself.
- `result.valid` means the hash and signatures check out. `result.coverage` is `"full"` for a schema version 3 record and `"legacy"` otherwise. A version 2 record covers only seven top-level fields. Check `coverage` if you need the whole record covered.

Other functions in `parmana.crypto`: `verify_execution_intent_offline`, `verify_parmana_release`, `canonical_serialize`.

## Errors

Every error is a subclass of `ParmanaError`. HTTP errors are `ParmanaHttpError` subclasses and carry:

- `status_code`: the HTTP status.
- `code`: the server's code, or `HTTP_ERROR` when the server sent none.
- `server_code`: the server's own code string where one was sent (for example `CAPABILITY_NOT_ALLOWED`).
- `request_id`: when the server sent one.

| Class                              | Raised for                                                                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `ValidationError`                  | HTTP `400`                                                                                                                 |
| `AuthenticationError`              | HTTP `401`                                                                                                                 |
| `AuthorizationError`               | HTTP `403`, including `CAPABILITY_NOT_ALLOWED`, `SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE` and `STEP_UP_AUTHORIZATION_INVALID` |
| `ExecutionRejectedError`           | HTTP `403` with `POLICY_DENIED`: the policy refused. Final for that request.                                               |
| `NotFoundError`                    | HTTP `404`                                                                                                                 |
| `ConflictError`                    | HTTP `409`                                                                                                                 |
| `RateLimitError`                   | HTTP `429`                                                                                                                 |
| `InternalServerError`              | HTTP `5xx`                                                                                                                 |
| `ExecutionPendingError`            | HTTP `202`: released and recorded, status `EXECUTING`. Reconcile.                                                          |
| `NetworkError`, `TimeoutError`     | No HTTP response, or the timeout elapsed                                                                                   |
| `ReplayError`, `VerificationError` | A replay or verification step failed                                                                                       |
| `ConfigurationError`               | Missing or invalid configuration                                                                                           |

The observed behaviour of each status is in the [error catalogue](../reference/error-codes.md).

```python
from parmana import ConflictError, ExecutionRejectedError, ParmanaHttpError

try:
    record = client.execute(transaction)
except ExecutionRejectedError as error:
    # Policy refused. Do not retry this transaction. Record the reason.
    print("refused:", error)
except ConflictError as error:
    # The id was used. Read the existing outcome with trust_record() or transaction_status().
    print("already used:", error)
except ParmanaHttpError as error:
    print(error.status_code, error.server_code, error)
    raise
```

## Examples

| Example                                                                                                  | What it shows                                                                                          | Status                                                                           |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| [`governed-quickstart/python/governed_flow.py`](../examples/governed-quickstart/python/governed_flow.py) | Propose, refused self-approval, checker approval, execute, verify (server and offline), replay refused | Run; passed                                                                      |
| [`python/examples/`](../../../python/examples/README.md) in the repository                               | Health, execute, verify, replay, receipts, custom policy, end-to-end                                   | Part of the repository's test suite (`pytest`); the full suite passed 208 of 208 |

## Best practices

- **Use one client per endpoint and key**, created at start-up.
- **Keep `POST` retries off.** Only the `GET` retries are automatic.
- **Import from `parmana.crypto`** for signing and offline verification. Those functions need the `verify` extra.
- **Read enumerations by value.** `DecisionOutcome.APPROVED` is a `str` enum; compare with `== DecisionOutcome.APPROVED` or use `.value` for logs.
- **Keep private keys out of source code.** Read them from a file or secret store that the signer controls.
- **Verify offline when you need proof**, and check `coverage` before you treat a record as fully covered.
