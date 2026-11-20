# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Read the register audit log
import os
import urllib.request


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/audit",
        data=None,
        method="GET",
        headers={
            "Authorization": "Bearer " + os.environ.get("PARMANA_API_KEY", ""),
        },
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
