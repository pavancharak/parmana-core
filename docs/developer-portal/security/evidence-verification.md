# Evidence verification

[Security](README.md) · [Offline verifier](../sdk/verifier.md) · [TypeScript SDK](../sdk/typescript.md) · [Python SDK](../sdk/python.md)

This page is for the person who needs to check an Execution Trust Record: an auditor, a second team, a regulator, or your own CI. You can do it without Parmana's server, without the Parmana SDK, and without trusting whoever gave you the file. You need three things: the record, the public keys you trust, and a tool.

Every command below was run in the verification for this portal, against a record produced by the governed flow.

## What verification proves, and what it does not

| Verification proves                                                                                            | Verification does not prove                                                                     |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| The covered fields of the record are unchanged since it was signed.                                            | That the business action happened as recorded. Check the connector's own records for that.      |
| The record was signed by a key you trust, at a time within that key's validity window.                         | That the key belongs to whom it claims. Pin it through a second channel.                        |
| For schema 3: every top-level field except the signatures and the verification and receipt lists is unchanged. | Anything about the uncovered fields of a schema 2 record. See coverage below.                   |
| The dispatched content matches what was authorized (the correspondence report).                                | That the policy was the right policy. Policy review is a human decision, through maker-checker. |

## Step 1: get the record

Get the Execution Trust Record for the business transaction. It is the JSON that `POST /execute`, `GET /trust-records/{businessTransactionId}` or `client.execute()` returned. Keep the file exactly as you received it. Changing any covered value breaks verification. Re-formatting alone does not, because the signature is over canonical JSON (sorted keys, no whitespace).

```bash
curl -s -H "Authorization: Bearer $PARMANA_API_KEY" \
  "$PARMANA_API_URL/trust-records/$TXN_ID" > record.json
```

## Step 2: pin the keys you trust

A trust file lists the public keys you accept. Each key is pinned by its fingerprint. The fingerprint must come from a source other than the one that gave you the key.

1. Get the operator's public key PEM. For the local run it is `keys/default.public.pem` in the configuration directory. For a real deployment, the operator publishes it.
2. Compute its fingerprint:

   ```bash
   npx --yes @parmana/verifier@2.0.3 key-fingerprint default.public.pem
   # the output for the local run's key looks like: sha256:60fb0c839fc647914f397bcbe35e99c012d582a718bcaa38e6fa0b46349fe1ab
   ```

3. Compare that value with the fingerprint the operator gave you, through a second channel (a signed message, or a call to a known number). Compare character by character. If they differ, stop.
4. Write the trust file with the key and its fingerprint.

```json
{
  "keys": [
    {
      "keyId": "default",
      "algorithm": "ed25519",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----\n…\n-----END PUBLIC KEY-----\n",
      "fingerprint": "sha256:60fb0c839fc647914f397bcbe35e99c012d582a718bcaa38e6fa0b46349fe1ab",
      "validFrom": "2026-01-01T00:00:00.000Z",
      "validUntil": null,
      "compromised": false
    }
  ],
  "hybridRequiredFrom": "2026-11-01T00:00:00Z"
}
```

Set `hybridRequiredFrom` to the time from which your deployment signs with a hybrid envelope (schema 3). Records created at or after that time must carry it, so a stripped record is refused. A trust file for a deployment with only schema 2 records needs the legacy settings described in step 3.

Set `compromised: true` on a key that has been compromised. Then every signature it made is rejected, whatever the timestamp.

## Step 3: verify with the standalone verifier

```bash
npx --yes @parmana/verifier@2.0.3 record.json trust.json
```

The output is one line of JSON. Read `valid`, `coverage` and `errors`:

```json
{"valid":true,"coverage":"full","errors":[],"checks":{"trustRecordHash":true,"signature":true,"hybridSignatures":true},"correspondence":{"status":"passed","executions":[…]}}
```

| Output                               | Meaning                                                                                         |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `valid: true`, `coverage: full`      | A schema 3 record. Every top-level field except the excluded lists is covered, and it verified. |
| `valid: true`, `coverage: legacy`    | A schema 2 record. Only the seven covered fields are protected (see below).                     |
| `valid: false`                       | The record did not verify. `errors` says why. Do not rely on it.                                |
| `correspondence.status: passed`      | Every execution's dispatched content matches the authorization.                                 |
| `correspondence.status: failed`      | A field differs or is missing: a mismatch. Act on it.                                           |
| `correspondence.status: not_checked` | Nothing was compared. This is not a mismatch, and it is never reported as passed.               |

Exit codes: `0` valid, `1` invalid, `2` usage error.

### Schema 2 records: the defaults refuse them, on purpose

The default configuration of this build produces schema 2 records with one signature. The verifier refuses those by default, and names the setting that accepts them. To accept a schema 2 record, you must set both settings in the trust file, knowingly:

```json
{ "allowLegacyV2": true, "allowLegacyOnly": true, "keys": [ … ] }
```

With those settings, a schema 2 record is accepted with `coverage: legacy`. **Know what that means.** The signature covers only `trustRecordId`, `businessTransactionId`, `transaction`, `authorization`, `overrides`, `executions` and `createdAt`. A change to `updatedAt`, `evidenceAnchor`, `verifications` or `receipts` is not detected. This was reproduced in this portal: changing `updatedAt` left `valid: true`.

Prefer schema 3 for records you must rely on. See [Security: schema versions and coverage](README.md#schema-versions-and-coverage).

### Tamper check

Run the same check on a copy with one covered field changed. It must fail:

```bash
node -e 'const fs=require("fs");const r=JSON.parse(fs.readFileSync("record.json","utf8"));
r.transaction.intent.parameters.amount=999999;fs.writeFileSync("record-tampered.json",JSON.stringify(r,null,2));'
npx --yes @parmana/verifier@2.0.3 record-tampered.json trust.json   # expect valid: false, exit 1
```

Verified: the tampered copy returned `valid: false`, `trustRecordHash mismatch`, and exit 1.

The repository script [`verify-standalone.sh`](../examples/governed-quickstart/verify-standalone.sh) does steps 2 to 3 and this tamper check in one run.

## Step 4: verify in code (optional)

The SDKs provide the same check. Use them when your code already depends on the SDK.

**TypeScript:**

```typescript
import { readFileSync } from "node:fs";
import { verifyExecutionTrustRecordOffline } from "@parmana/sdk";

const record = JSON.parse(readFileSync("record.json", "utf8"));
const result = verifyExecutionTrustRecordOffline(record, {
  default: readFileSync("default.public.pem", "utf8"),
});
console.log(result.valid, result.coverage, result.errors);
if (!result.valid) throw new Error("record did not verify");
if (result.coverage !== "full")
  console.warn("schema 2 record: uncovered fields are not protected");
```

**Python:**

```python
import json
from pathlib import Path
from parmana.crypto import verify_execution_trust_record_offline

record = json.loads(Path("record.json").read_text())
result = verify_execution_trust_record_offline(record, {"default": Path("default.public.pem").read_text()})
print(result.valid, result.coverage, result.errors)
```

Both were run in this verification on schema 2 and schema 3 records, and gave the same results as the standalone verifier. The SDK functions report `valid: true` for a schema 2 record without the legacy settings, because they do not apply the verifier's refuse-by-default rule. **Check `coverage` in your code** if you need full coverage.

## Step 5: read the correspondence report

The `correspondence` field answers a different question: did what was dispatched match what was authorized? For each execution, the verifier compares the authorization's nonce, business transaction hash, policy content hash and authority grant with the execution's correspondence fields, and compares the dispatched content hash with the authorized one.

- `passed`: every field is present and matches.
- `failed`: a field is missing or differs. A mismatch.
- `not_checked`: nothing to compare, for example because the record does not embed its authorization. Not a mismatch.

The report does not change `valid`. Read it together with `valid`.

## Step 6: server checks (optional, when you have a key)

The server can repeat checks on a record it stores. These are useful for operations, and they are not independent evidence, because the server is the party that holds the record.

| Route                                         | What it does                                                                     | Verified                            |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------- |
| `POST /verify`                                | Checks the stored record. Returns `VERIFIED` or `FAILED`.                        | Yes: `VERIFIED`                     |
| `POST /replay`                                | Checks the stored hash and signature again. Runs no policy and executes nothing. | Yes: `verified: true`               |
| `POST /receipt`                               | Issues a signed receipt for a `VERIFIED` record.                                 | Yes: `200`, `409` when not verified |
| `GET /receipt/latest/{businessTransactionId}` | Returns the latest receipt.                                                      | Yes                                 |

## Keep the evidence

For each record you rely on, keep together:

- the record JSON, unchanged,
- the trust file you verified it with, and the fingerprint comparison you made,
- the verification output (`valid`, `coverage`, `correspondence`),
- the date you verified it.

A later verification with the same trust file and record gives the same answer. That is the point of keeping the inputs.

## Troubleshooting verification

| Symptom                                             | Cause                                                                           | Fix                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `schemaVersion 2 … refused by default`              | The record is schema 2, and the trust file does not accept it.                  | Set `allowLegacyV2` and `allowLegacyOnly` knowingly, or use a schema 3 record. |
| `record has no hybrid envelope`                     | Single-signature record, and `allowLegacyOnly` is not set.                      | As above.                                                                      |
| `signature verification failed for keyId "default"` | The record was signed by a different key, or it was changed.                    | Check the key's fingerprint, and check the record was not altered.             |
| `trustRecordHash mismatch`                          | A covered field was changed, or the record was reformatted with changed values. | Use the original record.                                                       |
| No key matches the record's signature               | The record names a key id that your trust file does not list.                   | Add the key, pinned by its fingerprint, after you have compared it.            |
| `ML-DSA … needs Node 24 or later`                   | A hybrid record on an older runtime.                                            | Use Node.js 24 with OpenSSL 3.5 or later.                                      |

More are in [Troubleshooting](../troubleshooting/README.md).
