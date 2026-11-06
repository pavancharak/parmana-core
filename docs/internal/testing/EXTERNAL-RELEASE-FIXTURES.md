# External release fixtures

parmana-connect verifies releases that parmana-core signs. Its tests check those releases against
fixtures stored in `tests/fixtures/parmana-core/`. This page says what the fixtures are, how they
are produced, and when to regenerate them.

The generator is `scripts/generate-external-release-fixtures.ts`. Its tests are in
`scripts/tests/generate-external-release-fixtures.test.ts`.

## Why the fixtures exist

parmana-connect must accept what parmana-core actually signs and refuse what it does not. A
fixture is a release, produced the way parmana-core produces one, and then checked by
parmana-connect's verifier. If the verifier and the signer disagree on the bytes or the rules, the
fixture tests fail.

The releases must look like real ones. parmana-connect now refuses a release whose lifetime is
longer than 60 seconds, matching `EXTERNAL_RELEASE_TTL_MS` in
`packages/execution-gateway/src/connector-execution/GatewayExternalAdapter.ts`. An earlier fixture
had an expiry in 2099. It was refused, correctly, because no real release lasts that long. The
generator replaces it with a 60-second window.

## What the generator produces

Running it writes three files to the output directory:

| File                      | Contents                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| `core-release-small.json` | A release of about 550 bytes, signed raw.                          |
| `core-release-large.json` | A release of about 5,000 bytes, signed as a commitment (ADR-0010). |
| `core-public-key.txt`     | The Ed25519 public key that verifies both, as a PEM.               |

Each release file has the same shape as a real release: `release`, `signature` (algorithm
`ed25519`, keyId `default`), `bytes`, and `commitment`. The fields in `release` match
`GatewayExternalAdapter`'s release body.

Before writing, the generator checks each release:

- its lifetime is greater than zero and at most `EXTERNAL_RELEASE_TTL_MS`;
- its signature verifies under the public key it writes;
- the small release is raw and the large one is a commitment.

If any check fails, it writes nothing and exits with an error.

Output is deterministic. The timestamps are fixed (`issuedAt` 2026-10-29T05:59:30Z, `expiresAt`
2026-10-29T06:00:30Z), and the key is derived from a fixed label. Two runs produce byte-identical
files, and a test checks this.

## The test key

The signing key is not a secret. It is derived from this public label:

    parmana-test-only external release key v1

The seed is the SHA-256 of that label, used as an Ed25519 private key. Anyone can reproduce it.

That is deliberate, and it is safe only because production does not trust it:

- parmana-connect pins the expected key fingerprint in production with
  `PARMANA_EXPECTED_KEY_FINGERPRINT`. Startup refuses a different key.
- Nothing in parmana-core's production signing path uses this key. It exists only in the script.

Do not add this key to any production configuration, and do not use it to sign anything except
test fixtures. A release signed with it would verify wherever the public key is trusted.

## How to regenerate

From the root of `parmana-core`:

```powershell
npx tsx scripts/generate-external-release-fixtures.ts <output-dir>
```

Then copy the three files into parmana-connect:

```powershell
Copy-Item <output-dir>\* D:\last\parmana-connect\tests\fixtures\parmana-core\
```

Then run parmana-connect's tests:

```powershell
npx vitest run tests/core-fixtures.test.ts
```

Commit the three files in parmana-connect. Commit only them, and check `git status` first.

## When to regenerate

Regenerate when one of these changes:

- the 60-second lifetime in `EXTERNAL_RELEASE_TTL_MS`;
- the canonical serialization of a release (`CanonicalSerializer`);
- the commitment form for releases over 4096 bytes (`SignatureCommitment`);
- a field of the release body in `GatewayExternalAdapter`.

The public key depends only on the label, so regenerating never changes it. If the label changes,
the public key changes too, and parmana-connect's fixtures must be regenerated in the same change.

## What the tests check

`scripts/tests/generate-external-release-fixtures.test.ts` runs the script into a temporary
directory and checks:

1. each release's lifetime is greater than zero and within `EXTERNAL_RELEASE_TTL_MS`;
2. the small release is signed raw and the large one as a commitment;
3. each signature verifies under the written public key;
4. two runs produce identical files.

parmana-connect's `tests/core-fixtures.test.ts` checks the other direction: that its verifier
accepts these releases, and refuses tampered ones.

## Limits

- The fixtures prove that parmana-connect's verifier agrees with the signing format parmana-core
  uses. They do not prove that parmana-core's production signer produces these exact bytes. That
  would need a run against a live parmana-core, which is open as G-133 in the verification gap
  log.
- The test key is public. A test that treats a release signed with it as trusted would pass for
  the wrong reason. Keep the production fingerprint pin in place.
- The generator uses the `EXTERNAL_RELEASE_TTL_MS` constant from `GatewayExternalAdapter`. If that
  constant moves, the import path in the script must change with it.
