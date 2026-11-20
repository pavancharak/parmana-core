# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Record a decision
import os
import json
import urllib.request


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/decisions",
        data=json.dumps(json.loads(r'{"capability":"erp:pay-invoice","transactionId":"txn-1001","target":"invoice-7781","parameters":{"amount":1200},"signals":{"vendorVerified":true}}')).encode('utf-8'),
        method="POST",
        headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
