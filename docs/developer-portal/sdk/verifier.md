# Offline verifier: `@parmana/verifier` and `parmana-verifier`

[SDKs](README.md) · [Evidence verification](../security/evidence-verification.md) · [TypeScript SDK](typescript.md) · [Python SDK](python.md)

Use this when you need to check an Execution Trust Record **without trusting the Parmana server and without the Parmana SDK**: an auditor, a regulator, a second team, or a CI job. It needs a record file and a trust file that lists the public keys you accept. It makes no network calls and has no dependencies.

|          |                                                                                        |
| -------- | -------------------------------------------------------------------------------------- |
| Packages | `@parmana/verifier` (npm, 2.0.3) · `parmana-verifier` (PyPI, 2.0.3)                    |
| Command  | `parmana-verify` (both packages)                                                       |
| Runtime  | Node.js 24 or later (npm). Python with `cryptography` 48 or later for ML-DSA-65 (PyPI) |
| Status   | **Implemented.** Its test suite passed 108 of 108 in this verification.                |

## Install

```bash
npm install -g @parmana/verifier@2.0.3     # or run without installing: npx @parmana/verifier@2.0.3 ...
pip install "parmana-verifier==2.0.3"
```

Check the command (the npm package's `--help` prints its usage and exits with code 2, which is its usage code):

```bash
npx @parmana/verifier@2.0.3 --help
```

## Usage

```bash
parmana-verify <proof.json> <trust.json>        # verify a record
parmana-verify key-fingerprint <public-key.pem> # print the sha256 fingerprint to pin
```

`proof.json` is the Execution Trust Record. `trust.json` is the trust set.

Exit codes: `0` valid, `1` invalid (the reasons are in the output), `2` usage error, missing file, or invalid JSON.

The output is one line of JSON:

```json
{
  "valid": true,
  "coverage": "legacy",
  "errors": [],
  "checks": { "trustRecordHash": true, "signature": true },
  "correspondence": {
    "status": "passed",
    "executions": [{ "executionId": "…", "result": { "status": "passed" } }]
  }
}
```

- `valid`: the record passes every check that applies.
- `coverage`: `"full"` when a schema version 3 envelope verifies, otherwise `"legacy"`.
- `checks`: each check that ran. `hybridSignatures` appears when the record carries a hybrid envelope.
- `correspondence`: whether what was dispatched matches what was authorized. It does not change `valid` or the exit code. Read it with `valid`.

## The trust file

```json
{
  "allowLegacyV2": false,
  "allowLegacyOnly": false,
  "keys": [
    {
      "keyId": "default",
      "algorithm": "ed25519",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n",
      "fingerprint": "sha256:<64 hex digits>",
      "validFrom": "2026-01-01T00:00:00.000Z",
      "validUntil": null,
      "compromised": false
    }
  ]
}
```

| Field                            | Meaning                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `keys[].keyId`                   | The key id the record names in its signature.                                                                                               |
| `keys[].algorithm`               | `ed25519` or `dilithium3` (ML-DSA-65). Must match the record's signature algorithm.                                                         |
| `keys[].publicKeyPem`            | The public key.                                                                                                                             |
| `keys[].fingerprint`             | The SHA-256 of the key's SPKI DER encoding, `sha256:` plus 64 hex digits. The verifier refuses a key whose PEM does not hash to this value. |
| `keys[].validFrom`, `validUntil` | The key is used only for records created in this window. `validUntil` may be `null`.                                                        |
| `keys[].compromised`             | `true` rejects every signature this key made, whatever the timestamp.                                                                       |
| `allowLegacyV2`                  | Accept a schema version 2 or unversioned record. Default `false`.                                                                           |
| `allowLegacyOnly`                | Accept a record with no hybrid envelope. Default `false`.                                                                                   |
| `hybridRequiredFrom`             | A UTC instant. Records created at or after it must carry a valid hybrid envelope.                                                           |

The full format is in the verifier repository's `docs/FORMAT.md`.

### Pin the key

A signature proves only that the holder of a key made it. Before you trust a key, get its PEM and its fingerprint from the operator through a second channel, then compare:

```bash
parmana-verify key-fingerprint operator-public-key.pem
# sha256:…  ← compare character by character with the value the operator gave you
```

Only add the key to your trust file once the two match.

### Default trust rules: why a record can be refused

With the defaults, the verifier refuses a record that is schema version 2 or unversioned, and refuses a record with no hybrid envelope. The error names the setting that would accept it. **By default, the server produces schema version 2 records with a single signature.** A default trust file therefore refuses them. You must decide to accept them by setting `allowLegacyV2` and `allowLegacyOnly`. The verification in this portal did exactly that, and the script comments say so: [`verify-standalone.sh`](../examples/governed-quickstart/verify-standalone.sh). A schema version 3 hybrid record needs no legacy settings: it verified under the default rules in this portal (see [Security](../security/README.md#schema-versions-and-coverage)).

## Verified behaviour

These results come from the verification for this portal:

| Check                                                       | Result                                                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Test suite (`npm test` in the verifier repository)          | 108 of 108 passed                                                            |
| Governed record, single signature, with the legacy settings | `valid: true`, exit 0                                                        |
| The same record with one covered field changed              | `valid: false`, `trustRecordHash mismatch`, exit 1                           |
| Hybrid record (ed25519 + dilithium3), with `allowLegacyV2`  | `valid: true`, `hybridSignatures: true`, exit 0                              |
| Hybrid record with a covered field changed                  | `valid: false`, hash and both signatures fail, exit 1                        |
| Governed record with the default trust rules                | `valid: false`, refused with the reason and the setting that would accept it |

## Use it from code

The SDKs have the same check built in. Use the SDK function when your code already depends on the SDK. Use the standalone verifier when it must not depend on Parmana code.

- TypeScript: `verifyExecutionTrustRecordOffline(record, publicKeys)` from `@parmana/sdk`.
- Python: `verify_execution_trust_record_offline(record, public_keys)` from `parmana.crypto`.

The SDK functions report `valid` and `coverage`, but they do not apply the standalone verifier's refuse-by-default rule. Check `coverage` in your code. See [Evidence verification](../security/evidence-verification.md).

## Limits

- The verifier checks what the record says and what the keys you trust signed. It does not check that the business action happened, or that the connector did what the record says. Use the correspondence report and the connector's own records for that.
- The verifier cannot tell you that a key is authentic. The fingerprint check does that, and only if you compare against a value from a source you trust.
- Post-quantum (`dilithium3`) verification needs Node.js 24 with OpenSSL 3.5 or later. On an older runtime the record is reported invalid, with the reason, and the command exits 1. It does not crash.
