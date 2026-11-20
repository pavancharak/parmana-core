# Tutorials

[Portal home](../README.md) · [Getting started](../getting-started.md) · [SDKs](../sdk/README.md)

Each tutorial follows one integration from start to finish. For each one it says who does what: your application, the SDK, the Parmana service, and the business system. Every tutorial links to code in [`../examples/`](../examples/README.md), and says how that code was verified.

Start with [Getting started](../getting-started.md) so you have a running local server. Then pick the tutorial that matches your task.

| Tutorial                                                      | You will                                                                                                                 | Verification                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| [Node.js integration](nodejs-integration.md)                  | Add Parmana to an existing Node.js service: install, sign an approval, execute, verify.                                  | Run: `governed-flow.ts`, `declare-then-execute.ts`                                                                 |
| [Python integration](python-integration.md)                   | The same integration in Python.                                                                                          | Run: `governed_flow.py`. Python test suite: 208 of 208 passed                                                      |
| [Fintech integration](fintech-integration.md)                 | Gate vendor payments on verified facts, a limit, and a human approval.                                                   | Run: `governed-flow.ts`, `limits.ts`                                                                               |
| [Refund authorization](refund-authorization.md)               | Refuse refunds the payment source does not confirm, and require a manager's approval for the exact amount.               | Decision logic run in tutorial 129 (examples runner, passed). Not run against a live server with a payment source. |
| [Maker-checker approval](maker-checker.md)                    | Require a second person to approve each policy change, with a step-up signature.                                         | Run: tutorial 103 (HTTP), `governed-flow.ts`, and the `parmana-ops` CLI flow                                       |
| [Transaction limit enforcement](transaction-limits.md)        | Refuse any execution above the approved amount, or above the policy's risk threshold.                                    | Run: `limits.ts`, all three cases refused                                                                          |
| [AI agents](ai-agents.md)                                     | Let an agent request actions, with the policy and a human approver deciding.                                             | Refusal without approval run (tutorial 120, examples runner). Agent pattern run with the SDK (`governed-flow.ts`). |
| [Evidence verification](../security/evidence-verification.md) | Generate an Execution Trust Record and verify it, by the server, with the SDK offline, and with the standalone verifier. | Run: `governed-flow.ts`, `verify-standalone.sh`, `rest-smoke.sh`                                                   |

## How the tutorials are verified

- **Run** means the code was executed against a local server started from this repository, and the output is recorded in [COVERAGE.md](../COVERAGE.md).
- **Examples runner** means `npm run examples` in the repository, which ran 116 examples and exited 0.
- **Test suite** means the named repository tests. The Python suite passed 208 of 208. The TypeScript SDK's own examples integration test passed 3 of 3.

Where a tutorial describes something that was not run, the tutorial says so in its verification line.

## Before you start

- The server must be running. Start it with the [setup script](../getting-started.md#3-start-a-local-server).
- The policy version in effect must be the one your request names. A version that has been superseded is refused. See [Policy management](../policies/README.md#versions-and-the-version-in-effect).
- Each tutorial that uses an approval assumes the approver's key exists locally. The setup script creates a test key. In production, the approver is a different person with their own key.
