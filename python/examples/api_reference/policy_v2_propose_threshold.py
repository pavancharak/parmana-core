# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Propose a threshold
import json
import os
import urllib.request

BODY = r'{"action":"erp:pay-invoice","name":"max-amount","value":5000,"unit":"INR","owner":"Finance","reason":"Limit payments without review","evidence":"Policy memo 2026-11","nextReview":"2027-05-01","highValue":true}'


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/register/thresholds",
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
