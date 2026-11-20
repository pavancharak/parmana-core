# Runnable examples

[Portal home](../README.md) · [Getting started](../getting-started.md) · [Tutorials](../tutorials/README.md)

These examples are the code the portal's tutorials point to. They run against a local Parmana server that you start from this repository, with test configuration. Each one was run for this portal, and the table says how.

Run everything from the repository root.

## Set up once

```bash
npm ci
npm run build
node docs/developer-portal/examples/governed-quickstart/setup.mjs   # writes keys, policies and caller keys to ~/.parmana/governed-quickstart
bash ~/.parmana/governed-quickstart/start-server.sh                 # leave it running in its own terminal
```

Then, in a second terminal, run the examples in this order. Each one notes the policy version it expects.

## The examples

| File                                                                                                               | What it does                                                                                                                                                                                                                | Policy version                                       | Run here                                          |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------- |
| [`governed-quickstart/setup.mjs`](governed-quickstart/setup.mjs)                                                   | Writes the local configuration (keys, policies, caller keys) and prints the server start command. Refuses to overwrite an existing directory.                                                                               | n/a                                                  | Yes                                               |
| [`governed-quickstart/typescript/governed-flow.ts`](governed-quickstart/typescript/governed-flow.ts)               | Maker proposes `vendor-payment@2.1.0`; the maker's self-approval is refused; the checker approves with a step-up envelope; the demo caller executes; the record is verified by the server and offline; a repeat is refused. | Approves `2.1.0`                                     | **Yes, passed**                                   |
| [`governed-quickstart/python/governed_flow.py`](governed-quickstart/python/governed_flow.py)                       | The same flow with the Python SDK.                                                                                                                                                                                          | Approves `2.1.0`                                     | **Yes, passed**                                   |
| [`governed-quickstart/typescript/declare-then-execute.ts`](governed-quickstart/typescript/declare-then-execute.ts) | Declares a transaction, reads its status, executes it, and reads the status after.                                                                                                                                          | Set with `GOVERNED_POLICY_VERSION` (default `2.1.0`) | **Yes, passed** with `2.1.1`                      |
| [`governed-quickstart/typescript/approval-cases.ts`](governed-quickstart/typescript/approval-cases.ts)             | Five approval cases: no approval; an expired approval; an approval for another target; a transaction declared without its approval; the same declared with it. Four are refused, one is approved.                           | `GOVERNED_POLICY_VERSION`                            | **Yes**, with `2.1.1`: A to D refused, E approved |
| [`governed-quickstart/typescript/limits.ts`](governed-quickstart/typescript/limits.ts)                             | Three refusals: amount above the approval; risk above the policy limit; a bound amount that differs from the request.                                                                                                       | `GOVERNED_POLICY_VERSION`                            | **Yes**, all three refused                        |
| [`governed-quickstart/typescript/make-transaction.ts`](governed-quickstart/typescript/make-transaction.ts)         | Writes a Business Transaction as JSON, with a signed approval, for curl or for the REST smoke test. `--no-approval` writes one the server refuses.                                                                          | `GOVERNED_POLICY_VERSION`                            | Yes (used by `rest-smoke.sh`)                     |
| [`governed-quickstart/rest-smoke.sh`](governed-quickstart/rest-smoke.sh)                                           | Sends each REST request in the [endpoint page](../api/endpoints.md) with curl, and checks the status code against the documented one.                                                                                       | `GOVERNED_POLICY_VERSION`                            | **Yes, 27 of 27 passed** with `2.1.1`             |
| [`governed-quickstart/verify-standalone.sh`](governed-quickstart/verify-standalone.sh)                             | Pins the server's key by fingerprint, writes a trust file, verifies the saved record with the published `@parmana/verifier@2.0.3`, and rejects a copy with one amount changed.                                              | n/a (needs a record from `governed-flow.ts`)         | **Yes**, valid then rejected                      |

## Policy version

The server executes only the version in effect, which is the one most recently approved for the policy name. `governed-flow.ts` approves `2.1.0`. The maker-checker CLI flow in the [CLI page](../sdk/cli.md#the-maker-checker-flow-with-the-cli) approves `2.1.1`. Once `2.1.1` is approved, a request that names `2.1.0` is refused as superseded, and the examples above need `GOVERNED_POLICY_VERSION=2.1.1`.

Restarting the server clears every approval, so run `governed-flow.ts` again after a restart.

## Environment variables the examples read

| Variable                  | Default                          | Meaning                                       |
| ------------------------- | -------------------------------- | --------------------------------------------- |
| `GOVERNED_CONFIG_DIR`     | `~/.parmana/governed-quickstart` | The directory `setup.mjs` wrote.              |
| `GOVERNED_POLICY_VERSION` | `2.1.0`                          | The version in effect that the requests name. |
| `PARMANA_ENDPOINT`        | `http://localhost:3000`          | The server.                                   |
| `PARMANA_API_URL`         | `http://localhost:3000`          | Used by `rest-smoke.sh`.                      |

## What is not here

- The **refund** flow (tutorial 129) runs in the repository's examples runner, with an in-process payment source. It is documented in [Refund authorization](../tutorials/refund-authorization.md), and is not repeated here.
- The **Python LLM tool-call example** (`python/examples/10_llm_tool_call.py`) is in the repository and was not run for this portal.
- **Connectors** (`parmana-connectors`) and their signal sources were not run here.

## Running against your own deployment

These examples send their keys to the server you point them at. They are for a local server with test configuration. To use them against a deployment, change `PARMANA_ENDPOINT` to an `https://` endpoint, replace the caller key with one your operator issued, and do not run `setup.mjs` there: it creates test approver keys, which a deployment must not trust. The approver's key belongs to the approver.
