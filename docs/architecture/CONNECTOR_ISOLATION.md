# Connector Credential Isolation

**Status:** Verified against source, 2026-08-24. Every code reference below was read directly, not
assumed — see the file paths and interface names cited throughout.

## Overview

Parmana's marketing claim is: _"The agent does not get direct authority to move money."_

That guarantee is real, and it is enforced structurally, not by convention: a connector never
receives a raw, long-lived credential, and it never talks to a credential store directly. The
isolation boundary is applied by a wrapper the connector registry chooses, not by code the
connector author writes.

## How it actually works

### The registry wraps every connector automatically

`GatewayConnectorRegistry.register()` (`packages/execution-gateway/src/connector-execution/GatewayConnectorRegistry.ts`)
is the single place that decides how a connector's credential is resolved. For every
registration it constructs a `SdkConnectorExecutor` (the adapter, see below) and then chooses
one of two wrappers:

- **Default (every production connector):** `SessionCredentialSecureConnector` — session-scoped,
  single-use, time-bounded credential resolution.
- **`legacyInsecure: true` only:** `InMemorySecureConnector` — resolves a raw credential directly
  from a `CredentialVault`, no session, no expiry, no per-execution audit requirement.

```ts
// GatewayConnectorRegistry.ts, register(), abridged (real source)
if (options.legacyInsecure === true) {
  secureConnector = new InMemorySecureConnector({ /* raw CredentialVault */ });
} else {
  if (options.audit === undefined) {
    throw new Error(
      `Connector "${connectorId}" registration requires an ExecutionAuditSink ... ` +
      `unless legacyInsecure: true is explicitly set.`,
    );
  }
  secureConnector = new SessionCredentialSecureConnector({ sessionCredentials, executor, audit, ... });
}
```

`legacyInsecure` is documented in its own type (`ConnectorRegistrationOptions.legacyInsecure`,
same file) as: _"For tests only — every production connector goes through the default,
session-credential path."_ Nothing in `packages/api/src/bootstrap/createConnectorRegistry.ts` —
the real production registry composition — sets this flag for HubSpot, GitHub, or the
`test-fixture` connector. All three get isolation for free.

**This means the risk model is the opposite of "developers might forget to wire isolation in."**
Isolation is on by default and can only be turned off by explicitly setting a flag whose own doc
comment says not to use it in production, and which throws at registration time if you try to
skip the accompanying audit-sink requirement without it.

### What the wrapper actually does

`SessionCredentialSecureConnector.execute()` (`packages/execution-control/src/SessionCredentialSecureConnector.ts`):

1. `policy.assertAllowed(request, this, gatewayAuthentication)` — capability/policy check.
2. `sessionCredentials.issue(connectorId, authorizationId)` — mints a single-use,
   time-bounded `SessionCredential` (an opaque lease, no secret material).
3. `sessionCredentials.consume(sessionCredentialId)` — the _only_ point where the real
   `ExecutionCredential` is resolved, fresh, from the underlying `CredentialVault`. Consuming
   twice, after expiry, or after revocation all throw.
4. `executor.execute(request.executableContent, credential)` — hands the resolved credential to
   the connector adapter for exactly this one call.
5. `sessionCredentials.revoke(sessionCredentialId)` in a `finally` — destroyed on every exit
   path: success, executor failure, or a policy rejection that happened after issuance.

### The `SessionCredentialVault` interface — no scope parameter

```ts
// packages/execution-control/src/SessionCredentialVault.ts (real source)
export interface SessionCredentialVault {
  issue(
    connectorId: string,
    authorizationId: string,
  ): Promise<SessionCredential>;
  consume(sessionCredentialId: string): Promise<ExecutionCredential>;
  revoke(sessionCredentialId: string): Promise<void>;
}
```

There is no `scope`/`amount` argument anywhere in this interface. The vault's job is strictly
**single-use + time-bounded + revocable** credential leasing. It has no concept of "what this
credential is allowed to do" — that's a different layer entirely (next section).

### Layer responsibilities

| Layer                                   | Responsibility                                                                                                                                                                | Real source                                                                        |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `PolicyEngine.evaluate()`               | Scope/amount/action rules (`PolicyCondition`: `fact`/`operator`/`value`, `all`/`any`/`always`) — decides whether the action is allowed **before** any authorization is signed | `packages/policy/src/PolicyEngine.ts`                                              |
| `RuntimeEngine` / `AuthorizationSigner` | Signs the approved decision into a `SignedExecutionAuthorization`                                                                                                             | `packages/runtime/src/RuntimeEngine.ts`                                            |
| `ExecutionGateway`                      | Independently re-verifies the envelope (signature, expiry, TTL, content hash) before releasing to execution-control                                                           | `packages/execution-gateway/src/ExecutionGateway.ts`                               |
| `SessionCredentialSecureConnector`      | Credential lifecycle only: issue → consume → revoke, single-use, time-bounded                                                                                                 | `packages/execution-control/src/SessionCredentialSecureConnector.ts`               |
| `SdkConnectorExecutor`                  | Adapts the internal `ExecutableContent`/`ExecutionCredential` shape into the SDK's `ConnectorRequest`/`ConnectorExecutionContext` and calls the connector                     | `packages/execution-gateway/src/connector-execution/SdkConnectorExecutor.ts`       |
| Connector (`Connector` interface)       | Executes one namespaced capability against the real backend, using an already-resolved `CredentialHandle` it never had to fetch itself                                        | e.g. `packages/execution-gateway/src/connector-execution/GatewayHubSpotAdapter.ts` |

Scope/amount enforcement is upstream of the vault, in `PolicyEngine`, confirmed structurally:
`RuntimeEngine.execute()` calls `PolicyEngine.evaluate()` and only proceeds to sign an
authorization on `APPROVE` — the vault and the connector never see a request that hasn't already
passed policy.

### Architecture diagram

```
Agent / caller request
    |
    v
PolicyEngine.evaluate()              <- scope, amount, action rules (packages/policy)
    | [APPROVE]
    v
RuntimeEngine -> AuthorizationSigner  <- signs SignedExecutionAuthorization
    |
    v
ExecutionGateway.execute()            <- independent re-verification (signature/expiry/hash)
    |
    v
ExecutionControlService.execute()     <- resolves connector via ConnectorRegistry.resolveCapability()
    |
    v
SecureConnector (chosen at registration time)
    |
    +-- legacyInsecure: true  -> InMemorySecureConnector -> raw CredentialVault.getCredential()
    |
    +-- default (production)  -> SessionCredentialSecureConnector
                                     |
                                     v
                              sessionCredentials.issue()
                                     |
                                     v
                              sessionCredentials.consume()  <- only place the real credential is read
                                     |
                                     v
                              SdkConnectorExecutor.execute(content, credential)
                                     |
                                     v
                              Connector.execute(ConnectorRequest, ConnectorExecutionContext)
                                     |
                                     v
                              sessionCredentials.revoke()   <- finally, every exit path
```

## What a connector actually receives

Connectors implement the SDK's `Connector` interface
(`packages/connector-sdk/src/ConnectorTypes.ts`), **not** `ConnectorExecutor` directly —
`ConnectorExecutor` is execution-control's internal interface; `SdkConnectorExecutor` is the
adapter that implements it on behalf of any `Connector`.

```ts
// packages/connector-sdk/src/ConnectorTypes.ts (real source)
export interface Connector {
  readonly connectorId: string;
  readonly capabilities: ConnectorCapabilities;
  execute(
    request: ConnectorRequest,
    context: ConnectorExecutionContext,
  ): Promise<ConnectorResponse>;
}

export interface ConnectorRequest {
  readonly capability: ConnectorCapability;
  readonly businessTransactionId: string;
  readonly action: string;
  readonly target: string;
  readonly parameters: Readonly<Record<string, unknown>>;
}

export interface ConnectorExecutionContext {
  readonly credential: CredentialHandle; // opaque, already resolved
  readonly timeoutMs: number;
  readonly requestedAt: Date;
}

export interface ConnectorResponse {
  readonly success: boolean;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
```

The doc comment on `Connector` in that file states the property this document is about,
verbatim: _"Connectors NEVER evaluate policy, authorize execution, interpret AI output, perform
business decisions, or resolve credentials. They ONLY validate requests, execute operations using
an already-resolved credential, and return a deterministic response."_

## Implications for connector authors

**Automatic, by construction:**

- Every connector registered through the standard path (`createConnectorRegistry.ts` →
  `createGatewayConnectorRegistry`) is wrapped in `SessionCredentialSecureConnector`.
- You cannot silently lose isolation — the only opt-out (`legacyInsecure: true`) is a named flag
  that also requires you to _not_ supply the required `ExecutionAuditSink`, which is itself an
  explicit, reviewable choice, not a default.

**Not your job as a connector author:**

- Calling `SessionCredentialVault` — you never see it. You receive a `CredentialHandle` via
  `ConnectorExecutionContext.credential`.
- Enforcing scope/amount limits — `PolicyEngine` has already run before your `execute()` is ever
  called.
- Managing session lifetime — the wrapper issues, consumes, and revokes around your call.

**Your job:**

- Implement `Connector.execute(request, context)` correctly for your backend.
- Declare capabilities (namespaced verbs, e.g. `hubspot:deal-update`) via `ConnectorCapabilities`.
- Return an accurate `ConnectorResponse`.

See [BUILDING_A_CONNECTOR.md](../connectors/BUILDING_A_CONNECTOR.md) for the concrete steps, and
[Roadmap](../site/roadmap.mdx) for the current, explicit scope limit: adding a new connector is a
bootstrap source change today (there is no dynamic registration path), not something a deployer
can configure at runtime.
