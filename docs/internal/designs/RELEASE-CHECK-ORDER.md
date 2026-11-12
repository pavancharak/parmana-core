# Release check order: review before any change

Status: review, not a change. Nothing in this document alters the release path. A decision by the repository owner is needed before any code changes.

Related: `docs/guides/enforcement-path.md` (section 6, and next-steps item 2), `packages/execution-control/src/ExecutionControlService.ts`, `packages/api/src/bootstrap/createReleaseVerifier.ts`.

## The current order

`ExecutionControlService.execute` runs these steps for each release, in this order:

1. **Release verifier** (`verifyRelease`). Checks the signature and expiry, that the decision is `APPROVED`, and that the executable content matches the signed hash. It consumes the nonce last.
2. **Gateway authentication** (`authenticateGateway`). Checks the attestation the Gateway minted for this authorization.
3. **Connector lookup** (`registry.resolveCapability`). Finds the connector registered for the action. An unregistered action fails here with `ConnectorNotRegisteredError` (503).
4. **Session and audit.** Creates the one-time Gateway session and records it.
5. **Connector call.**

The Gateway also checks the signature, expiry, policy binding, signals, grants, revocations and the nonce before it reaches this path (`ExecutionGateway.verify`). The release verifier repeats the authenticity checks as defence in depth against a caller that holds the Gateway attestation.

## The problem

Step 1 consumes the nonce. Step 3 then refuses a request for an unregistered action. The authorization is spent, so a corrected registration cannot release it. The caller must request a new decision. The refusal is now recorded as `failed` (#585), so it is visible, but it is still unrecoverable.

The check that fails in step 3 does not depend on the signature. Moving the lookup earlier would let an unregistered action be refused before the nonce is used.

## Proposed order (for review)

1. Gateway authentication.
2. Connector lookup.
3. Release verifier, which consumes the nonce.
4. Session, audit, and the connector call.

The authenticity checks stay before any side effect. Only the order of the two non-consuming checks changes.

## Threats

- **Unauthenticated probing of registrations.** Under the proposed order, a caller who lacks a valid attestation can learn whether an action is registered, because the lookup runs before the release verifier. Today the verifier runs first, so an unauthenticated caller gets only the verifier's refusal. The mitigation is that step 1, gateway authentication, runs before the lookup in the proposed order. A caller without the attestation is refused at step 1 and learns nothing about the registry.
- **Attestation holders.** A caller who holds the attestation has already passed authentication. Learning which actions are registered is a small disclosure that they could learn from a request anyway.
- **Forged releases.** A forged release fails the verifier, which now runs after the lookup. A forged request for an unregistered action therefore gets `ConnectorNotRegisteredError` before the signature is checked. The Gateway's own verification runs first, so a forged request is still refused before it reaches this path. This needs a test before any change.
- **Nonce semantics.** An unregistered action no longer burns its nonce, so a retry after a registration is allowed. This changes what the outcome record means for that case, and the failed-state handling from #585 must still apply to any refusal after the nonce is consumed.

## What a change would need

- Tests that show a forged request for an unregistered action is refused by the Gateway before this path, and that an unauthenticated caller learns nothing about the registry.
- A test that a corrected registration lets the same authorization release.
- An update to `enforcement-path.md` section 6 and to next-steps item 2.

## Decision for the owner

- **Option A (recommended): reorder** as proposed, after the threat tests exist.
- **Option B: keep the order** and document that an unregistered action spends its authorization, with the refusal recorded as `failed`.
