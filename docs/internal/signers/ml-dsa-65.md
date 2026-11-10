# ML-DSA-65 (FIPS 204, post-quantum) on its own

**Production ready: no.** It is built and tested, but not deployed and not broadly available.

## What it is

ML-DSA-65 is a post-quantum signature scheme (FIPS 204). It is implemented by `Dilithium3SignatureProvider` and selected with `PRIMARY_SIGNATURE_PROVIDER` (claim 2.14). The `ml-dsa-65` name is accepted as an alias for the internal `dilithium3` name.

## Status

- **Built:** yes.
- **Tested:** yes in CI. The provider and cross-instance suites run on CI's Node 24.22.2 runner. In the local sandbox (Node 22) they skip, with the reason shown.
- **In production:** no. Ed25519 is the only signer in production (claim 3.13).
- **Broadly available:** no. The roadmap says ML-DSA-65 "is not yet broadly available" (`docs/site/roadmap.mdx`).

## Requirements

- Node.js 24 or later, for native `ml-dsa-65` support in `node:crypto` (claim 2.14).
- The same PEM key mechanism as Ed25519: `FileKeyProvider`, key ID `default`.

## Why it is not production ready

1. **Not deployed.** Nothing in production signs with it.
2. **Node 24 requirement.** The production runtime must be upgraded and confirmed before it can run ML-DSA-65.
3. **No migration path.** The roadmap lists "re-key Ed25519 to ML-DSA-65, verify old records" as a roadmap item. `AuthorizationVerifier` supports exactly one configured algorithm, so an old-to-new switch is not built.
4. **Verifier coverage.** Not checked for single-algorithm ML-DSA-65 records in this review. Confirm it before a third party relies on them. See [schema-version-3-and-verifier.md](schema-version-3-and-verifier.md).

## How to make it production ready

1. Upgrade the production runtime to Node 24, and confirm `ml-dsa-65` is available at startup.
2. Generate the production ML-DSA-65 key pair (`scripts/generate-keypair.ts --algorithm ml-dsa-65`, see claim 2.14) and store it under the same custody as the Ed25519 key.
3. Build the migration path from the roadmap: re-keying, and verifying records signed before the switch.
4. Run a staging deployment with `PRIMARY_SIGNATURE_PROVIDER` set to ML-DSA-65, and verify records offline with the public key.
5. Agree a cutover record and update this file.

## When

The repo sets no date. Steps 1 to 5 are the gate. Hybrid (see [hybrid.md](hybrid.md)) is the more likely first step, because it keeps Ed25519 as a check.
