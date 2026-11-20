# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose a source
import os
import json
import urllib.request


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/sources",
        data=json.dumps(json.loads(r'{"name":"erp-ledger","dataOwner":"Finance","signer":{"kind":"system"},"keyId":"erp-2026-01","publicKeyPem":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----","claims":{"invoiceAmount":"INR"},"canApprove":true}')).encode('utf-8'),
        method="POST",
        headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
