# Enforcing the Parmana gateway path

Status: operator guide. Scope: a business endpoint that Parmana releases actions to through a connector.

## Goal

A business endpoint should run an action only when Parmana has approved it and released it through the connector. Parmana cannot enforce this alone. The endpoint's owner must enforce it at three points: network reachability, credentials, and release verification.

## Requirements

### 1. Network: only the connector reaches the endpoint

- Restrict the endpoint so that only the connector's network address or private link can reach it. Deny agents, other services, and the public internet.
- Do not expose a second route to the same operation, such as a legacy URL, an internal proxy, or a debug port.
- Set `PARMANA_RELEASE_ONLY=true` on the connector service. It refuses the bearer token plus signed authorization path, so the only accepted request is a signed release from parmana-core. It requires `PARMANA_RELEASE_AUDIENCE`, and the service will not start without it.

### 2. Credentials: only the connector holds them

- Issue the endpoint's credentials to the connector alone. No agent, script, or developer environment should hold a credential the endpoint accepts.
- Scope each credential to one operation and one audience where the endpoint supports it.
- Store the credential in a secret manager reachable only by the connector's runtime. Rotate it on a schedule and after any suspected exposure.

### 3. Release verification: the endpoint refuses anything without a valid release

The connector must check each signed release before it calls the endpoint. In `parmana-connect` these checks run in `src/external-release.ts`:

- **Signature**: verified against the Parmana public key the operator has pinned, not a key taken from the release itself. Set `PARMANA_EXPECTED_KEY_FINGERPRINT` to the `sha256:` fingerprint confirmed through a second channel. The service refuses to start if the key does not match. Without this pin, a replaced key file is not detected.
- **Audience**: the release names this connector.
- **Expiry**: the release has not expired.
- **Replay**: the release has not been used before. A repeated transaction ID is refused. Keep `PARMANA_NONCE_STORE=postgres`, which is the default, and point every instance at the same database. The `memory` store protects one instance only: a release replayed to a second instance would run again.

The endpoint should refuse any request that did not come through the connector. Where the endpoint can check a connector-issued credential or a connector identity, require it on every call.

The release-only setting is not enough alone. Keep the endpoint's own credentials out of every other system, so that no route other than the connector can reach it.

## Limits

These gaps remain. Do not rely on this guide alone where they matter.

- **Same-host credential exposure (G-128).** Code on the same host that can read the server's environment can still read connector credentials.
- **Inbound agents (G-129).** Agents run by customers or partners that call your systems directly are not covered by Parmana. See RFC-0024.
- **Connector behaviour.** A compromised connector can act within its own authority. Parmana limits what a release may authorize; it does not inspect what the connector does with the endpoint.
- **Shared credentials.** If any other route can use the endpoint's credentials, the lock fails at that route.
- **Release-only is opt-in.** `PARMANA_RELEASE_ONLY` defaults to `false`, so existing deployments keep the bearer path until the operator turns it on.

## Bypass test: run before go-live

From the agent's environment, and from every other environment that can reach the network, attempt the following:

1. Call the endpoint directly with every credential the agent or other services can read, including a valid bearer token with a valid signed authorization. Expected: refused with 403, and the endpoint's upstream receives no call.
2. Call the endpoint's operation without a Parmana release. Expected: refused.
3. Replay a valid release a second time. Expected: refused by the connector.
4. Present a release signed by a key other than the pinned one. Expected: refused.
5. Present an expired release. Expected: refused.
6. Present a release for a different connector audience. Expected: refused.

Record each result. A single success in steps 1 to 6 means the path can be bypassed, and go-live should wait for a fix.

## Monitoring

Alert on any call to the endpoint that does not carry a Parmana release reference. Treat it as a bypass attempt until shown otherwise.

## Related

- [BUILDING_A_CONNECTOR.md](BUILDING_A_CONNECTOR.md)
- [CONNECTING_AN_AGENT.md](CONNECTING_AN_AGENT.md)
- [VERIFICATION-GAPS.md](../VERIFICATION-GAPS.md)
- [RFC-0024-Inbound-Agent-Authorization.md](../rfcs/RFC-0024-Inbound-Agent-Authorization.md)
