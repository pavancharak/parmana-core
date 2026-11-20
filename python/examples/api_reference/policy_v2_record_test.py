# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Record a passed test tier
import json
import os
import urllib.request


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/actions/erp:pay-invoice/tests",
        data=json.dumps(json.loads(r'{"tier":"tier-1"}')).encode("utf-8"),
        method="POST",
        headers={
            "Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
