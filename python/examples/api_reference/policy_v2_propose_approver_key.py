# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose an approver key
import json
import os
import urllib.request

BODY = r'{"approverId":"approver-7","keyId":"key-2026-01","publicKeyPem":"-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA...\n-----END PUBLIC KEY-----"}'


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/approver-keys",
        data=json.dumps(json.loads(BODY)).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": "Bearer " + os.environ.get("PARMANA_API_KEY", ""),
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
