# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Register an action
import json
import os
import urllib.request

BODY = r'{"capability":"erp:pay-invoice","owner":"Finance","successor":"Finance Controller","reviewers":["reviewer-1"],"review":{"reviewWindowBusinessDays":2,"approvalValidityMinutes":120}}'


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/actions",
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
