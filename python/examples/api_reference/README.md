# API reference examples

One short script for each HTTP endpoint the Python SDK calls. Each script makes a single request and prints the result, so you can see one endpoint's request and response without the rest of a workflow.

## Before you run them

- Install the SDK with `pip install parmana`.
- Set `PARMANA_API_KEY` to an API key for the server you are calling.
- Most scripts point at the hosted endpoint, `https://parmana-api-real.vercel.app`. To use your own server, change the `endpoint=` value in the script.
- `trip_kill_switch.py` and a few others call a placeholder URL, `https://your-parmana-server`. Replace it with your server's address before you run them.

## What the scripts cover

| Prefix                       | What they do                                                                      | Examples                                                     |
| ---------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `get_`                       | Read one record or status.                                                        | `get_health.py`, `get_transaction.py`, `get_trust_record.py` |
| `list_`                      | List records.                                                                     | `list_transactions.py`, `list_trust_records.py`              |
| `create_`, `propose_`        | Create a record, or propose a policy change.                                      | `create_transaction.py`, `propose_policy_change.py`          |
| `approve_`, `reject_`        | Approve or reject a proposed change. These need a step-up signing key, see below. | `approve_policy_change.py`, `reject_policy_change.py`        |
| `verify_`                    | Check a record.                                                                   | `verify_transaction.py`, `verify_audit_event.py`             |
| `trip_`, `reset_`, `record_` | Kill switch operations.                                                           | `trip_kill_switch.py`, `reset_kill_switch.py`                |

## Changes need care

Scripts that create, propose, approve, reject, trip, or reset change state on the server. Run them only against a server you are allowed to change. For a policy change, run the `propose_` script first, then the matching `approve_` script.

## Approvals need a signing key

The `approve_` and `reject_` scripts sign the step-up approval with a private key read from `step-up.private.pem` in the current directory, using the key ID `checker-step-up-1`. The key must belong to an approver your server trusts. Keep the private key out of version control.
