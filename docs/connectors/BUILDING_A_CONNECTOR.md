# Building a Connector for Parmana

The one guide for adding a connector, and for the other extension points around it. It replaces
the old connector build guide, the extending guide, the code review checklist, the connector FAQ,
the integration overview and the Slack connector page (all in git history). Every path below was
checked against the source on 2026-09-28. Read
[Connector Credential Isolation](../architecture/CONNECTOR_ISOLATION.md) first; this guide assumes
that architecture.

**Scope, precisely:** there is no dynamic registration. Adding a connector is a source change: new
files in the places below and one new entry in
`packages/api/src/bootstrap/createConnectorRegistry.ts`. No environment variable or plugin adds a
connector.

**Two things are called "connector".** `@parmana/connector-sdk` also ships generic reference mocks
(`SapConnector`, `OracleConnector` and others) that talk to no real system. The connectors the
default server registers in production (HubSpot, GitHub, Paytm, Slack) follow the pattern in this
guide: a passive `packages/connector-<name>/` package plus an executable adapter inside
`packages/execution-gateway/src/connector-execution/`.

## 1. The four pieces of an integration, and the order to build them

| Piece                                  | Answers                                            | Needed?                                                   |
| -------------------------------------- | -------------------------------------------------- | --------------------------------------------------------- |
| A policy bound to the capability       | Should this request be allowed?                    | Always                                                    |
| A caller (agent) with a scoped API key | Who may ask?                                       | Always                                                    |
| A connector for the capability         | Who performs the real action once approved?        | Always, for the action to happen                          |
| A `SignalStateVerifier`                | Are the caller's claims about the real world true? | Only when a false signal is a real risk (HubSpot has one) |

The pieces are decoupled on purpose, which is why "the agent got `APPROVED`" and "the action
happened" are separate, separately checkable facts. Build them in this order:

1. **Write the policy.** Everything else depends on the exact capability string and signal shape.
   See [Write your first policy](https://docs.parmanasystems.com/guides/write-your-first-policy).
2. **Onboard a caller and test authorization alone**, before any connector code:
   `npx tsx scripts/generate-api-key.ts --caller-id my-agent --allowed-capabilities "newpay:refund" --credential-holder-type SERVICE`.
   A `503 CONNECTOR_NOT_REGISTERED` after an `APPROVED` decision is expected at this stage: it
   shows authorization works and execution is not wired yet. See
   [CONNECTING_AN_AGENT.md](./CONNECTING_AN_AGENT.md).
3. **Build the connector** (sections 2 to 5 below).
4. **Add a `SignalStateVerifier` only if needed** (section 5).

What you see when a piece is missing:

| You have                 | Missing               | What happens                                                                                 |
| ------------------------ | --------------------- | -------------------------------------------------------------------------------------------- |
| Policy and caller key    | Connector             | `APPROVED`, then `503 CONNECTOR_NOT_REGISTERED` at dispatch                                  |
| Connector and caller key | Policy                | `404`, the request never reaches the connector                                               |
| Policy and connector     | Caller key or scope   | `401` with no key; `403 CAPABILITY_NOT_ALLOWED` when the key is not scoped to the capability |
| All three                | `SignalStateVerifier` | Works, but a caller that lies about a signal is believed; nothing checks it independently    |

## 2. The passive package: `packages/connector-<name>/`

Start narrow: one action on one object. HubSpot began with one deal update, not the whole API.

Every connector gets its own workspace package, like `@parmana/connector-hubspot`. Do not spread a
connector across `packages/connector-sdk` and loose bootstrap files; a package boundary keeps a
removal or a breaking change inside one folder. Copy `packages/connector-hubspot/package.json` and
`tsconfig.json` (name `@parmana/connector-<name>`, `private: true`, `type: module`, `main` and
`types` pointing at `./dist/`). Dependencies: `@parmana/connector-sdk`, `@parmana/crypto`,
`@parmana/shared`, `@parmana/policy`, plus `@parmana/approval`, `@parmana/envelope-verifier` or
`@parmana/execution-system` only if the state verifier needs them.

One file per responsibility in `src/`, using HubSpot's files as the reference:

- [ ] **`<Name>Capabilities.ts`**: capability constants named `"<name>:<verb>"` (for example
      `HUBSPOT_DEAL_UPDATE_CAPABILITY = "hubspot:deal-update"`, checked by
      `isNamespacedCapability`), the connector `Options` interface (`connectorId`, `capabilities`,
      optional `baseUrl` test seam) and parameter types. Metadata only, no execution.
- [ ] **`<Name>Types.ts`**: the vendor's wire types (only the fields you read or write), plus:
  - [ ] a **deny by default allowlist** of every field the action may write (for example
        `HUBSPOT_ALLOWED_DEAL_UPDATE_PROPERTIES`), the single source of truth for the guard and the
        request body;
  - [ ] a **test mode placeholder credential** constant, shaped like a real one with an obviously
        fake segment, so the adapter can refuse to send it to the real API;
  - [ ] a `<Name>CredentialValue` type and `is<Name>CredentialValue()` guard;
  - [ ] a `redact<Name>Token()` returning a one way truncated SHA-256 fingerprint (`fp_` plus 12
        hex characters), never a literal prefix of the secret.
- [ ] **`<Name>Metadata.ts`**: a `ConnectorMetadata` (`connectorId`, `displayName`, `version`,
      `health: healthyNow()`, `description`).
- [ ] **`Mock<Name>Server.ts`**: an in memory stand in for the vendor built on `node:http`, with
      auth header checks, routing for exactly the endpoints you use, and `setResponseDelayMs()` for
      timeout tests. No traffic beyond localhost.
- [ ] **`<Name><Action>Signals.ts`**: pure functions that build the signals the policy reads,
      including any arithmetic or lookup the policy engine cannot do (it compares one fact with one
      literal). Only include a `proposed*` field when the caller supplied it, so `boundSignals`
      compares like with like.
- [ ] **`<Name><Action>Receipt.ts`**: the receipt type and builder, hashed with
      `TrustRecordHasher`; only a redacted fingerprint, never the credential.
- [ ] **`<Name>CapabilityExecution.ts`**: one `execute<Name>Capability()` helper that signs a fresh
      authorization and submits it through the supplied `ExecutionSystem`. The action and the state
      verifier both use it, so the sign and execute shape exists once.
- [ ] **`<Name>SignalStateVerifier.ts`** (optional, section 5).
- [ ] **`index.ts`**: explicit named exports only, no `export *`. The executable adapter is not
      exported here: this package stays passive.

## 3. The adapter: `packages/execution-gateway/src/connector-execution/`

The executable class lives in `execution-gateway`, never in the connector package. Any other
package that implements `Connector` fails Invariant 2 of
[repository-invariants.md](../architecture/repository-invariants.md).

- [ ] **`Gateway<Name>Adapter.ts`** implements `Connector`
      (`packages/connector-sdk/src/ConnectorTypes.ts`):

  ```ts
  export interface Connector {
    readonly connectorId: string;
    readonly capabilities: ConnectorCapabilities;
    execute(
      request: ConnectorRequest,
      context: ConnectorExecutionContext,
    ): Promise<ConnectorResponse>;
  }
  ```

  `request` carries `capability`, `businessTransactionId`, `action`, `target` and `parameters`,
  exactly what was authorized. `context.credential` is an already resolved handle: read
  `context.credential.value`, never fetch a credential yourself. Before any network call, in this
  order:
  1. refuse a `request.capability` not in `this.capabilities`;
  2. refuse a credential that fails `is<Name>CredentialValue`;
  3. refuse the placeholder credential when `baseUrl` is the real vendor endpoint;
  4. refuse any parameter outside the allowlist (refuse, never silently drop);
  5. call with an `AbortController` bound to `context.timeoutMs`, fail closed on a non 2xx
     answer, a network error or a timeout, and put only the redacted fingerprint in the response
     metadata.

  Check the vendor's real error shape: Slack's `chat.postMessage` answers HTTP 200 even on
  failure, with `ok: false` in the body, so `GatewaySlackAdapter` parses the body and fails closed
  on `ok: false`. Outside `NODE_ENV=test`, require HTTPS at construction, as
  `GatewayPaytmAdapter` and `GatewaySlackAdapter` do.

- [ ] **`createGateway<Name>Connector.ts`**: a thin factory returning the `Connector` interface,
      never the class.
- [ ] Add both to `connector-execution/index.ts`, and export **only the factory** from
      `packages/execution-gateway/src/index.ts`. Never add `export * from
"./connector-execution/index.js"`. Add the factory name to `publicFactoryFiles` in
      `tests/architecture/execution-boundary.test.ts` and the class name to `internalSymbols` in
      `packages/execution-gateway/tests/unit/public-api-boundary.test.ts` (Invariant 7).

## 4. Wiring in `packages/api/src/bootstrap/`

- [ ] **`create<Name>CredentialProvider.ts`** returns `CredentialProvider | undefined`. Under
      `NODE_ENV=test`, read the test variable by its exact `.env.example` name (for example
      `TEST_HUBSPOT_PRIVATE_APP_TOKEN`), falling back to the placeholder; never add a second alias
      variable. In production, read the real variable; if it is unset, return `undefined` (no
      crash, no mock fallback).
- [ ] **`create<Name>Connector.ts`** delegates to `createGateway<Name>Connector`, with
      `<NAME>_BASE_URL` as a test seam that is never set in production.
- [ ] **`createConnectorRegistry.ts`**: mirror the HubSpot block. If the credential provider is
      `undefined`, `console.warn({ event: "<name>_connector_unavailable", reason: "..." })` and skip;
      otherwise push
      `{ connector, metadata, connectorIdentity: { connectorId: "<name>", publicIdentity: "spiffe://parmana/connectors/<name>", authenticationMetadata: {} }, credentialProvider, policy: new DefaultConnectorPolicy(authenticator, sessions), gatewayAuthentication, crypto, audit }`.
      Never set `legacyInsecure: true` on a production registration: without it every connector is
      wrapped in `SessionCredentialSecureConnector` automatically.
- [ ] **`createConnectorAuthenticator.ts`**: add the same `connectorId` and `publicIdentity` to the
      trusted identities.
- [ ] **`create<Name>SignalStateVerifier.ts`** (if you built one), wired into the
      `CompositeSignalStateVerifier([...])` in `packages/api/src/application.ts`. Sign its fetches
      with the key source `KEY_PROVIDER` selects (`SignerBootstrap.create()`, as
      `createExecutionGateway.ts` does), not `new FileKeyProvider()`: a verifier that always signs
      with the local file key disagrees with a gateway that verifies against KMS (G-72 in
      `docs/VERIFICATION-GAPS.md`). Copy `createHubSpotSignalStateVerifier.ts`: it passes
      `resolveSigner: lazySignerBootstrap()`, which resolves that `Signer` on first use.
- [ ] **`.env.example`**: a headed block for every new variable (production credential, test
      credential and its format, `ALLOW_LIVE_<NAME>=1`, `TEST_<NAME>_*` fixtures, the base URL
      seam). For a long lived static token, add a rotation date variable and a startup reminder
      like `warnIfHubSpotTokenStale.ts` (`HUBSPOT_PRIVATE_APP_TOKEN_ROTATED_AT`).

## 5. Policy, binding and independent checks

- [ ] **`policies/<policy-name>/1.0.0/policy.json`**: a `signalsSchema` listing every signal the
      rules read; `boundSignals` mapping every `proposed*` signal to its `parameters.*` field from
      the first version; every signal the rules read bound, declared in `approvalSignals`, or
      explained in `unboundSignalReasons` (the validator refuses the policy otherwise); and a last
      rule that rejects unconditionally (`"condition": { "always": true }`). Reference:
      `policies/hubspot-deal-update/1.1.0/policy.json`.
- [ ] **Every approve rule requires a signed human approval, reads included.** Declare one signal
      in `approvalSignals` (`resourceId`: `"target"` or a `parameters.*` path, and `value` for an
      amount) and require it with `is_true` as the rule's whole condition or directly inside its
      top level `all`. `PolicyValidator` refuses any other approve rule on load and on proposal
      (`docs/CLAIMS.md` 2.47, G-80). Give a read its own policy, like `github-pr-read` and
      `hubspot-deal-read`, so its approval names only what is read.
- [ ] **Bind the capability** in `CANONICAL_CAPABILITY_POLICY_BINDINGS`
      (`packages/capability-registry/src/CapabilityPolicyBinding.ts`). The binding fixes the policy
      **name**; where policy governance is enforced, the version in effect is the most recently
      approved one. `assertConnectorCapabilitiesBound.ts` refuses to start the server if a
      registered capability has no binding.
- [ ] **Approve the policy** through the maker and checker flow before production traffic, or
      every request is refused. See
      [Policy lifecycle and approvals](https://docs.parmanasystems.com/guides/policy-lifecycle-and-approvals).
- [ ] **A signal that means "a person approved this"** should not be a bare boolean the caller
      sets. Declare it in the policy's `approvalSignals`; the generic `ApprovalSignalVerifier`
      then requires a signed approval artifact in `signals.approvalArtifact`, checked against the
      value taken from the request, used once, and checked again at the gateway.
- [ ] **A `<Name>SignalStateVerifier`** implements `SignalStateVerifier` (`@parmana/policy`): it
      re-fetches the real state through `execute<Name>Capability` (never a direct `fetch()`,
      which Invariant 1 forbids) and returns a violation for each mismatch. A fetch error is a
      violation, never a pass.
- [ ] **No approve rule of a write capability may rest on caller facts alone** (G-77). An agent
      can be manipulated into declaring anything, and it can read the policy. Every approve rule
      must need, on every path, a fact declared in `approvalSignals` or one your verifier checks.
      Classify the capability as a read or a write in
      `packages/api/tests/unit/connector-policies-not-self-authorizing.test.ts`, and list the
      facts your verifier checks there; the test fails until you do.

## 6. Tests, in this order

1. **Hermetic, against `Mock<Name>Server`**, no real network:
   - in `packages/connector-<name>/tests/unit/`: the policy (schema, every rule branch, and that it
     loads under the `boundSignals` coverage check), the signal builders, and the state verifier;
   - in `packages/execution-gateway/tests/unit/`: the adapter itself (success, each guard before
     any network call, non 2xx and timeout failing closed, the credential never in an error or
     metadata, the placeholder guard). Reference:
     `packages/execution-gateway/tests/unit/hubspot-connector.test.ts`.
2. **A denial makes zero calls**, proven twice: at the adapter layer by checking the mock
   server's state is unchanged, and at the HTTP boundary in
   `packages/api/tests/integration/<name>-<action>.integration.test.ts` (status `403`, code
   `POLICY_DENIED`, and a `fetch` spy showing no call reached the mock). Reference:
   `packages/api/tests/integration/hubspot-deal-update.integration.test.ts`.
3. **A gated live suite last**: `packages/api/tests/integration/<name>-live.integration.test.ts`
   with a helper like `packages/api/tests/helpers/hubspot-live-availability.ts`, skipped unless
   `ALLOW_LIVE_<NAME>=1` and a format checked test credential are set. Prefer a reversible live
   action (read, nudge, verify, revert) so the suite can be rerun.

Do not re-test credential isolation: `SessionCredentialSecureConnector`'s own suite in
`packages/execution-control/tests/` covers every connector.

## 7. Migrations, only when needed

Most connectors need none; HubSpot has none. If you need durable state:

- `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`, a real UTC timestamp.
- Idempotent: `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`; to widen a `CHECK`, drop it
  if it exists and add it again.
- `ALTER TABLE <table> ENABLE ROW LEVEL SECURITY` with no policy, and say why in a comment.
- Run `npm run generate:migration-bundle` in the same commit: `scripts/apply-all-migrations.sql`
  is generated, and a test checks it is current.

No connector has webhooks today. The Razorpay webhook handling that did was removed on 2026-08-12
with the rest of that connector and is in git history.

## 8. The out of process pattern (Paytm)

When a vendor credential must never be reachable from Parmana's own process, the adapter forwards
to a separate service that holds the credential, as `GatewayPaytmAdapter` does for
`parmana-paytm-agent`. A shared secret alone is not enough on that wire: it proves the caller is
the gateway, not which parameters were approved, and the remote service is a public endpoint.
Sign a canonical string of the exact parameters with the gateway's key and have the remote
service verify it against `GET /keys/:keyId` before acting. See
`packages/connector-paytm/src/PaytmTypes.ts` (`canonicalPaytmAuthorizationString`,
`PAYTM_AUTHORIZATION_SIGNATURE_TTL_MS`) and [PAYTM_CONNECTOR.md](./PAYTM_CONNECTOR.md).

## 9. Review checklist

- [ ] Implements `Connector`, not `ConnectorExecutor` (`SdkConnectorExecutor` adapts for you).
- [ ] Registered in `createConnectorRegistry.ts`, identity added to
      `createConnectorAuthenticator.ts`, no `legacyInsecure` (check the diff, not the description).
- [ ] No import of `SessionCredentialVault` or other `@parmana/execution-control` credential types
      in the adapter.
- [ ] The policy decides scope; the adapter only adds defense in depth (allowlists), never
      re-decides amounts.
- [ ] Every guard in section 3 exists and is tested before any network call; non 2xx and
      timeouts fail closed; the credential never appears beyond a fingerprint.
- [ ] Capability bound, policy approved, factory exported, boundary test lists updated.
- [ ] Configuration documented, including what happens when it is absent (not registered, a
      warning, no crash).

## 10. Questions that come up

- **Do I wire credential isolation myself?** No. Every registration without `legacyInsecure` is
  wrapped in `SessionCredentialSecureConnector`, which issues a single use session credential
  and revokes it on every exit path.
- **How do I get the credential?** `context.credential.value` inside `execute()`, already
  resolved.
- **Can I disable isolation for a test?** `legacyInsecure: true` on a test registration only. It
  swaps in `InMemorySecureConnector` and drops the requirement for the shared
  `ExecutionAuditSink`, which every other registration must supply or the registry throws. On a
  real connector it is a defect.
- **Where do scope limits belong?** In the policy, which runs before the connector is called.

## 11. Other extension points

- **A new capability for an existing vendor:** add the constant and parameter type to the
  vendor's `<Name>Capabilities.ts` and `index.ts`, handle it in the existing adapter, list it in
  the connector's `connectorCapabilities([...])` at bootstrap, and bind it to a policy.
- **A policy with no new code:** a policy file under `policies/` (see `PARMANA_POLICY_DIR`) is
  data; `boundSignals` and `approvalSignals` are picked up automatically.
- **A custom pipeline stage:** implement `RuntimeComponent` and add it with
  `RuntimeBuilder.addStage(...)` (tutorials 15, 16 and 19). It must call the injected
  `ExecutionSystem` if it needs execution, never a connector (Invariant 3).

Never change these directly; each is protected by a test in
`tests/architecture/execution-boundary.test.ts` or the gateway's own tests:

| Component                                                    | Rule                                                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `RuntimeEngine` and `ExecutionTrustApplication` imports      | Never import `execution-gateway`, `connector-sdk` or `connector-hubspot` (Invariant 4)         |
| `ExecutionGateway.execute()` verification order              | Side effect free checks first, the nonce consumed last and only if all pass                    |
| `packages/api/src/routes/` and `packages/api/src/bootstrap/` | Routes call the application only; bootstrap composes and never calls `.execute(` (Invariant 5) |
| `packages/execution-gateway/src/index.ts`                    | Exports factories and interfaces only, never adapter or registry classes (Invariant 7)         |
| `connector.execute()` call sites                             | Only `ExecutionControlService` and `SdkConnectorExecutor` (Invariant 3)                        |
| Connector packages                                           | No `fetch()` (Invariant 1)                                                                     |

If one of these really must change, that is an architecture decision with an update to
`repository-invariants.md`, not a workaround.

## 12. CLAIMS.md for a new connector

Add one `## 3.<N> <Connector Name> (Scoped)` section. Claim in the present tense only what was run
and observed, cite exact files and tests, name what is out of scope, and say plainly when the live
suite was not run. This guide itself is never a claim.

## Reference implementations

- **HubSpot** (in process, has a state verifier): `packages/connector-hubspot/src/`,
  `GatewayHubSpotAdapter.ts`, `createHubSpotConnector.ts`, `createHubSpotCredentialProvider.ts`,
  `createHubSpotSignalStateVerifier.ts`.
- **GitHub** (in process, per execution installation token): `packages/connector-github/src/`,
  `GatewayGitHubAdapter.ts`, `createGitHubConnector.ts`, `createGitHubCredentialProvider.ts`.
- **Slack** (in process, a from scratch worked example, not a production capability):
  `packages/connector-slack/src/`, `GatewaySlackAdapter.ts`, `createSlackConnector.ts`,
  `createSlackCredentialProvider.ts`, policy `slack-post-message@1.1.0` (bound signal
  `channelId == intent.target`, a signed approval for the channel in `postApproved`, plus
  `contentApproved` and `channelAuthorized`),
  variables `SLACK_BOT_TOKEN`, `SLACK_BASE_URL` (test seam) and `TEST_SLACK_BOT_TOKEN`. It sends
  only `channel` and `text`, one message per approved transaction, and has no live suite. Since
  G-76 the server checks the channel itself: `SlackChannelSignalVerifier`
  (`createSlackChannelSignalVerifier.ts`) refuses a post unless `parameters.channel` equals the
  target and is in `SLACK_ALLOWED_CHANNEL_IDS`, and the adapter refuses a channel that is not the
  target. This is the pattern for a fact the server can check from its own configuration.
  Tutorials 111 (the caller side) and 112 (the connector end to end).
- **Paytm** (out of process): `packages/connector-paytm/src/`, `GatewayPaytmAdapter.ts`,
  [PAYTM_CONNECTOR.md](./PAYTM_CONNECTOR.md).
