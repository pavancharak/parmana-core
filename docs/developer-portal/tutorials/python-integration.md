# Tutorial: integrate Parmana into a Python application

[Tutorials](README.md) · [Python SDK](../sdk/python.md) · [Node.js integration](nodejs-integration.md)

**Goal.** Your Python application or agent calls a business system. Parmana checks the policy and a signed human approval before the call runs, and gives your application signed evidence afterward.

**Verification.** Run against a local server from this repository: [`governed_flow.py`](../examples/governed-quickstart/python/governed_flow.py) passed all six steps. The repository's Python test suite (`pytest`) passed 208 of 208. Output from the flow is in [Getting started](../getting-started.md#5-approve-a-policy-version-maker-checker).

The Python SDK is **synchronous only**. Call it from a worker, a request handler, or a script. There is no `async` client.

## Who does what

| Party                       | Does                                                                                                                                                                  |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Your application**        | Builds the request, asks the approver through your workflow, calls Parmana, and calls the business system only when Parmana approves.                                 |
| **The approver** (a person) | Signs an approval with their own key, on their own machine.                                                                                                           |
| **`parmana`** (the SDK)     | Builds and sends the request with the caller's key, checks the endpoint is `https`, and raises a typed error for each refusal. It decides nothing.                    |
| **The Parmana service**     | Checks the caller and the request, loads the policy version in effect, verifies the approval, decides, releases through the gateway, and writes and signs the record. |
| **The business system**     | Performs the action when the connector calls it.                                                                                                                      |

## Step 1: install

```bash
pip install "parmana==4.1.1"
pip install "parmana[verify]==4.1.1"   # for signing approvals and offline verification
```

## Step 2: create the client

```python
import os
from parmana import ParmanaClient

parmana = ParmanaClient(
    endpoint=os.environ.get("PARMANA_ENDPOINT", "http://localhost:3000"),
    api_key=os.environ["PARMANA_API_KEY"],
)

me = parmana.caller()
print(me.caller_id, me.allowed_capabilities)   # check the actions this key may invoke
```

## Step 3: build the transaction

```python
import uuid
from parmana import PolicyReference, create_business_transaction

def build_transaction(order_id: str, vendor_id: str, amount: float, risk_score: int, approval: dict | None):
    signals = {
        "humanApproved": approval is not None,
        "vendorVerified": True,       # declared by the caller in this policy (a condition, not a verified fact)
        "invoiceVerified": True,
        "paymentApproved": True,
        "sufficientFunds": True,
        "paymentAmount": amount,      # bound: must equal parameters.amount
        "riskScore": risk_score,
        "vendorId": vendor_id,        # bound: must equal the target
    }
    if approval is not None:
        signals["approvalArtifact"] = approval
    return create_business_transaction(
        business_transaction_id=str(uuid.uuid4()),  # single-use: a new id for each new action
        principal_id="ap-automation-svc",
        purpose=f"Pay vendor for order {order_id}",
        action="test:fixture-execute",              # a capability your key is allowed to invoke
        target=vendor_id,
        parameters={"amount": amount, "currency": "USD"},
        policy=PolicyReference(name="vendor-payment", version="2.1.0", schema_version="1.0.0"),
        signals=signals,
        correlation_id=order_id,
        source_system="order-service",
    )
```

Read what the policy verifies before you rely on it. In `vendor-payment`, the `vendorVerified`, `invoiceVerified`, `paymentApproved` and `sufficientFunds` values are declared by the caller. Parmana does not confirm them. The decision rests on the signed human approval. See the [Node.js tutorial](nodejs-integration.md#step-2-build-the-business-transaction) and [Policy management](../policies/README.md#signals).

## Step 4: obtain the approval

The approver signs on their machine, and the application receives the result as data:

```python
# On the approver's machine, or in the approver's own tool.
from pathlib import Path
from parmana.crypto import sign_approval

approval = sign_approval(
    private_key_pem=Path("approver.private.pem").read_text(),
    approver_id="finance-approver-1",
    key_id="finance-approver-key-1",
    capability="test:fixture-execute",
    resource_id="vendor://payments",
    max_amount=1000,
    ttl_seconds=900,
)
```

Your application stores the approval JSON with the order, and never holds the approver's private key.

## Step 5: execute and handle the outcome

```python
from parmana import ConflictError, ExecutionRejectedError, ParmanaHttpError

def authorize_and_run(transaction):
    try:
        record = parmana.execute(transaction)
        return {"status": "approved", "trust_record_id": record.trust_record_id, "record": record}
    except ExecutionRejectedError as error:
        # Policy refused. Show the reason. Do not retry this transaction.
        return {"status": "refused", "reason": str(error)}
    except ConflictError:
        # The id was used. Read the outcome that already exists.
        return {"status": "already-recorded", "record": parmana.trust_record(transaction.business_transaction_id)}
    except ParmanaHttpError as error:
        # Other HTTP failures. Read the status before doing anything else.
        status = parmana.transaction_status(transaction.business_transaction_id)
        return {"status": "unknown", "current": status.current.status, "error": str(error)}
```

Verified outcomes on this build: approved (`200`), refused for the limit cases (`ExecutionRejectedError`), and a repeated id (`ConflictError`). The `ExecutionPendingError` (`202`) path is described in the [Python SDK errors](../sdk/python.md#errors); it was not triggered in this verification.

Check `status.current.status` against the enumeration by value. `TransactionStatusResult` reports statuses as plain strings in this build.

## Step 6: verify the evidence offline

```python
import json
from parmana.crypto import verify_execution_trust_record_offline

published = parmana.public_key("default")          # pin this out of band in production
result = verify_execution_trust_record_offline(record, {"default": published.pem})
if not result.valid:
    raise RuntimeError(f"record did not verify: {result.errors}")
print("coverage:", result.coverage)                # "legacy" on this build
```

`record` is the `ExecutionTrustRecord` the SDK returned. You can also verify a record saved as JSON, by passing the dict from `json.load()`. See [Evidence verification](../security/evidence-verification.md).

## What happens in the business application

1. The application asks for an approval through its own workflow and gets the approval JSON back.
2. It builds the transaction and calls Parmana. If Parmana approves, the connector performs the action in the business system.
3. The application stores the record. The record's `trust_record_id` is the reference for the action.
4. If Parmana refuses, nothing reached the business system. The application shows the reason.

## Run it

```bash
# From the repository root, with the server running and the Python SDK installed:
python3 docs/developer-portal/examples/governed-quickstart/python/governed_flow.py
```

## Production checklist

- Use `https://` and a caller key issued for this application only.
- Keep the approver's private key with the approver. Register the approver's public key through approval-issuer governance.
- Do not put secrets in `parameters`. The transaction is retained in the record.
- Do not retry `execute` in a loop. Read the status instead.
