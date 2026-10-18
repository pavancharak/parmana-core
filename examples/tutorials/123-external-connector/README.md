# Tutorial 123: External Connector

## Objective

Connect a system Parmana has no code for, an ERP here, as an external connector (ADR-0013): register it through maker checker, release an approved request to its endpoint as a signed release, and see the endpoint verify it with the SDK before acting.

## What You'll Learn

- **Step 1:** a maker proposes registering `erp:create-invoice` to `https://erp.example.com/parmana/release` with `POST /external-connectors/changes`. The maker cannot approve it (`403 SAME_ACTOR_CANNOT_APPROVE_OWN_CHANGE`); a checker approves it with a step up signature, and `GET /external-connectors` lists it as active.
- **Step 2:** the ERP runs the endpoint from `typescript/examples/07-external-connector-endpoint.ts`. It checks every release with `verifyParmanaRelease` against Parmana's public key and its own URL before it acts.
- **Step 3:** an approved request is released through the production Execution Control (`createExecutionControl`). The release names the endpoint as its audience, expires 60 seconds after it is issued, lists the approver, and is signed with the server's `default` key. The ERP creates one invoice.
- **Step 4:** the same release is sent again, as Parmana does after a timeout. The ERP answers with its first result and creates nothing more.
- **Step 5:** an endpoint registered at another URL refuses the release, because its audience is not that endpoint.
- **Step 6:** the registration is revoked through maker checker. The next request is refused with `CONNECTOR_NOT_REGISTERED`, and nothing reaches the ERP.

The tutorial starts from an approved authorization. How a request is decided, with the policy the registration names at the version approved through policy governance and a signed human approval, is shown in Tutorials 103, 104 and 119.

One thing differs from production: the ERP runs on this machine, so the release travels over plain HTTP to `127.0.0.1`. In production the adapter resolves the registered host, refuses any address that is not public, connects over HTTPS to the address it checked, and follows no redirect.

## Running the Tutorial

```bash
npx tsx examples/tutorials/123-external-connector/run.ts
```

## Why This Matters

Before ADR-0013, connecting a new system meant changing Parmana's code: a connector package, a gateway adapter and several bootstrap files. With an external connector the operator registers an endpoint instead, two people approve it, and Parmana still releases only what a person approved, signed and addressed to that one endpoint. The endpoint keeps its own credentials; Parmana holds none of them.

The same endpoint in Python is `python/examples/13_external_connector_endpoint.py`, with `verify_parmana_release`.
