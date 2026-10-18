# Parmana

> **Execution Trust Infrastructure for AI systems**

[![PyPI](https://img.shields.io/pypi/v/parmana)](https://pypi.org/project/parmana/)
[![Python](https://img.shields.io/pypi/pyversions/parmana)](https://pypi.org/project/parmana/)
[![License](https://img.shields.io/pypi/l/parmana)](https://github.com/pavancharak/parmana/blob/main/python/LICENSE)

The official Python SDK for **Parmana Execution Trust Infrastructure**.

Parmana lets organizations verify what automated systems executed, not simply trust that they executed correctly. An action routed through Parmana runs only when the policy bound to it, approved through policy governance, approves it, and a trusted person has signed an approval for that action (every action needs one, reads included; `parmana.crypto.sign_approval`), and each execution produces a signed Execution Trust Record that anyone with the public key can verify.

## Why Parmana

Modern AI systems can:

- Plan
- Reason
- Call tools
- Invoke APIs
- Execute business workflows

However, most AI systems cannot answer critical governance questions:

- Who authorized this execution?
- Which policy approved it?
- Was the execution independently verified?
- Has the record changed since it was written?
- Is there cryptographic evidence of what occurred?

For actions routed through it, Parmana records the answers in signed evidence. An agent that calls a system with its own credentials, outside Parmana, is outside that record.

## Installation

```bash
pip install parmana
```

### Requirements

- Python 3.10 or later
- A running Parmana API server (for example `http://localhost:3000`) and an API key for it

## Quick Start

```python
from parmana import ParmanaClient

client = ParmanaClient(
    endpoint="http://localhost:3000",
    api_key="<your API key>",
)

print(client.version)  # the SDK version
```

## Runtime Health

```python
status = client.health()

print(status)
```

## Execute a Business Transaction

```python
from parmana import PolicyReference, create_business_transaction

transaction = create_business_transaction(
    principal_id="python-sdk",
    purpose="Quickstart demo",
    action="test:fixture-execute",
    target="vendor://payments",
    parameters={"amount": 1000, "currency": "USD"},
    policy=PolicyReference(
        name="vendor-payment", version="2.0.0", schema_version="1.0.0"
    ),
    signals={
        "vendorVerified": True,
        "invoiceVerified": True,
        "paymentApproved": True,
        "sufficientFunds": True,
        "paymentAmount": 1000,
        "riskScore": 5,
        "vendorId": "vendor://payments",
    },
)

trust_record = client.execute(transaction)

print(trust_record.trust_record_id)
```

`test:fixture-execute` is a test only capability that works on a server started with `NODE_ENV=test`; see `examples/quickstart/run.py` for the full, tested example. A refused request raises an error instead of returning a record.

## Verify an Execution

```python
verification = client.verify(transaction.business_transaction_id)

print(verification.status)
```

## Recheck a stored record

```python
result = client.replay.replay(transaction.business_transaction_id)

print(result.verified)
```

Through the API, "replay" rechecks the stored Trust Record's hash and signature, the same kind of check as `verify()`. It does not execute anything again. See https://docs.parmanasystems.com/replay/overview.

## Execution Lifecycle

```text
Business Transaction
        |
        v
Policy decision (refused requests get a signed Refusal Record)
        |
        v
Signed authorization
        |
        v
Execution through the gateway
        |
        v
Execution Trust Record (signed)
        |
        v
Verification and Receipt
```

## Python SDK

| Method                    | Description                                         |
| ------------------------- | --------------------------------------------------- |
| `health()`                | Runtime health check                                |
| `execute()`               | Execute a Business Transaction                      |
| `verify()`                | Verify an execution                                 |
| `replay.replay()`         | Recheck a stored Trust Record (hash and signature)  |
| `receipt.generate()`      | Generate an execution receipt                       |
| `latest_receipt()`        | Read the latest receipt (1.3.0)                     |
| `transaction()`           | Retrieve a Business Transaction                     |
| `trust_record()`          | Retrieve an Execution Trust Record                  |
| `validate_policy()`       | Check a policy name and version can be loaded       |
| `refusal_record()`        | Retrieve a Refusal Record                           |
| `execution_intent()`      | Retrieve an Execution Intent and its status         |
| `caller()`                | Who the API key belongs to (1.3.0)                  |
| `public_key()`            | A signing public key, for offline checks (1.3.0)    |
| `propose_policy_change()` | Propose a policy change (1.3.0)                     |
| `policy_changes()`        | List policy changes for review (1.3.0)              |
| `approve_policy_change()` | Approve with a signed step up authorization (1.3.0) |
| `reject_policy_change()`  | Reject with a signed step up authorization (1.3.0)  |

`parmana.crypto` (install `parmana[verify]`) verifies Trust Records and Execution Intents with only the public key, and signs step up authorizations (`sign_policy_change_step_up()`, 1.3.0).

Each of these is also available under its own namespace (e.g. `client.execution.execute()`, `client.verification.verify()`, `client.replay.replay()`) for finer-grained access to that API's other operations, such as `client.verification.get_latest()` or `client.transactions.list()`.

## Documentation

- Website: https://parmanasystems.com/
- Documentation: https://docs.parmanasystems.com
- Every operation and its TypeScript equivalent: https://docs.parmanasystems.com/sdks/api-coverage
- GitHub: https://github.com/pavancharak/parmana
- Issues: https://github.com/pavancharak/parmana/issues

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). This SDK is a client: it needs a Parmana server, which is licensed separately. Licensing inquiries: founder@parmanasystems.com

---

**Parmana**

**Execution Trust Infrastructure for AI systems**
