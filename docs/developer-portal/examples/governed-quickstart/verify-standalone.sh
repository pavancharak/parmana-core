#!/usr/bin/env bash
# Governed quickstart, step 3: verify the saved Execution Trust Record with the
# standalone, dependency-free verifier (@parmana/verifier, published on npm),
# without the Parmana SDK and without contacting the server.
#
# It pins the deployment's public key by its SHA-256 fingerprint, writes a trust
# file, verifies the record, then verifies a copy that has been changed.
#
# Requires the record written by typescript/governed-flow.ts (or python/governed_flow.py).
# Node.js 24 or later. Test configuration only.
set -euo pipefail

CONFIG_DIR="${GOVERNED_CONFIG_DIR:-$HOME/.parmana/governed-quickstart}"
VERIFIER="@parmana/verifier@2.0.3"
PEM="$CONFIG_DIR/keys/default.public.pem"
RECORD="$CONFIG_DIR/governed-record.json"
TRUST="$CONFIG_DIR/trust-standalone.json"
TAMPERED="$CONFIG_DIR/governed-record-tampered.json"

if [[ ! -f "$RECORD" ]]; then
  echo "No record at $RECORD. Run the governed flow first." >&2
  exit 2
fi

# 1. Pin the key. In production, compare this fingerprint with one you got from
#    the operator through a second channel before you trust the key.
FINGERPRINT="$(npx --yes "$VERIFIER" key-fingerprint "$PEM")"
echo "pinned key fingerprint: $FINGERPRINT"

# 2. Write the trust file. allowLegacyV2 and allowLegacyOnly are set explicitly
#    because this build signs schema version 2 records (see the security docs).
node -e '
  const fs = require("fs");
  const [pem, fingerprint, out] = process.argv.slice(1);
  const trust = {
    allowLegacyV2: true,
    allowLegacyOnly: true,
    keys: [{
      keyId: "default",
      algorithm: "ed25519",
      publicKeyPem: fs.readFileSync(pem, "utf8"),
      fingerprint,
      validFrom: "2026-01-01T00:00:00.000Z",
      validUntil: null,
      compromised: false,
    }],
  };
  fs.writeFileSync(out, JSON.stringify(trust, null, 2));
' "$PEM" "$FINGERPRINT" "$TRUST"

# 3. Verify the record as written.
echo ""
echo "== record as written (expect valid: true, exit 0)"
npx --yes "$VERIFIER" "$RECORD" "$TRUST" && echo "exit 0"

# 4. Change one covered field and verify again (expect valid: false, exit 1).
node -e '
  const fs = require("fs");
  const [src, out] = process.argv.slice(1);
  const r = JSON.parse(fs.readFileSync(src, "utf8"));
  r.transaction.intent.parameters.amount = 999999;
  fs.writeFileSync(out, JSON.stringify(r, null, 2));
' "$RECORD" "$TAMPERED"
echo ""
echo "== record with the amount changed (expect valid: false, exit 1)"
if npx --yes "$VERIFIER" "$TAMPERED" "$TRUST"; then
  echo "UNEXPECTED: the changed record verified" >&2
  exit 1
else
  echo "exit $? (rejected, as expected)"
fi
