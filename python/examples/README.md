# Python examples

Runnable examples for the Python SDK. Install the SDK first:

```bash
pip install parmana
```

Then open the folder that matches what you want to see.

| Folder                                       | What it shows                                                                                               |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [quickstart](quickstart/README.md)           | Submit one Business Transaction and print the signed Execution Trust Record. Start here.                    |
| [builder](builder/README.md)                 | The same flow with `create_business_transaction()`, which fills in the IDs for you.                         |
| [verify](verify/README.md)                   | Verify a transaction with both verification calls, then read back the latest result.                        |
| [content_binding](content_binding/README.md) | Resubmit a changed payload under the same transaction ID, and what the server does. Read its warning first. |
| [api_reference](api_reference/README.md)     | One short script for each HTTP endpoint the SDK calls.                                                      |
