# Tutorial 118: the HubSpot state check signs with the configured key

## Objective

Show a bug fixed on 2026-09-28 and its fix. Before a `hubspot:deal-update` is authorized,
`HubSpotSignalStateVerifier` fetches the real deal through the gateway, and that fetch
carries its own signed authorization. Production wiring signed it with the local key file
(`new FileKeyProvider()`) whatever `KEY_PROVIDER` said, so under `KEY_PROVIDER=aws-kms` the
gateway, which verifies against the KMS key, refused the fetch, and every
`hubspot:deal-update` was refused with it. It failed closed, so nothing unsafe ran, but the
capability could not work.

## What you'll learn

- The verifier now takes `resolveSigner`, a function returning a `Signer` (ADR-0009). A
  `Signer` signs without releasing its private key, so it works for AWS KMS as well as
  local key files.
- `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts` resolves the `Signer`
  that `SignerBootstrap` selects from `KEY_PROVIDER`, the same one
  `RuntimeAuthorizationSigner` and the gateway use, on first use. A failed resolution is
  not cached, so the next check tries again, and each check fails closed until then.
- The `keys` option (a `KeyProvider` that reads a raw private key) stays for tests and
  tutorials that use local keys. The verifier refuses to be built with neither or both.

## Run

```bash
npx tsx examples/tutorials/118-hubspot-verifier-signer/run.ts
```

It is also part of `npm run examples`. Hermetic: an in memory `Signer` that never
releases its key stands in for KMS, and a stub gateway really checks each signature.

## Expected output

Scenario 1 (the old wiring) reports one violation, `hubspot:deal-fetch`, because the
gateway rejected the signature. Scenario 2 (the fix) reports none, with one signature made
by the KMS style `Signer`.

## Code

- `packages/connector-hubspot/src/HubSpotSignalStateVerifier.ts`
- `packages/connector-hubspot/src/HubSpotCapabilityExecution.ts`
- `packages/api/src/bootstrap/createHubSpotSignalStateVerifier.ts`
- Tests: `packages/connector-hubspot/tests/unit/HubSpotSignalStateVerifier.signer.test.ts`,
  `packages/api/tests/unit/bootstrap/create-hubspot-signal-state-verifier.test.ts`

## Related

[Tutorial 114, signing and verification must agree on one key source](../114-signing-verification-key-agreement/README.md)
fixed the same class of bug in the gateway itself.
