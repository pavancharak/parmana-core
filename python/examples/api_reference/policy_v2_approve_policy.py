# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Approve a policy version
import os
import urllib.request


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/policies/erp:pay-invoice/2.0.0/approve",
        data=None,
        method="POST",
        headers={"Authorization": f"Bearer {os.environ.get('PARMANA_API_KEY', '')}"},
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
