# EXPERIMENTAL Policy version 2. Available only where the deployment enables it.
# Amazon SES posts this; clients do not call it
import json
import urllib.request

BODY = r'{"Type":"Notification","Message":"{}"}'


def main() -> None:
    request = urllib.request.Request(
        "https://parmana-api-real.vercel.app/v2/notifications/ses",
        data=json.dumps(json.loads(BODY)).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(request) as response:
        print(response.status, response.read().decode("utf-8"))


if __name__ == "__main__":
    main()
